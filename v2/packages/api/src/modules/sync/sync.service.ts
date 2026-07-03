import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

interface SyncChange {
  entity: string;
  action: 'create' | 'update' | 'delete';
  id: string;
  data: Record<string, unknown>;
  updatedAt: string;
}

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  async pullChanges(tenantId: string, since: string): Promise<{
    changes: SyncChange[];
    serverTimestamp: string;
  }> {
    const sinceDate = new Date(since);
    const serverTimestamp = new Date().toISOString();

    const changes: SyncChange[] = [];

    const [clients, suppliers, products, documents] = await Promise.all([
      this.prisma.client.findMany({
        where: { tenantId, updatedAt: { gt: sinceDate } },
      }),
      this.prisma.supplier.findMany({
        where: { tenantId, updatedAt: { gt: sinceDate } },
      }),
      this.prisma.product.findMany({
        where: { tenantId, updatedAt: { gt: sinceDate } },
      }),
      this.prisma.document.findMany({
        where: { tenantId, updatedAt: { gt: sinceDate } },
        include: { items: true },
      }),
    ]);

    for (const c of clients) {
      changes.push({
        entity: 'client',
        action: c.deletedAt ? 'delete' : 'update',
        id: c.id,
        data: c as unknown as Record<string, unknown>,
        updatedAt: c.updatedAt.toISOString(),
      });
    }

    for (const s of suppliers) {
      changes.push({
        entity: 'supplier',
        action: s.deletedAt ? 'delete' : 'update',
        id: s.id,
        data: s as unknown as Record<string, unknown>,
        updatedAt: s.updatedAt.toISOString(),
      });
    }

    for (const p of products) {
      changes.push({
        entity: 'product',
        action: p.deletedAt ? 'delete' : 'update',
        id: p.id,
        data: p as unknown as Record<string, unknown>,
        updatedAt: p.updatedAt.toISOString(),
      });
    }

    for (const d of documents) {
      changes.push({
        entity: 'document',
        action: 'update',
        id: d.id,
        data: d as unknown as Record<string, unknown>,
        updatedAt: d.updatedAt.toISOString(),
      });
    }

    changes.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

    return { changes, serverTimestamp };
  }

  async pushChanges(
    tenantId: string,
    userId: string,
    changes: Array<{
      entity: string;
      action: string;
      id: string;
      data: Record<string, unknown>;
    }>,
  ): Promise<{ processed: number; conflicts: string[] }> {
    let processed = 0;
    const conflicts: string[] = [];

    for (const change of changes) {
      try {
        await this.applyChange(tenantId, userId, change);
        processed++;
      } catch {
        conflicts.push(change.id);
      }
    }

    return { processed, conflicts };
  }

  private async applyChange(
    tenantId: string,
    userId: string,
    change: { entity: string; action: string; id: string; data: Record<string, unknown> },
  ): Promise<void> {
    const { entity, action, id, data } = change;

    switch (entity) {
      case 'client':
        if (action === 'delete') {
          await this.prisma.client.updateMany({
            where: { id, tenantId },
            data: { deletedAt: new Date(), active: false },
          });
        } else {
          await this.prisma.client.upsert({
            where: { id },
            create: { ...this.sanitizeClientData(data), id, tenantId },
            update: this.sanitizeClientData(data),
          });
        }
        break;

      case 'supplier':
        if (action === 'delete') {
          await this.prisma.supplier.updateMany({
            where: { id, tenantId },
            data: { deletedAt: new Date(), active: false },
          });
        } else {
          await this.prisma.supplier.upsert({
            where: { id },
            create: { ...this.sanitizeSupplierData(data), id, tenantId },
            update: this.sanitizeSupplierData(data),
          });
        }
        break;

      case 'product':
        if (action === 'delete') {
          await this.prisma.product.updateMany({
            where: { id, tenantId },
            data: { deletedAt: new Date(), active: false },
          });
        } else {
          await this.prisma.product.upsert({
            where: { id },
            create: { ...this.sanitizeProductData(data), id, tenantId },
            update: this.sanitizeProductData(data),
          });
        }
        break;

      default:
        throw new Error(`Entidad no soportada para sync: ${entity}`);
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: `sync_${action}`,
        entity,
        entityId: id,
        details: JSON.stringify({ source: 'desktop_sync' }),
      },
    });
  }

  private sanitizeClientData(data: Record<string, unknown>) {
    return {
      code: String(data.code ?? ''),
      businessName: String(data.businessName ?? data.business_name ?? ''),
      cuit: String(data.cuit ?? ''),
      fiscalType: String(data.fiscalType ?? data.fiscal_type ?? 'consumidor_final'),
      email: String(data.email ?? ''),
      phone: String(data.phone ?? ''),
      address: String(data.address ?? ''),
      city: String(data.city ?? ''),
      province: String(data.province ?? ''),
    };
  }

  private sanitizeSupplierData(data: Record<string, unknown>) {
    return {
      code: String(data.code ?? ''),
      businessName: String(data.businessName ?? data.business_name ?? ''),
      cuit: String(data.cuit ?? ''),
      email: String(data.email ?? ''),
      phone: String(data.phone ?? ''),
      address: String(data.address ?? ''),
      city: String(data.city ?? ''),
      province: String(data.province ?? ''),
    };
  }

  private sanitizeProductData(data: Record<string, unknown>) {
    return {
      code: String(data.code ?? ''),
      barcode: data.barcode ? String(data.barcode) : null,
      name: String(data.name ?? ''),
      unit: String(data.unit ?? 'un'),
      category: data.category ? String(data.category) : null,
      salePrice: Number(data.salePrice ?? data.sale_price ?? 0),
      costPrice: Number(data.costPrice ?? data.cost_price ?? 0),
      ivaRate: Number(data.ivaRate ?? data.iva_rate ?? 21),
    };
  }
}
