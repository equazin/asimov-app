import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from './auth.service';
import type { PrismaService } from '../../common/prisma.service';
import type { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';

// bcrypt real es lento (12 rounds); se mockea para tests deterministas y rápidos.
vi.mock('bcryptjs', () => ({
  hash: vi.fn(async (plain: string) => 'hashed:' + plain),
  compare: vi.fn(async (plain: string, stored: string) => stored === 'hashed:' + plain),
}));

function makePrismaMock() {
  return {
    user: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    tenant: { findUnique: vi.fn(), create: vi.fn() },
    plan: { findFirst: vi.fn() },
    subscription: { create: vi.fn().mockResolvedValue({}) },
    warehouse: { create: vi.fn().mockResolvedValue({}) },
    cashAccount: { create: vi.fn().mockResolvedValue({}) },
    sequence: { createMany: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    session: { create: vi.fn().mockResolvedValue({}) },
  };
}
const makeJwt = () => ({ sign: vi.fn(() => 'jwt-access') });
const makeConfig = () => ({ get: vi.fn((_k: string, def?: string) => def) });

function makeService(prisma: ReturnType<typeof makePrismaMock>) {
  return new AuthService(
    prisma as unknown as PrismaService,
    makeJwt() as unknown as JwtService,
    makeConfig() as unknown as ConfigService,
  );
}

const validReg = {
  tenantName: 'ACME Comercial',
  ownerName: 'Juan Pérez',
  ownerEmail: 'juan@acme.com',
  password: 'secret123',
  country: 'AR',
  planTier: 'trial',
};

describe('AuthService.registerTenant', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  beforeEach(() => {
    prisma = makePrismaMock();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.tenant.findUnique.mockResolvedValue(null);
    prisma.plan.findFirst.mockResolvedValue({ id: 'plan1', tier: 'trial' });
    prisma.tenant.create.mockResolvedValue({ id: 't1', name: 'ACME Comercial', slug: 'acme-comercial' });
    prisma.user.create.mockResolvedValue({ id: 'u1', email: 'juan@acme.com', name: 'Juan Pérez', role: 'owner' });
  });

  it('alta feliz: crea tenant/usuario/suscripción/depósito/caja/secuencias + tokens', async () => {
    const res = await makeService(prisma).registerTenant(validReg);

    expect(res.accessToken).toBe('jwt-access');
    expect(res.tenant.slug).toBe('acme-comercial');
    // slug derivado y moneda por país
    expect(prisma.tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: 'acme-comercial', currency: 'ARS' }) }),
    );
    // owner con password hasheada (nunca en texto plano)
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ passwordHash: 'hashed:secret123', role: 'owner' }) }),
    );
    // trial → suscripción trialing
    expect(prisma.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'trialing' }) }),
    );
    // recursos base del tenant
    expect(prisma.warehouse.create).toHaveBeenCalledOnce();
    expect(prisma.cashAccount.create).toHaveBeenCalledOnce();
    // 11 secuencias de numeración por tenant
    const seqArg = prisma.sequence.createMany.mock.calls[0][0];
    expect(seqArg.data).toHaveLength(11);
    expect(seqArg.data.every((s: { tenantId: string }) => s.tenantId === 't1')).toBe(true);
    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
  });

  it('país no-AR → moneda USD', async () => {
    prisma.tenant.create.mockResolvedValue({ id: 't1', name: 'X', slug: 'x' });
    await makeService(prisma).registerTenant({ ...validReg, country: 'UY' });
    expect(prisma.tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currency: 'USD' }) }),
    );
  });

  it('plan pago (no trial) → suscripción active', async () => {
    prisma.plan.findFirst.mockResolvedValue({ id: 'plan2', tier: 'pro' });
    await makeService(prisma).registerTenant({ ...validReg, planTier: 'pro' });
    expect(prisma.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'active' }) }),
    );
  });

  it('deriva el slug en kebab-case desde el nombre', async () => {
    prisma.tenant.create.mockResolvedValue({ id: 't1', name: 'y', slug: 'mi-empresa-s-a' });
    await makeService(prisma).registerTenant({ ...validReg, tenantName: 'Mi Empresa S.A.' });
    expect(prisma.tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: 'mi-empresa-s-a' }) }),
    );
  });

  it('email ya registrado → Conflict', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'existente' });
    await expect(makeService(prisma).registerTenant(validReg)).rejects.toThrow(/Email ya registrado/);
  });

  it('slug/empresa ya en uso → Conflict', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: 'otro' });
    await expect(makeService(prisma).registerTenant(validReg)).rejects.toThrow(/empresa ya en uso/);
  });

  it('plan inexistente → BadRequest', async () => {
    prisma.plan.findFirst.mockResolvedValue(null);
    await expect(makeService(prisma).registerTenant(validReg)).rejects.toThrow(/Plan no disponible/);
  });
});

describe('AuthService.login', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  const baseUser = {
    id: 'u1', tenantId: 't1', email: 'juan@acme.com', name: 'Juan', role: 'owner',
    active: true, totpEnabled: false, passwordHash: 'hashed:secret123',
    tenant: { id: 't1', name: 'ACME', slug: 'acme', logo: null, status: 'active' },
  };
  beforeEach(() => { prisma = makePrismaMock(); });

  it('login válido devuelve tokens y registra lastLoginAt + auditoría', async () => {
    prisma.user.findFirst.mockResolvedValue(baseUser);
    const res = await makeService(prisma).login('juan@acme.com', 'secret123');
    expect(res.accessToken).toBe('jwt-access');
    expect(res.user.role).toBe('owner');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' }, data: expect.objectContaining({ lastLoginAt: expect.any(Date) }) }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'login' }) }),
    );
  });

  it('usuario inexistente → Unauthorized', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(makeService(prisma).login('no@hay.com', 'x')).rejects.toThrow(/inválidas/);
  });

  it('tenant bloqueado → Unauthorized (cuenta bloqueada)', async () => {
    prisma.user.findFirst.mockResolvedValue({ ...baseUser, tenant: { ...baseUser.tenant, status: 'blocked' } });
    await expect(makeService(prisma).login('juan@acme.com', 'secret123')).rejects.toThrow(/bloqueada/);
  });

  it('contraseña incorrecta → Unauthorized', async () => {
    prisma.user.findFirst.mockResolvedValue(baseUser);
    await expect(makeService(prisma).login('juan@acme.com', 'mala')).rejects.toThrow(/inválidas/);
  });

  it('2FA habilitado → BadRequest', async () => {
    prisma.user.findFirst.mockResolvedValue({ ...baseUser, totpEnabled: true });
    await expect(makeService(prisma).login('juan@acme.com', 'secret123')).rejects.toThrow(/2FA/);
  });
});
