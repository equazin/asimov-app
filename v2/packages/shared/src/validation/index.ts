import { z } from 'zod';

export const emailSchema = z.string().email('Email inválido').max(255);
export const passwordSchema = z.string().min(8, 'Mínimo 8 caracteres').max(128);
export const cuitSchema = z.string().regex(/^\d{2}-\d{8}-\d$/, 'Formato: XX-XXXXXXXX-X').optional().or(z.literal(''));

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  totpCode: z.string().length(6).optional(),
});

export const registerTenantSchema = z.object({
  tenantName: z.string().min(2).max(100),
  ownerName: z.string().min(2).max(100),
  ownerEmail: emailSchema,
  password: passwordSchema,
  country: z.string().length(2).default('AR'),
  planTier: z.enum(['trial', 'basic', 'pro', 'enterprise']).default('trial'),
});

export const clientSchema = z.object({
  businessName: z.string().min(1).max(200),
  cuit: cuitSchema,
  fiscalType: z.enum(['responsable_inscripto', 'monotributo', 'exento', 'final', 'exterior']).default('final'),
  email: z.string().email().max(255).optional().or(z.literal('')),
  phone: z.string().max(50).optional(),
  address: z.string().max(300).optional(),
  city: z.string().max(100).optional(),
  province: z.string().max(100).optional(),
  zipCode: z.string().max(10).optional(),
  creditLimit: z.number().min(0).default(0),
  priceListId: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
});

export const productSchema = z.object({
  code: z.string().min(1).max(50),
  barcode: z.string().max(50).optional().nullable(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
  subcategory: z.string().max(100).optional(),
  unit: z.string().max(10).default('un'),
  costPrice: z.number().min(0).default(0),
  salePrice: z.number().min(0).default(0),
  ivaPct: z.number().default(21),
  weight: z.number().min(0).optional().nullable(),
  managesStock: z.boolean().default(true),
  managesSerial: z.boolean().default(false),
  minStock: z.number().min(0).default(0),
  notes: z.string().max(2000).optional(),
});

export const documentItemSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  code: z.string().max(50),
  description: z.string().min(1).max(500),
  unit: z.string().max(10).default('un'),
  qty: z.number().positive(),
  unitPrice: z.number().min(0),
  discount: z.number().min(0).max(100).default(0),
  ivaPct: z.number().default(21),
});

export const createDocumentSchema = z.object({
  type: z.enum([
    'quote', 'sale_order', 'invoice', 'credit_note', 'debit_note',
    'delivery_note', 'receipt', 'purchase_order', 'goods_receipt',
    'purchase_invoice', 'payment_order',
  ]),
  clientId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  counterpartyName: z.string().max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  invoiceType: z.enum(['A', 'B', 'C', 'E', 'M']).optional().nullable(),
  pointOfSale: z.string().max(5).default('00001'),
  currency: z.string().max(3).default('ARS'),
  exchangeRate: z.number().positive().default(1),
  warehouseId: z.string().uuid().optional().nullable(),
  relatedDocumentId: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional(),
  items: z.array(documentItemSchema).min(1),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().max(200).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterTenantInput = z.infer<typeof registerTenantSchema>;
export type ClientInput = z.infer<typeof clientSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
