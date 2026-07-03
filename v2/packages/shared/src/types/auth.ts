export type UserRole = 'owner' | 'admin' | 'seller' | 'warehouse' | 'accountant' | 'readonly';
export type DeviceOrigin = 'desktop' | 'mobile' | 'web';

export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  totpEnabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface JwtPayload {
  sub: string;
  tenantId: string;
  role: UserRole;
  origin: DeviceOrigin;
  iat: number;
  exp: number;
}

export interface LoginRequest {
  email: string;
  password: string;
  totpCode?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: Omit<User, 'createdAt' | 'updatedAt'>;
  tenant: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
  };
}

export interface RegisterTenantRequest {
  tenantName: string;
  ownerName: string;
  ownerEmail: string;
  password: string;
  country: string;
  planTier: 'trial' | 'basic' | 'pro' | 'enterprise';
}
