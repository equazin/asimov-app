import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BillingService } from './billing.service';
import type { PrismaService } from '../../common/prisma.service';
import type { ConfigService } from '@nestjs/config';

/**
 * Construye un mock de PrismaService con los métodos que usa BillingService.
 * Cada test sobreescribe los que necesita.
 */
function makePrismaMock() {
  return {
    subscription: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    subscriptionPayment: {
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    tenant: {
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

function makeConfigMock(values: Record<string, string> = {}) {
  return {
    get: vi.fn((key: string) => values[key]),
  };
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

describe('BillingService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
  });

  describe('createPaymentPreference — selección de gateway por país', () => {
    it('tenant AR → Mercado Pago con monto en ARS', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub1',
        tenant: { name: 'ACME', country: 'AR' },
        plan: { name: 'Pro', priceArs: { toNumber: () => 15000 }, priceUsd: { toNumber: () => 20 } },
      });
      const config = makeConfigMock({ MERCADOPAGO_ACCESS_TOKEN: 'tok' });
      const service = new BillingService(prisma as unknown as PrismaService, config as unknown as ConfigService);

      const result = await service.createPaymentPreference('t1', 'sub1');

      expect(result.gateway).toBe('mercadopago');
      expect(prisma.subscriptionPayment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ paymentProvider: 'mercadopago', amount: 15000, currency: 'ARS' }),
        }),
      );
    });

    it('tenant no-AR → Stripe con monto en USD', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub1',
        tenant: { name: 'ACME', country: 'US' },
        plan: { name: 'Pro', priceArs: { toNumber: () => 15000 }, priceUsd: { toNumber: () => 20 } },
      });
      const config = makeConfigMock({ STRIPE_SECRET_KEY: 'sk' });
      const service = new BillingService(prisma as unknown as PrismaService, config as unknown as ConfigService);

      const result = await service.createPaymentPreference('t1', 'sub1');

      expect(result.gateway).toBe('stripe');
      expect(prisma.subscriptionPayment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ paymentProvider: 'stripe', amount: 20, currency: 'USD' }),
        }),
      );
    });

    it('lanza si el gateway no está configurado', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub1',
        tenant: { name: 'ACME', country: 'AR' },
        plan: { name: 'Pro', priceArs: { toNumber: () => 15000 }, priceUsd: { toNumber: () => 20 } },
      });
      const config = makeConfigMock({}); // sin MERCADOPAGO_ACCESS_TOKEN
      const service = new BillingService(prisma as unknown as PrismaService, config as unknown as ConfigService);

      await expect(service.createPaymentPreference('t1', 'sub1')).rejects.toThrow(/Mercado Pago/);
    });

    it('lanza si la suscripción no existe', async () => {
      prisma.subscription.findFirst.mockResolvedValue(null);
      const service = new BillingService(prisma as unknown as PrismaService, makeConfigMock() as unknown as ConfigService);
      await expect(service.createPaymentPreference('t1', 'nope')).rejects.toThrow(/no encontrada/);
    });
  });

  describe('handleWebhook — actualización de pago y suscripción', () => {
    it('MP approved → marca pago paid y reactiva suscripción + tenant', async () => {
      prisma.subscriptionPayment.findFirst.mockResolvedValue({
        id: 'pay1',
        subscriptionId: 'sub1',
        subscription: { tenantId: 't1' },
      });
      const service = new BillingService(prisma as unknown as PrismaService, makeConfigMock() as unknown as ConfigService);

      const res = await service.handleWebhook('mercadopago', { data: { id: 'MP_PREF_1' }, status: 'approved' });

      expect(res.status).toBe('approved');
      expect(prisma.subscriptionPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'paid' }) }),
      );
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'active' }) }),
      );
      expect(prisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 't1' }, data: { status: 'active' } }),
      );
    });

    it('Stripe payment_failed → marca pago failed y NO reactiva', async () => {
      prisma.subscriptionPayment.findFirst.mockResolvedValue({
        id: 'pay1',
        subscriptionId: 'sub1',
        subscription: { tenantId: 't1' },
      });
      const service = new BillingService(prisma as unknown as PrismaService, makeConfigMock() as unknown as ConfigService);

      const res = await service.handleWebhook('stripe', {
        type: 'payment_intent.payment_failed',
        data: { object: { id: 'STRIPE_SESSION_1' } },
      });

      expect(res.status).toBe('rejected');
      expect(prisma.subscriptionPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
      );
      expect(prisma.subscription.update).not.toHaveBeenCalled();
      expect(prisma.tenant.update).not.toHaveBeenCalled();
    });

    it('webhook de pago inexistente → no-op sin errores', async () => {
      prisma.subscriptionPayment.findFirst.mockResolvedValue(null);
      const service = new BillingService(prisma as unknown as PrismaService, makeConfigMock() as unknown as ConfigService);

      await service.handleWebhook('mercadopago', { data: { id: 'desconocido' }, status: 'approved' });

      expect(prisma.subscriptionPayment.update).not.toHaveBeenCalled();
      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });
  });

  describe('runMorosidadCheck — ciclo de morosidad', () => {
    it('clasifica cada suscripción según los días de atraso', async () => {
      prisma.subscription.findMany.mockResolvedValue([
        { id: 's_ok', tenantId: 't_ok', currentPeriodEnd: daysFromNow(3) },       // futuro → ignorada
        { id: 's_warn', tenantId: 't_warn', currentPeriodEnd: daysFromNow(-2) },   // 2 días → warned
        { id: 's_grace', tenantId: 't_grace', currentPeriodEnd: daysFromNow(-5) }, // 5 días → grace
        { id: 's_ro', tenantId: 't_ro', currentPeriodEnd: daysFromNow(-8) },       // 8 días → read_only
        { id: 's_block', tenantId: 't_block', currentPeriodEnd: daysFromNow(-20) },// 20 días → blocked
      ]);
      const service = new BillingService(prisma as unknown as PrismaService, makeConfigMock() as unknown as ConfigService);

      const result = await service.runMorosidadCheck();

      expect(result).toEqual({ warned: 1, graced: 1, readOnly: 1, blocked: 1 });
    });

    it('el bloqueo actualiza tenant a blocked y suscripción a cancelled', async () => {
      prisma.subscription.findMany.mockResolvedValue([
        { id: 's_block', tenantId: 't_block', currentPeriodEnd: daysFromNow(-30) },
      ]);
      const service = new BillingService(prisma as unknown as PrismaService, makeConfigMock() as unknown as ConfigService);

      await service.runMorosidadCheck();

      expect(prisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 't_block' }, data: { status: 'blocked' } }),
      );
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 's_block' }, data: { status: 'cancelled' } }),
      );
    });
  });
});
