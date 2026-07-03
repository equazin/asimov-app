export type FiscalType = 'responsable_inscripto' | 'monotributo' | 'exento' | 'final' | 'exterior';
export type DocumentStatus = 'draft' | 'confirmed' | 'cancelled' | 'voided';
export type InvoiceType = 'A' | 'B' | 'C' | 'E' | 'M';
export type PaymentMethod = 'cash' | 'transfer' | 'check' | 'card' | 'mercadopago' | 'other';
export type StockMovementType = 'in' | 'out' | 'adjustment' | 'transfer';
export type DocumentType =
  | 'quote'
  | 'sale_order'
  | 'invoice'
  | 'credit_note'
  | 'debit_note'
  | 'delivery_note'
  | 'receipt'
  | 'purchase_order'
  | 'goods_receipt'
  | 'purchase_invoice'
  | 'payment_order';

export interface Client {
  id: string;
  tenantId: string;
  code: string | null;
  businessName: string;
  cuit: string | null;
  fiscalType: FiscalType;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  zipCode: string | null;
  creditLimit: number;
  priceListId: string | null;
  balance: number;
  active: boolean;
  notes: string | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Supplier {
  id: string;
  tenantId: string;
  code: string | null;
  businessName: string;
  cuit: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  zipCode: string | null;
  paymentTermDays: number;
  bankName: string | null;
  bankCbu: string | null;
  bankAlias: string | null;
  balance: number;
  active: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Product {
  id: string;
  tenantId: string;
  code: string;
  barcode: string | null;
  name: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  unit: string;
  costPrice: number;
  salePrice: number;
  ivaPct: number;
  weight: number | null;
  managesStock: boolean;
  managesSerial: boolean;
  minStock: number;
  photos: string[];
  active: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Warehouse {
  id: string;
  tenantId: string;
  name: string;
  address: string | null;
  afipPointOfSale: string | null;
  active: boolean;
  createdAt: Date;
}

export interface PriceList {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  currency: string;
  markupPct: number;
  active: boolean;
  createdAt: Date;
}

export interface Document {
  id: string;
  tenantId: string;
  type: DocumentType;
  number: string;
  pointOfSale: string;
  clientId: string | null;
  supplierId: string | null;
  counterpartyName: string;
  date: string;
  dueDate: string | null;
  invoiceType: InvoiceType | null;
  status: DocumentStatus;
  currency: string;
  exchangeRate: number;
  subtotal: number;
  ivaAmount: number;
  otherTaxes: number;
  total: number;
  cae: string | null;
  caeExpiry: string | null;
  relatedDocumentId: string | null;
  warehouseId: string | null;
  userId: string;
  origin: 'desktop' | 'mobile' | 'web';
  notes: string | null;
  attachments: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentItem {
  id: string;
  documentId: string;
  productId: string | null;
  code: string;
  description: string;
  unit: string;
  qty: number;
  unitPrice: number;
  discount: number;
  ivaPct: number;
  subtotal: number;
  ivaAmount: number;
}

export interface StockMovement {
  id: string;
  tenantId: string;
  productId: string;
  warehouseId: string;
  type: StockMovementType;
  qty: number;
  date: Date;
  referenceType: DocumentType | null;
  referenceId: string | null;
  notes: string | null;
  userId: string;
}

export interface AccountMovement {
  id: string;
  tenantId: string;
  entityType: 'client' | 'supplier';
  entityId: string;
  documentType: DocumentType;
  documentId: string;
  date: string;
  debit: number;
  credit: number;
  balance: number;
  description: string;
  createdAt: Date;
}

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  origin: 'desktop' | 'mobile' | 'web' | 'api' | 'system';
  ipAddress: string | null;
  createdAt: Date;
}
