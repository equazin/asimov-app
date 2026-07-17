/** Initial upload of an existing local installation to its cloud tenant. */
import { dbAll, dbGet, dbRun } from './db';
import { buildDocEnvelope } from './document-sync';
import { compactPendingChanges, enqueueChange } from './sync';
import { getAirLocalConfig } from './air';
import { getWhatsappConfig } from './whatsapp';
import { getAfipConfig } from './afip-service';

type Row = Record<string, unknown>;

const DOCUMENT_TABLES: Array<[type: string, table: string]> = [
  ['goods_receipt', 'goods_receipts'],
  ['delivery_note', 'delivery_notes'],
  ['receipt', 'receipts'],
  ['payment_order', 'payment_orders'],
  ['sale_order', 'sale_orders'],
  ['quote', 'quotes'],
  ['invoice', 'invoices'],
  ['purchase_order', 'purchase_orders'],
  ['purchase_invoice', 'purchase_invoices'],
  ['internal_expense', 'internal_expenses'],
];

const INTERNAL_EXPENSE_BACKFILL_KEY = 'internal_expense_cloud_backfill_v1';

/** Encola una sola vez los gastos creados antes de que este tipo tuviera sync. */
export function enqueueInternalExpenseBackfill(): number {
  const done = dbGet<{ value: string }>('SELECT value FROM sync_state WHERE key = ?', [INTERNAL_EXPENSE_BACKFILL_KEY]);
  if (done) return 0;

  let queued = 0;
  for (const row of dbAll<{ id: string }>('SELECT id FROM internal_expenses')) {
    const envelope = buildDocEnvelope('internal_expense', row.id);
    if (!envelope) continue;
    enqueueChange('document_snapshot', row.id, 'update', envelope as unknown as Row);
    queued++;
  }
  dbRun('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)', [
    INTERNAL_EXPENSE_BACKFILL_KEY,
    new Date().toISOString(),
  ]);
  return queued;
}

function count(table: string): number {
  return (dbGet(`SELECT COUNT(*) AS count FROM ${table}`) as { count: number }).count;
}

export interface BootstrapState {
  clients: number;
  suppliers: number;
  products: number;
  documents: number;
  airProducts: number;
  hasLocalBusinessData: boolean;
}

export interface DeviceIntegrationStatus {
  airPassword: boolean;
  whatsappToken: boolean;
  arcaCertificate: boolean;
  arcaPrivateKey: boolean;
}

export function inspectDeviceIntegrationStatus(): DeviceIntegrationStatus {
  const air = getAirLocalConfig();
  const whatsapp = getWhatsappConfig();
  const arca = getAfipConfig();
  return {
    airPassword: air.password.length > 0,
    whatsappToken: whatsapp.token.length > 0,
    arcaCertificate: arca.hasCert,
    arcaPrivateKey: arca.hasKey,
  };
}

export function inspectBootstrapState(): BootstrapState {
  const clients = count('clients');
  const suppliers = count('suppliers');
  const products = count('articles');
  const documents = DOCUMENT_TABLES.reduce((sum, [, table]) => sum + count(table), 0);
  const airProducts = count('air_products');
  return {
    clients,
    suppliers,
    products,
    documents,
    airProducts,
    hasLocalBusinessData: clients + suppliers + products + documents + airProducts > 0,
  };
}

function enqueueMasters(): number {
  let queued = 0;
  for (const c of dbAll<Row>('SELECT * FROM clients')) {
    enqueueChange('client', String(c.id), 'update', {
      code: c.code,
      businessName: c.business_name,
      cuit: c.cuit,
      fiscalType: c.fiscal_type,
      email: c.email,
      phone: c.phone,
      address: c.address,
      city: c.city,
      province: c.province,
      active: c.active !== 0,
      notes: c.notes,
    });
    queued++;
  }
  for (const s of dbAll<Row>('SELECT * FROM suppliers')) {
    enqueueChange('supplier', String(s.id), 'update', {
      code: s.code,
      businessName: s.business_name,
      cuit: s.cuit,
      email: s.email,
      phone: s.phone,
      address: s.address,
      city: s.city,
      province: s.province,
      active: s.active !== 0,
      notes: s.notes,
    });
    queued++;
  }
  for (const p of dbAll<Row>('SELECT * FROM articles')) {
    enqueueChange('product', String(p.id), 'update', {
      code: p.code,
      name: p.name,
      description: p.description,
      category: p.category,
      unit: p.unit,
      costPrice: p.cost_price,
      salePrice: p.sale_price,
      ivaRate: p.iva_pct,
      active: p.active !== 0,
    });
    queued++;
  }
  return queued;
}

