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

/** Tipos de documento del desktop que se pueden consultar por fecha. */
export const DOCUMENT_TYPES = [
  'invoice', 'sale_order', 'quote', 'delivery_note', 'receipt',
  'purchase_order', 'purchase_invoice', 'goods_receipt', 'purchase_receipt', 'payment_order', 'internal_expense',
] as const;

export interface DocumentQuery {
  types: string[];
  from?: string;          // yyyy-mm-dd, fecha del documento (header.date)
  to?: string;
  clientId?: string;
  withItems?: boolean;
  limit?: number;
}

export interface DocumentRow {
  docId: string;
  type: string;
  number: string;
  updatedAt: Date;
  header: Record<string, unknown>;
  items: Array<Record<string, unknown>> | null;
}

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Consulta de solo lectura sobre los documentos sincronizados (facturas,
   * pedidos, recibos…) filtrando por tipo, fecha y cliente. Evita tener que
   * bajar todo el pull (que incluye catálogo y maestros) para listar documentos.
   * Devuelve la cabecera del envelope tal como la guarda el desktop y,
   * opcionalmente, los ítems.
   */
  async listDocuments(tenantId: string, q: DocumentQuery): Promise<DocumentRow[]> {
    const types = q.types.filter((t) => (DOCUMENT_TYPES as readonly string[]).includes(t));
    if (types.length === 0) return [];
    const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const from = isDate(q.from) ? q.from! : '0000-01-01';
    const to = isDate(q.to) ? q.to! : '9999-12-31';
    const limit = Math.min(Math.max(Math.trunc(q.limit ?? 500), 1), 2000);
    const clientFilter = q.clientId
      ? Prisma.sql`AND payload->'header'->>'client_id' = ${q.clientId}`
      : Prisma.empty;
    const itemsCol = q.withItems ? Prisma.sql`payload->'items'` : Prisma.sql`NULL::jsonb`;
    return this.prisma.$queryRaw<DocumentRow[]>`
      SELECT "docId", "type", "number", "updatedAt",
             payload->'header' AS header,
             ${itemsCol} AS items
      FROM synced_documents
      WHERE "tenantId" = ${tenantId}
        AND "deletedAt" IS NULL
        AND "type" IN (${Prisma.join(types)})
        AND LEFT(COALESCE(payload->'header'->>'date', ''), 10) BETWEEN ${from} AND ${to}
        ${clientFilter}
      ORDER BY payload->'header'->>'date' DESC, "updatedAt" DESC
      LIMIT ${limit}
    `;
  }

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
      syncedDocuments,
      exchangeRates,
      documentLinks,
      kitComponents,
      opportunities,
      activities,
      tasks,
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
      this.prisma.syncedDocument.findMany({
        where: { tenantId, updatedAt: { gt: sinceDate } },
      }),
      this.prisma.exchangeRate.findMany({
        where: { tenantId, updatedAt: { gt: sinceDate } },
      }),
      this.prisma.documentLink.findMany({
        where: { tenantId, updatedAt: { gt: sinceDate } },
      }),
      this.prisma.kitComponent.findMany({
        where: { tenantId, updatedAt: { gt: sinceDate } },
      }),
      this.prisma.opportunity.findMany({
        where: { tenantId, updatedAt: { gt: sinceDate } },
      }),
      this.prisma.activity.findMany({
        where: { tenantId, updatedAt: { gt: sinceDate } },
      }),
      this.prisma.task.findMany({
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
        data: {
          ...cfg,
          config: this.sanitizePublicIntegrationConfig(cfg.config),
        } as unknown as Record<string, unknown>,
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

    for (const d of syncedDocuments) {
      changes.push({
        entity: 'document_snapshot',
        action: d.deletedAt ? 'delete' : 'update',
        id: d.docId,
        // El payload es el envelope completo tal como lo mandó el desktop origen.
        data: d.payload as unknown as Record<string, unknown>,
        updatedAt: d.updatedAt.toISOString(),
      });
    }

    for (const r of exchangeRates) {
      changes.push({
        entity: 'exchange_rate',
        action: 'update',
        id: r.id,
        data: r as unknown as Record<string, unknown>,
        updatedAt: r.updatedAt.toISOString(),
      });
    }

    for (const l of documentLinks) {
      changes.push({
        entity: 'document_link',
        action: 'update',
        id: l.id,
        data: l as unknown as Record<string, unknown>,
        updatedAt: l.updatedAt.toISOString(),
      });
    }

    // Los componentes de kit viajan agrupados por `kitArticleId` para que la
    // receptora reemplace el set completo en una única transacción (misma
    // semántica que `setKitComponents` en el desktop).
    const kitGroups = new Map<string, typeof kitComponents>();
    let kitMaxUpdatedAt = new Date(0);
    for (const kc of kitComponents) {
      const arr = kitGroups.get(kc.kitArticleId) ?? [];
      arr.push(kc);
      kitGroups.set(kc.kitArticleId, arr);
      if (kc.updatedAt > kitMaxUpdatedAt) kitMaxUpdatedAt = kc.updatedAt;
    }
    for (const [kitArticleId, rows] of kitGroups) {
      const groupUpdatedAt = rows.reduce(
        (acc, r) => (r.updatedAt > acc ? r.updatedAt : acc),
        new Date(0),
      );
      changes.push({
        entity: 'kit_set',
        action: 'update',
        id: kitArticleId,
        data: {
          kitArticleId,
          components: rows.map((r) => ({
            id: r.id,
            componentArticleId: r.componentArticleId,
            qty: r.qty,
          })),
        },
        updatedAt: groupUpdatedAt.toISOString(),
      });
    }
    void kitMaxUpdatedAt;

    for (const o of opportunities) {
      changes.push({
        entity: 'crm_opportunity',
        action: o.deletedAt ? 'delete' : 'update',
        id: o.id,
        data: o as unknown as Record<string, unknown>,
        updatedAt: o.updatedAt.toISOString(),
      });
    }

    for (const a of activities) {
      changes.push({
        entity: 'crm_activity',
        action: a.deletedAt ? 'delete' : 'update',
        id: a.id,
        data: a as unknown as Record<string, unknown>,
        updatedAt: a.updatedAt.toISOString(),
      });
    }

    for (const t of tasks) {
      changes.push({
        entity: 'crm_task',
        action: t.deletedAt ? 'delete' : 'update',
        id: t.id,
        data: t as unknown as Record<string, unknown>,
        updatedAt: t.updatedAt.toISOString(),
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
  ): Promise<{
    processed: number;
    conflicts: string[];
    conflictDetails: Array<{ id: string; entity: string; error: string }>;
  }> {
    let processed = 0;
    const conflicts: string[] = [];
    const conflictDetails: Array<{ id: string; entity: string; error: string }> = [];

    for (const change of changes) {
      try {
        await this.applyChange(tenantId, userId, change);
        processed++;
      } catch (error) {
        conflicts.push(change.id);
        conflictDetails.push({
          id: change.id,
          entity: change.entity,
          error: this.publicSyncError(error),
        });
      }
    }

    return { processed, conflicts, conflictDetails };
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

      case 'exchange_rate': {
        const sanitized = this.sanitizeExchangeRateData(data);
        // Insert-only por diseño: la misma cotización no debe reescribirse desde
        // otra PC. Usamos upsert por id para ser idempotentes ante reintentos.
        await this.prisma.exchangeRate.upsert({
          where: { id },
          create: { id, tenantId, ...sanitized },
          update: sanitized,
        });
        break;
      }

      case 'document_link': {
        const sanitized = this.sanitizeDocumentLinkData(data);
        if (action === 'delete') {
          await this.prisma.documentLink.deleteMany({ where: { id, tenantId } });
        } else {
          // El unique compuesto (tenant + source + target) evita duplicados aun
          // si dos PCs generaron ids distintos para el mismo vínculo.
          await this.prisma.documentLink.upsert({
            where: {
              tenantId_sourceType_sourceId_targetType_targetId: {
                tenantId,
                sourceType: sanitized.sourceType,
                sourceId: sanitized.sourceId,
                targetType: sanitized.targetType,
                targetId: sanitized.targetId,
              },
            },
            create: { id, tenantId, ...sanitized },
            update: sanitized,
          });
        }
        break;
      }

      case 'kit_set': {
        const { kitArticleId, components } = this.sanitizeKitSetData(data);
        // Reemplazo atómico: borrar componentes previos del kit y volver a
        // insertar el set actual. Misma semántica que setKitComponents().
        await this.prisma.$transaction([
          this.prisma.kitComponent.deleteMany({
            where: { tenantId, kitArticleId },
          }),
          ...components.map((c) =>
            this.prisma.kitComponent.create({
              data: {
                id: c.id,
                tenantId,
                kitArticleId,
                componentArticleId: c.componentArticleId,
                qty: c.qty,
              },
            }),
          ),
        ]);
        void id;
        break;
      }

      case 'document_snapshot': {
        // El desktop manda el documento como envelope opaco; el server solo lo
        // almacena y lo reparte. `id` es el id local del documento (docId).
        const envelope = data as Record<string, unknown>;
        const header = (envelope.header ?? {}) as Record<string, unknown>;
        const type = String(envelope.type ?? '');
        const number = String(header.number ?? '');
        if (action === 'delete') {
          await this.prisma.syncedDocument.updateMany({
            where: { tenantId, docId: id },
            data: { deletedAt: new Date() },
          });
        } else {
          await this.prisma.syncedDocument.upsert({
            where: { tenantId_docId: { tenantId, docId: id } },
            create: {
              tenantId,
              docId: id,
              type,
              number,
              payload: envelope as Prisma.InputJsonObject,
              deletedAt: null,
            },
            update: {
              type,
              number,
              payload: envelope as Prisma.InputJsonObject,
              deletedAt: null,
            },
          });
        }
        break;
      }

      case 'crm_opportunity': {
        const sanitized = this.sanitizeOpportunityData(data);
        if (action === 'delete') {
          await this.prisma.opportunity.updateMany({
            where: { id, tenantId },
            data: { deletedAt: new Date(), active: false },
          });
        } else {
          await this.prisma.opportunity.upsert({
            where: { id },
            create: { ...sanitized, id, tenantId },
            update: sanitized,
          });
        }
        break;
      }

      case 'crm_activity': {
        const sanitized = this.sanitizeActivityData(data);
        if (action === 'delete') {
          await this.prisma.activity.updateMany({
            where: { id, tenantId },
            data: { deletedAt: new Date(), active: false },
          });
        } else {
          await this.prisma.activity.upsert({
            where: { id },
            create: { ...sanitized, id, tenantId },
            update: sanitized,
          });
        }
        break;
      }

      case 'crm_task': {
        const sanitized = this.sanitizeTaskData(data);
        if (action === 'delete') {
          await this.prisma.task.updateMany({
            where: { id, tenantId },
            data: { deletedAt: new Date(), active: false },
          });
        } else {
          await this.prisma.task.upsert({
            where: { id },
            create: { ...sanitized, id, tenantId },
            update: sanitized,
          });
        }
        break;
      }

      default:
        throw new Error(`Entidad no soportada para sync: ${entity}`);
    }

    // La auditoría es secundaria: si falla después de aplicar la mutación, no
    // debemos informar un conflicto y hacer que el desktop la reintente sin fin.
    try {
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
    } catch {
      // Best-effort. La escritura principal ya fue confirmada.
    }
  }

  private publicSyncError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/\s+/g, ' ').slice(0, 300) || 'Error interno al aplicar el cambio';
  }

  private sanitizeClientData(data: Record<string, unknown>) {
    return {
      code: String(data.code ?? ''),
      businessName: String(data.businessName ?? data.business_name ?? data.name ?? ''),
      cuit: String(data.cuit ?? data.taxId ?? data.tax_id ?? ''),
      fiscalType: String(data.fiscalType ?? data.fiscal_type ?? data.ivaCondition ?? 'consumidor_final'),
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
      businessName: String(data.businessName ?? data.business_name ?? data.name ?? ''),
      cuit: String(data.cuit ?? data.taxId ?? data.tax_id ?? ''),
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
      salePrice: Number(data.salePrice ?? data.sale_price ?? data.price ?? 0),
      costPrice: Number(data.costPrice ?? data.cost_price ?? data.cost ?? 0),
      ivaPct: Number(data.ivaPct ?? data.iva_pct ?? data.ivaRate ?? 21),
    };
  }

  private sanitizeIntegrationConfigData(data: Record<string, unknown>) {
    const rawConfig = data.config && typeof data.config === 'object'
      ? this.sanitizePublicIntegrationConfig(data.config)
      : {};

    return {
      provider: String(data.provider ?? 'air'),
      config: rawConfig as Prisma.InputJsonObject,
      active: data.active === false ? false : true,
      deletedAt: data.deletedAt ? new Date(String(data.deletedAt)) : null,
    };
  }

  /** La nube comparte parámetros operativos, nunca credenciales del dispositivo. */
  private sanitizePublicIntegrationConfig(config: unknown) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) return {};
    const forbidden = new Set([
      'password', 'token', 'accesstoken', 'refreshtoken', 'certificate', 'cert',
      'key', 'privatekey', 'afipcert', 'afipkey',
    ]);
    return Object.fromEntries(
      Object.entries(config as Record<string, unknown>)
        .filter(([key]) => !forbidden.has(key.replace(/[_-]/g, '').toLowerCase())),
    ) as Prisma.InputJsonObject;
  }

  private sanitizeExchangeRateData(data: Record<string, unknown>) {
    return {
      casa: String(data.casa ?? ''),
      nombre: String(data.nombre ?? data.name ?? ''),
      compra: Number(data.compra ?? 0),
      venta: Number(data.venta ?? 0),
      sourceDate: data.sourceDate ?? data.source_date
        ? String(data.sourceDate ?? data.source_date)
        : null,
      fetchedAt: data.fetchedAt ?? data.fetched_at
        ? new Date(String(data.fetchedAt ?? data.fetched_at))
        : new Date(),
    };
  }

  private sanitizeDocumentLinkData(data: Record<string, unknown>) {
    return {
      sourceType: String(data.sourceType ?? data.source_type ?? ''),
      sourceId: String(data.sourceId ?? data.source_id ?? ''),
      targetType: String(data.targetType ?? data.target_type ?? ''),
      targetId: String(data.targetId ?? data.target_id ?? ''),
    };
  }

  private sanitizeKitSetData(data: Record<string, unknown>) {
    const rawComponents = Array.isArray(data.components) ? data.components : [];
    const components = rawComponents
      .map((c) => {
        const item = (c ?? {}) as Record<string, unknown>;
        return {
          id: String(item.id ?? ''),
          componentArticleId: String(
            item.componentArticleId ?? item.component_article_id ?? '',
          ),
          qty: Number(item.qty ?? 0),
        };
      })
      .filter((c) => c.id && c.componentArticleId && c.qty > 0);
    return {
      kitArticleId: String(data.kitArticleId ?? data.kit_article_id ?? ''),
      components,
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

  private sanitizeOpportunityData(data: Record<string, unknown>) {
    return {
      clientId: data.clientId ? String(data.clientId) : null,
      name: String(data.name ?? ''),
      stage: String(data.stage ?? 'prospecting'),
      value: Number(data.value ?? 0),
      probability: Number(data.probability ?? 0),
      expectedCloseDate: data.expectedCloseDate ? new Date(String(data.expectedCloseDate)) : null,
      status: String(data.status ?? 'open'),
      active: data.active === false || data.deletedAt ? false : true,
    };
  }

  private sanitizeActivityData(data: Record<string, unknown>) {
    return {
      clientId: data.clientId ? String(data.clientId) : null,
      opportunityId: data.opportunityId ? String(data.opportunityId) : null,
      type: String(data.type ?? 'note'),
      notes: data.notes ? String(data.notes) : null,
      date: data.date ? new Date(String(data.date)) : new Date(),
      active: data.active === false || data.deletedAt ? false : true,
    };
  }

  private sanitizeTaskData(data: Record<string, unknown>) {
    return {
      clientId: data.clientId ? String(data.clientId) : null,
      opportunityId: data.opportunityId ? String(data.opportunityId) : null,
      title: String(data.title ?? ''),
      dueDate: data.dueDate ? new Date(String(data.dueDate)) : null,
      completed: data.completed === true,
      active: data.active === false || data.deletedAt ? false : true,
    };
  }
}
