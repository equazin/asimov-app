export const PLAN_LIMITS = {
  trial: {
    maxUsers: 3,
    maxBranches: 1,
    maxDocsPerMonth: 100,
    maxMobileDevices: 1,
    trialDays: 14,
    hasAfip: false,
    hasPublicApi: false,
    hasCustomDomain: false,
    hasPrioritySupport: false,
  },
  basic: {
    maxUsers: 5,
    maxBranches: 1,
    maxDocsPerMonth: 500,
    maxMobileDevices: 1,
    hasAfip: false,
    hasPublicApi: false,
    hasCustomDomain: false,
    hasPrioritySupport: false,
  },
  pro: {
    maxUsers: 15,
    maxBranches: 3,
    maxDocsPerMonth: 5000,
    maxMobileDevices: 5,
    hasAfip: true,
    hasPublicApi: false,
    hasCustomDomain: true,
    hasPrioritySupport: false,
  },
  enterprise: {
    maxUsers: Infinity,
    maxBranches: Infinity,
    maxDocsPerMonth: Infinity,
    maxMobileDevices: Infinity,
    hasAfip: true,
    hasPublicApi: true,
    hasCustomDomain: true,
    hasPrioritySupport: true,
  },
} as const;

export const RATE_LIMITS = {
  basic: { requestsPerMinute: 60 },
  pro: { requestsPerMinute: 300 },
  enterprise: { requestsPerMinute: Infinity },
  trial: { requestsPerMinute: 60 },
} as const;

export const MOROSIDAD_TIMELINE = {
  warningDays: [-7, -3, -1],
  gracePeriodDays: 5,
  readOnlyAfterDays: 6,
  blockedAfterDays: 15,
  deleteAfterDays: 90,
} as const;

export const IVA_RATES = [0, 2.5, 5, 10.5, 21, 27] as const;

export const DOCUMENT_TYPES = [
  'quote',
  'sale_order',
  'invoice',
  'credit_note',
  'debit_note',
  'delivery_note',
  'receipt',
  'purchase_order',
  'goods_receipt',
  'purchase_invoice',
  'payment_order',
] as const;

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  quote: 'Presupuesto',
  sale_order: 'Pedido de venta',
  invoice: 'Factura',
  credit_note: 'Nota de crédito',
  debit_note: 'Nota de débito',
  delivery_note: 'Remito',
  receipt: 'Recibo',
  purchase_order: 'Orden de compra',
  goods_receipt: 'Recepción de mercadería',
  purchase_invoice: 'Factura de compra',
  payment_order: 'Orden de pago',
};

export const PROVINCES_AR = [
  'Buenos Aires',
  'CABA',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucumán',
] as const;
