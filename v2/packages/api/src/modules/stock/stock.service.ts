import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  async getStockByProduct(tenantId: string, productId: string) {
    const levels = await this.prisma.productStock.findMany({
      where: { product: { tenantId, id: productId } },
      include: { warehouse: { select: { id: true, name: true } } },
    });
    return { success: true, data: levels };
  }

  async getStockByWarehouse(tenantId: string, warehouseId: string, query?: {
    search?: string; lowStockOnly?: boolean; page?: number; limit?: number;
  }) {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      warehouseId,
      product: { tenantId, active: true, deletedAt: null },
    };
    if (query?.lowStockOnly) {
      where.qty = { lte: this.prisma.$queryRaw`"minQty"` };
    }

    const levels = await this.prisma.productStock.findMany({
      where: where as any,
      skip,
      take: limit,
      include: {
        product: { select: { id: true, code: true, name: true, unit: true, category: true, salePrice: true, costPrice: true } },
      },
      orderBy: { product: { name: 'asc' } },
    });

    return { success: true, data: levels };
  }

  async createMovement(tenantId: string, userId: string, data: {
    productId: string;
    warehouseId: string;
    type: string;
    qty: number;
    referenceType?: string;
    referenceId?: string;
    notes?: string;
  }) {
    if (data.qty <= 0) throw new BadRequestException('La cantidad debe ser mayor a 0');

    const product = await this.prisma.product.findFirst({
      where: { id: data.productId, tenantId, active: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: data.warehouseId, tenantId, active: true },
    });
    if (!warehouse) throw new NotFoundException('Depósito no encontrado');

    const movement = await this.prisma.stockMovement.create({
      data: {
        tenantId,
        productId: data.productId,
        warehouseId: data.warehouseId,
        type: data.type,
        qty: data.type === 'out' ? -data.qty : data.qty,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        notes: data.notes,
        userId,
      },
    });

    const delta = data.type === 'out' ? -data.qty : data.qty;
    await this.prisma.productStock.upsert({
      where: { productId_warehouseId: { productId: data.productId, warehouseId: data.warehouseId } },
      update: { qty: { increment: delta } },
      create: { productId: data.productId, warehouseId: data.warehouseId, qty: Math.max(0, delta) },
    });

    return { success: true, data: movement };
  }

  async getMovements(tenantId: string, query: {
    productId?: string;
    warehouseId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { tenantId };
    if (query.productId) where.productId = query.productId;
    if (query.warehouseId) where.warehouseId = query.warehouseId;
    if (query.dateFrom || query.dateTo) {
      where.date = {};
      if (query.dateFrom) (where.date as any).gte = new Date(query.dateFrom);
      if (query.dateTo) (where.date as any).lte = new Date(query.dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where: where as any,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          product: { select: { id: true, code: true, name: true } },
          warehouse: { select: { id: true, name: true } },
        },
      }),
      this.prisma.stockMovement.count({ where: where as any }),
    ]);

    return { success: true, data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getLowStockAlerts(tenantId: string) {
    const alerts = await this.prisma.$queryRaw`
      SELECT ps.*, p.code, p.name, p.unit, w.name as warehouse_name
      FROM product_stock ps
      JOIN products p ON p.id = ps."productId" AND p."tenantId" = ${tenantId}
      JOIN warehouses w ON w.id = ps."warehouseId"
      WHERE ps.qty <= ps."minQty" AND ps."minQty" > 0 AND p.active = true AND p."deletedAt" IS NULL
      ORDER BY (ps.qty / NULLIF(ps."minQty", 0)) ASC
      LIMIT 50
    `;
    return { success: true, data: alerts };
  }
}
