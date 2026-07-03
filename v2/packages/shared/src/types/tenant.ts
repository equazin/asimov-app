export type PlanTier = 'trial' | 'basic' | 'pro' | 'enterprise';
export type TenantStatus = 'active' | 'grace_period' | 'read_only' | 'blocked' | 'cancelled';
export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'trialing';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  customDomain: string | null;
  logo: string | null;
  primaryColor: string;
  secondaryColor: string;
  status: TenantStatus;
  planId: string;
  country: string;
  timezone: string;
  currency: string;
  fiscalId: string | null;
  fiscalName: string | null;
  fiscalAddress: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  printHeader: string | null;
  printFooter: string | null;
  printTemplateId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Plan {
  id: string;
  name: string;
  tier: PlanTier;
  priceArs: number;
  priceUsd: number;
  maxUsers: number;
  maxBranches: number;
  maxDocsPerMonth: number;
  maxMobileDevices: number;
  hasAfip: boolean;
  hasPublicApi: boolean;
  hasCustomDomain: boolean;
  hasPrioritySupport: boolean;
  active: boolean;
}

export interface Subscription {
  id: string;
  tenantId: string;
  planId: string;
  status: SubscriptionStatus;
  paymentProvider: 'mercadopago' | 'stripe' | 'manual';
  externalSubscriptionId: string | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelledAt: Date | null;
  createdAt: Date;
}

export interface TenantUsage {
  tenantId: string;
  month: string;
  docsCreated: number;
  activeUsers: number;
  storageBytes: number;
  apiCalls: number;
}