function enqueueDocuments(): number {
  let queued = 0;
  for (const [type, table] of DOCUMENT_TABLES) {
    for (const row of dbAll<{ id: string }>(`SELECT id FROM ${table}`)) {
      const envelope = buildDocEnvelope(type, row.id);
      if (!envelope) continue;
      enqueueChange('document_snapshot', row.id, 'update', envelope as unknown as Row);
      queued++;
    }
  }
  return queued;
}

function enqueueRelations(): number {
  let queued = 0;
  const kitIds = dbAll<{ kit_article_id: string }>(
    'SELECT DISTINCT kit_article_id FROM kit_components ORDER BY kit_article_id',
  );
  for (const { kit_article_id: kitId } of kitIds) {
    const components = dbAll<Row>(
      'SELECT id, component_article_id, qty FROM kit_components WHERE kit_article_id = ?',
      [kitId],
    ).map((c) => ({ id: c.id, componentArticleId: c.component_article_id, qty: c.qty }));
    enqueueChange('kit_set', kitId, 'update', { kitArticleId: kitId, components });
    queued++;
  }
  for (const link of dbAll<Row>('SELECT * FROM document_links')) {
    enqueueChange('document_link', String(link.id), 'create', {
      sourceType: link.source_type,
      sourceId: link.source_id,
      targetType: link.target_type,
      targetId: link.target_id,
      createdAt: link.created_at,
    });
    queued++;
  }
  for (const rate of dbAll<Row>('SELECT * FROM exchange_rates')) {
    enqueueChange('exchange_rate', String(rate.id), 'create', {
      casa: rate.casa,
      nombre: rate.nombre,
      compra: rate.compra,
      venta: rate.venta,
      sourceDate: rate.source_date,
      fetchedAt: rate.fetched_at,
    });
    queued++;
  }
  return queued;
}

function enqueueIntegrationSettings(): number {
  const air = getAirLocalConfig();
  enqueueChange('integration_config', 'air', 'update', {
    provider: 'air',
    config: {
      enabled: air.enabled,
      username: air.username,
      baseUrl: air.baseUrl,
      syncIntervalMinutes: air.syncIntervalMinutes,
      requiresPasswordOnDevice: true,
    },
  });
  const wa = getWhatsappConfig();
  enqueueChange('integration_config', 'whatsapp', 'update', {
    provider: 'whatsapp',
    config: {
      enabled: wa.enabled,
      baseUrl: wa.baseUrl,
      botPhone: wa.botPhone,
      pollIntervalMinutes: wa.pollIntervalMinutes,
      requiresTokenOnDevice: true,
    },
  });
  return 2;
}

function enqueueAirCatalog(): number {
  let queued = 0;
  for (const p of dbAll<Row>('SELECT * FROM air_products')) {
    let rawJson: unknown = {};
    try { rawJson = JSON.parse(String(p.raw_json ?? '{}')); } catch { rawJson = {}; }
    enqueueChange('external_catalog_product', `air:${String(p.air_code)}`, 'update', {
      provider: 'air',
      externalCode: p.air_code,
      description: p.description,
      partNumber: p.part_number,
      brand: p.brand,
      category: p.category,
      unit: p.unit,
      priceUsd: p.price_usd,
      priceArs: p.price_ars,
      ivaPct: p.iva_pct,
      stock: p.stock,
      active: p.active !== 0,
      rawJson,
      syncedAt: p.synced_at,
    });
    queued++;
  }
  return queued;
}

export interface BootstrapEnqueueResult extends BootstrapState {
  queued: number;
  compacted: number;
}

export function enqueueLocalBootstrap(): BootstrapEnqueueResult {
  const state = inspectBootstrapState();
  const queued = enqueueMasters()
    + enqueueDocuments()
    + enqueueRelations()
    + enqueueIntegrationSettings()
    + enqueueAirCatalog();
  const compacted = compactPendingChanges();
  return { ...state, queued, compacted };
}
