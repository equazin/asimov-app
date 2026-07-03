import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import { MOROSIDAD_TIMELINE } from '@asimov/shared';

type PaymentProvider = 'mercadopago' | 'stripe';
type PaymentStatus = 'approved' | 'pending' | 'rejected';

interface PaymentResult {
  paymentId: string;
  status: PaymentStatus;
  externalId: string;
  gateway: PaymentProvider;
}

interface CheckoutResult {
  preferenceUrl: string;
  preferenceId: string;
  gateway: PaymentProvider;
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createPaymentPreference(
    tenantId: string,
    subscriptionId: string,
  ): Promise<CheckoutResult> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, tenantId },
      include: { plan: true, tenant: true },
    });

    if (!subscription) throw new NotFoundException('Suscripción no encontrada');

    const { tenant, plan } = subscription;
    const isArgentina = tenant.country === 'AR';
    const gateway: PaymentProvider = isArgentina ? 'mercadopago' : 'stripe';
    const amount = isArgentina ? plan.priceArs.toNumber() : plan.priceUsd.toNumber();
    const currency = isArgentina ? 'ARS' : 'USD';

    if (gateway === 'mercadopago') {
      return this.createMercadoPagoPreference(amount, currency, subscriptionId);
    }

    return this.createStripeCheckout(amount, currency, subscriptionId);
  }

  private async createMercadoPagoPreference(
    amount: number,
    currency: string,
    subscriptionId: string,
  ): Promise<CheckoutResult> {
    const accessToken = this.config.get<string>('MERCADOPAGO_ACCESS_TOKEN');
    if (!accessToken) throw new BadRequestException('Mercado Pago no configurado');

    // In production: POST to https://api.mercadopago.com/checkout/preferences
    const preferenceId = `MP_PREF_${Date.now()}`;

    await this.prisma.subscriptionPayment.create({
      data: {
        subscriptionId,
        amount,
        currency,
        paymentProvider: 'mercadopago',
        externalPaymentId: preferenceId,
        status: 'pending',
      },
    });

    return {
      preferenceUrl: `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${preferenceId}`,
      preferenceId,
      gateway: 'mercadopago',
    };
  }

  private async createStripeCheckout(
    amount: number,
    currency: string,
    subscriptionId: string,
  ): Promise<CheckoutResult> {
    const apiKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!apiKey) throw new BadRequestException('Stripe no configurado');

    // In production: call Stripe API to create checkout session
    const sessionId = `STRIPE_SESSION_${Date.now()}`;

    await this.prisma.subscriptionPayment.create({
      data: {
        subscriptionId,
        amount,
        currency,
        paymentProvider: 'stripe',
        externalPaymentId: sessionId,
        status: 'pending',
      },
    });

    return {
      preferenceUrl: `https://checkout.stripe.com/c/pay/${sessionId}`,
      preferenceId: sessionId,
      gateway: 'stripe',
    };
  }

  async handleWebhook(
    gateway: PaymentProvider,
    payload: Record<string, unknown>,
  ): Promise<PaymentResult> {
    if (gateway === 'mercadopago') {
      return this.handleMercadoPagoWebhook(payload);
    }
    return this.handleStripeWebhook(payload);
  }

  private async handleMercadoPagoWebhook(
    payload: Record<string, unknown>,
  ): Promise<PaymentResult> {
    const data = payload.data as Record<string, unknown> | undefined;
    const externalId = String(data?.id ?? payload.id ?? '');
    const rawStatus = String(payload.status ?? 'pending');

    const status: PaymentStatus =
      rawStatus === 'approved' ? 'approved' : rawStatus === 'rejected' ? 'rejected' : 'pending';

    await this.processPaymentUpdate(externalId, 'mercadopago', status);

    return { paymentId: externalId, status, externalId, gateway: 'mercadopago' };
  }

  private async handleStripeWebhook(
    payload: Record<string, unknown>,
  ): Promise<PaymentResult> {
    const type = String(payload.type ?? '');
    const data = payload.data as Record<string, unknown> | undefined;
    const object = data?.object as Record<string, unknown> | undefined;
    const sessionId = String(object?.id ?? '');

    let status: PaymentStatus = 'pending';
    if (type === 'checkout.session.completed') status = 'approved';
    if (type === 'payment_intent.payment_failed') status = 'rejected';

    await this.processPaymentUpdate(sessionId, 'stripe', status);

    return { paymentId: sessionId, status, externalId: sessionId, gateway: 'stripe' };
  }

  private async processPaymentUpdate(
    externalPaymentId: string,
    paymentProvider: PaymentProvider,
    status: PaymentStatus,
  ): Promise<void> {
    if (!externalPaymentId) return;

    const payment = await this.prisma.subscriptionPayment.findFirst({
      where: { externalPaymentId, paymentProvider },
      include: { subscription: { include: { tenant: true } } },
    });

    if (!payment) return;

    const now = new Date();

    await this.prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        status: status === 'approved' ? 'paid' : status === 'rejected' ? 'failed' : 'pending',
        paidAt: status === 'approved' ? now : null,
      },
    });

    if (status === 'approved') {
      const nextPeriodEnd = new Date(now);
      nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);

      await this.prisma.subscription.update({
        where: { id: payment.subscriptionId },
        data: {
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: nextPeriodEnd,
        },
      });

      await this.prisma.tenant.update({
        where: { id: payment.subscription.tenantId },
        data: { status: 'active' },
      });
    }
  }

  async runMorosidadCheck(): Promise<{
    warned: number;
    graced: number;
    readOnly: number;
    blocked: number;
  }> {
    const now = new Date();
    let warned = 0;
    let graced = 0;
    let readOnly = 0;
    let blocked = 0;

    const subscriptions = await this.prisma.subscription.findMany({
      where: { status: { in: ['active', 'past_due', 'grace_period'] } },
      include: { tenant: true },
    });

    for (const sub of subscriptions) {
      const daysOverdue = Math.floor(
        (now.getTime() - sub.currentPeriodEnd.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysOverdue < 0) continue;

      if (daysOverdue >= MOROSIDAD_TIMELINE.blockedAfterDays) {
        await this.updateTenantStatus(sub.tenantId, sub.id, 'blocked', 'cancelled');
        blocked++;
      } else if (daysOverdue >= MOROSIDAD_TIMELINE.readOnlyAfterDays) {
        await this.updateTenantStatus(sub.tenantId, sub.id, 'read_only', 'past_due');
        readOnly++;
      } else if (daysOverdue >= MOROSIDAD_TIMELINE.gracePeriodDays) {
        await this.updateTenantStatus(sub.tenantId, sub.id, 'grace_period', 'grace_period');
        graced++;
      } else {
        warned++;
      }
    }

    return { warned, graced, readOnly, blocked };
  }

  private async updateTenantStatus(
    tenantId: string,
    subscriptionId: string,
    tenantStatus: string,
    subStatus: string,
  ): Promise<void> {
    await Promise.all([
      this.prisma.tenant.update({
        where: { id: tenantId },
        data: { status: tenantStatus },
      }),
      this.prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: subStatus },
      }),
    ]);
  }

  async getPaymentHistory(tenantId: string) {
    return this.prisma.subscription.findMany({
      where: { tenantId },
      include: {
        plan: true,
        payments: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
