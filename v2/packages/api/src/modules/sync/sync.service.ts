import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

    const [
      clients,
      suppliers,
      products,
      documents,
      integrationConfigs,
      externalCatalogProducts,
    ] = await Promise.all([
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
      this.prisma.integrationConfig.findMany({
        where: { tenantId, updatedAt: { gt: sinceDate } },
      }),
      this.prisma.externalCatalogProduct.findMany({
        where: { tenantId, updatedAt: { gt: sinceDate } },
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

    for (const cfg of integrationConfigs) {
      changes.push({
        entity: 'integration_config',
        action: cfg.deletedAt ? 'delete' : 'update',
        id: cfg.provider,
        data: cfg as unknown as Record<string, unknown>,
        updatedAt: cfg.updatedAt.toISOString(),
      });
    }

    for (const p of externalCatalogProducts) {
      changes.push({
        entity: 'external_catalog_product',
        action: p.deletedAt ? 'delete' : 'update',
        id: `${p.provider}:${p.externalCode}`,
        data: p as unknown as Record<string, unknown>,
        updatedAt: p.updatedAt.toISOString(),
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

      case 'integration_config': {
        const sanitized = this.sanitizeIntegrationConfigData(data);
        if (action === 'delete') {
          await this.prisma.integrationConfig.updateMany({
            where: { tenantId, provider: sanitized.provider },
            data: { deletedAt: new Date(), active: false },
          });
        } else {
          await this.prisma.integrationConfig.upsert({
            where: { tenantId_provider: { tenantId, provider: sanitized.provider } },
            create: { id: data.id ? String(data.id) : undefined, tenantId, ...sanitized },
            update: sanitized,
          });
        }
        break;
      }

      case 'external_catalog_product': {
        const sanitized = this.sanitizeExternalCatalogProductData(data);
        if (action === 'delete') {
          await this.prisma.externalCatalogProduct.updateMany({
            where: {
              tenantId,
              provider: sanitized.provider,
              externalCode: sanitized.externalCode,
            },
            data: { deletedAt: new Date(), active: false },
          });
        } else {
          await this.prisma.externalCatalogProduct.upsert({
            where: {
              tenantId_provider_externalCode: {
                tenantId,
                provider: sanitized.provider,
                externalCode: sanitized.externalCode,
              },
            },
            create: { id: data.id ? String(data.id) : undefined, tenantId, ...sanitized },
            update: sanitized,
          });
        }
        break;
      }

      default:
        throw new Error(`Entidad no soportada para sync: ${entity}`);
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: `sync_${action}`,
        entityType: entity,
        entityId: id,
        origin: 'desktop',
        newValues: { source: 'desktop_sync' },
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

  private sanitizeIntegrationConfigData(data: Record<string, unknown>) {
    const rawConfig = data.config && typeof data.config === 'object'
      ? data.config
      : {};

    return {
      provider: String(data.provider ?? 'air'),
      config: rawConfig as Prisma.InputJsonObject,
      active: data.active === false ? false : true,
      deletedAt: data.deletedAt ? new Date(String(data.deletedAt)) : null,
    };
  }

  private sanitizeExternalCatalogProductData(data: Record<string, unknown>) {
    const rawJson = data.rawJson ?? data.raw_json ?? null;
    const syncedAt = data.syncedAt ?? data.synced_at ?? null;

    return {
      provider: String(data.provider ?? 'air'),
      externalCode: String(data.externalCode ?? data.external_code ?? data.air_code ?? ''),
      description: String(data.description ?? data.name ?? ''),
      partNumber: data.partNumber || data.part_number ? String(data.partNumber ?? data.part_number) : null,
      brand: data.brand ? String(data.brand) : null,
      category: data.category ? String(data.category) : null,
      unit: String(data.unit ?? 'un'),
      priceUsd: Number(data.priceUsd ?? data.price_usd ?? 0),
      priceArs: Number(data.priceArs ?? data.price_ars ?? 0),
      ivaPct: Number(data.ivaPct ?? data.iva_pct ?? 21),
      stock: Number(data.stock ?? 0),
      active: data.active === false || data.active === 0 ? false : true,
      rawJson: rawJson === null ? Prisma.JsonNull : rawJson as Prisma.InputJsonValue,
      syncedAt: syncedAt ? new Date(String(syncedAt)) : null,
      deletedAt: data.deletedAt ? new Date(String(data.deletedAt)) : null,
    };
  }
}
