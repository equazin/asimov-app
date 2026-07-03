import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

interface ReportPeriod {
  dateFrom: string;
  dateTo: string;
}

interface SalesReport {
  period: ReportPeriod;
  totalSales: number;
  totalInvoices: number;
  totalByType: Record<string, { count: number; total: number }>;
  topClients: Array<{ clientId: string; businessName: string; total: number; count: number }>;
  topProducts: Array<{ productId: string; name: string; qty: number; total: number }>;
  dailyTotals: Array<{ date: string; total: number; count: number }>;
}

interface StockReport {
  totalProducts: number;
  totalValue: number;
  lowStockCount: number;
  byCategory: Array<{ category: string; count: number; value: number }>;
  byWarehouse: Array<{ warehouseId: string; name: string; totalItems: number; totalValue: number }>;
}

interface AccountReport {
  totalReceivable: number;
  totalPayable: number;
  clientBalances: Array<{ clientId: string; businessName: string; balance: number }>;
  supplierBalances: Array<{ supplierId: string; businessName: string; balance: number }>;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async salesReport(tenantId: string, period: ReportPeriod): Promise<SalesReport> {
    const dateFrom = new Date(period.dateFrom);
    const dateTo = new Date(period.dateTo);

    const documents = await this.prisma.document.findMany({
      where: {
        tenantId,
        createdAt: { gte: dateFrom, lte: dateTo },
        type: { in: ['invoice', 'sale_order', 'quote'] },
      },
      include: {
        client: { select: { id: true, businessName: true } },
        items: { include: { product: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const totalByType: Record<string, { count: number; total: number }> = {};
    const clientTotals: Record<string, { businessName: string; total: number; count: number }> = {};
    const productTotals: Record<string, { name: string; qty: number; total: number }> = {};
    const dailyMap: Record<string, { total: number; count: number }> = {};

    let totalSales = 0;

    for (const doc of documents) {
      const total = doc.total.toNumber();
      totalSales += total;

      const type = doc.type;
      if (!totalByType[type]) totalByType[type] = { count: 0, total: 0 };
      totalByType[type].count++;
      totalByType[type].total += total;

      if (doc.client) {
        const cid = doc.client.id;
        if (!clientTotals[cid]) clientTotals[cid] = { businessName: doc.client.businessName, total: 0, count: 0 };
        clientTotals[cid].total += total;
        clientTotals[cid].count++;
      }

      for (const item of doc.items) {
        if (item.product) {
          const pid = item.product.id;
          if (!productTotals[pid]) productTotals[pid] = { name: item.product.name, qty: 0, total: 0 };
          productTotals[pid].qty += item.qty.toNumber();
          productTotals[pid].total += item.subtotal.toNumber();
        }
      }

      const day = doc.createdAt.toISOString().slice(0, 10);
      if (!dailyMap[day]) dailyMap[day] = { total: 0, count: 0 };
      dailyMap[day].total += total;
      dailyMap[day].count++;
    }

    return {
      period,
      totalSales,
      totalInvoices: documents.length,
      totalByType,
      topClients: Object.entries(clientTotals)
        .map(([clientId, v]) => ({ clientId, ...v }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10),
      topProducts: Object.entries(productTotals)
        .map(([productId, v]) => ({ productId, ...v }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10),
      dailyTotals: Object.entries(dailyMap)
        .map(([date, v]) => ({ date, ...v }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  async stockReport(tenantId: string): Promise<StockReport> {
    const products = await this.prisma.product.findMany({
      where: { tenantId, active: true, deletedAt: null },
      include: {
        stockLevels: {
          include: { warehouse: { select: { id: true, name: true } } },
        },
      },
    });

    let totalValue = 0;
    let lowStockCount = 0;
    const categoryMap: Record<string, { count: number; value: number }> = {};
    const warehouseMap: Record<string, { name: string; totalItems: number; totalValue: number }> = {};

    for (const product of products) {
      const cost = product.costPrice.toNumber();

      for (const stock of product.stockLevels) {
        const qty = stock.qty.toNumber();
        const value = qty * cost;
        totalValue += value;

        if (qty <= stock.minQty.toNumber() && stock.minQty.toNumber() > 0) {
          lowStockCount++;
        }

        const wid = stock.warehouse.id;
        if (!warehouseMap[wid]) warehouseMap[wid] = { name: stock.warehouse.name, totalItems: 0, totalValue: 0 };
        warehouseMap[wid].totalItems += qty;
        warehouseMap[wid].totalValue += value;
      }

      const cat = product.category ?? 'Sin categoría';
      if (!categoryMap[cat]) categoryMap[cat] = { count: 0, value: 0 };
      categoryMap[cat].count++;
      categoryMap[cat].value += product.stockLevels.reduce(
        (sum, s) => sum + s.qty.toNumber() * cost,
        0,
      );
    }

    return {
      totalProducts: products.length,
      totalValue,
      lowStockCount,
      byCategory: Object.entries(categoryMap)
        .map(([category, v]) => ({ category, ...v }))
        .sort((a, b) => b.value - a.value),
      byWarehouse: Object.entries(warehouseMap)
        .map(([warehouseId, v]) => ({ warehouseId, ...v }))
        .sort((a, b) => b.totalValue - a.totalValue),
    };
  }

  async accountReport(tenantId: string): Promise<AccountReport> {
    const [clientBalances, supplierBalances] = await Promise.all([
      this.prisma.$queryRaw<Array<{ clientId: string; businessName: string; balance: number }>>`
        SELECT c.id as "clientId", c."businessName",
               COALESCE(SUM(am.amount), 0) as balance
        FROM clients c
        LEFT JOIN account_movements am ON am."referenceId" = c.id AND am."tenantId" = c."tenantId"
        WHERE c."tenantId" = ${tenantId} AND c.active = true AND c."deletedAt" IS NULL
        GROUP BY c.id, c."businessName"
        HAVING COALESCE(SUM(am.amount), 0) != 0
        ORDER BY balance DESC
      `,
      this.prisma.$queryRaw<Array<{ supplierId: string; businessName: string; balance: number }>>`
        SELECT s.id as "supplierId", s."businessName",
               COALESCE(SUM(am.amount), 0) as balance
        FROM suppliers s
        LEFT JOIN account_movements am ON am."referenceId" = s.id AND am."tenantId" = s."tenantId"
        WHERE s."tenantId" = ${tenantId} AND s.active = true AND s."deletedAt" IS NULL
        GROUP BY s.id, s."businessName"
        HAVING COALESCE(SUM(am.amount), 0) != 0
        ORDER BY balance DESC
      `,
    ]);

    const totalReceivable = (clientBalances as Array<{ balance: number }>)
      .filter((c) => c.balance > 0)
      .reduce((sum, c) => sum + Number(c.balance), 0);

    const totalPayable = (supplierBalances as Array<{ balance: number }>)
      .filter((s) => s.balance > 0)
      .reduce((sum, s) => sum + Number(s.balance), 0);

    return {
      totalReceivable,
      totalPayable,
      clientBalances: clientBalances as Array<{ clientId: string; businessName: string; balance: number }>,
      supplierBalances: supplierBalances as Array<{ supplierId: string; businessName: string; balance: number }>,
    };
  }

  async exportCsv(
    tenantId: string,
    entity: string,
    filters: Record<string, string>,
  ): Promise<string> {
    switch (entity) {
      case 'clients': {
        const clients = await this.prisma.client.findMany({
          where: { tenantId, active: true, deletedAt: null },
          orderBy: { businessName: 'asc' },
        });
        const header = 'Código,Razón Social,CUIT,Tipo Fiscal,Email,Teléfono,Ciudad,Provincia\n';
        const rows = clients.map((c) =>
          `"${c.code}","${c.businessName}","${c.cuit}","${c.fiscalType}","${c.email}","${c.phone}","${c.city}","${c.province}"`,
        );
        return header + rows.join('\n');
      }

      case 'products': {
        const products = await this.prisma.product.findMany({
          where: { tenantId, active: true, deletedAt: null },
          orderBy: { name: 'asc' },
        });
        const header = 'Código,Código Barras,Nombre,Unidad,Categoría,Precio Venta,Precio Costo,IVA %\n';
        const rows = products.map((p) =>
          `"${p.code}","${p.barcode ?? ''}","${p.name}","${p.unit}","${p.category ?? ''}",${p.salePrice},${p.costPrice},${p.ivaRate}`,
        );
        return header + rows.join('\n');
      }

      case 'documents': {
        const where: Record<string, unknown> = { tenantId };
        if (filters.type) where.type = filters.type;
        if (filters.dateFrom || filters.dateTo) {
          where.createdAt = {};
          if (filters.dateFrom) (where.createdAt as Record<string, Date>).gte = new Date(filters.dateFrom);
          if (filters.dateTo) (where.createdAt as Record<string, Date>).lte = new Date(filters.dateTo);
        }

        const docs = await this.prisma.document.findMany({
          where: where as any,
          include: { client: true },
          orderBy: { createdAt: 'desc' },
        });

        const header = 'Tipo,Número,Fecha,Cliente,Subtotal,IVA,Total,Estado\n';
        const rows = docs.map((d) =>
          `"${d.type}","${d.number}","${d.createdAt.toISOString().slice(0, 10)}","${d.client?.businessName ?? ''}",${d.subtotal},${d.totalIva},${d.total},"${d.status}"`,
        );
        return header + rows.join('\n');
      }

      default:
        throw new NotFoundException(`Entidad '${entity}' no soportada para exportación`);
    }
  }
}
