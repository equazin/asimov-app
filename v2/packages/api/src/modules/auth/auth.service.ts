import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash, compare } from 'bcryptjs';
import { PrismaService } from '../../common/prisma.service';
import { randomUUID } from 'node:crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string, origin: string = 'web') {
    const user = await this.prisma.user.findFirst({
      where: { email, active: true },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true, logo: true, status: true },
        },
      },
    });

    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    if (user.tenant.status === 'blocked' || user.tenant.status === 'cancelled') {
      throw new UnauthorizedException('Cuenta bloqueada. Contacte soporte.');
    }

    const valid = await compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    if (user.totpEnabled) {
      throw new BadRequestException('Se requiere código 2FA');
    }

    const tokens = await this.generateTokens(user.id, user.tenantId, user.role, origin);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'login',
        entityType: 'user',
        entityId: user.id,
        origin,
      },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        name: user.name,
        role: user.role,
        active: user.active,
        totpEnabled: user.totpEnabled,
        lastLoginAt: new Date(),
      },
      tenant: user.tenant,
    };
  }

  async registerTenant(data: {
    tenantName: string;
    ownerName: string;
    ownerEmail: string;
    password: string;
    country: string;
    planTier: string;
  }) {
    const existing = await this.prisma.user.findFirst({
      where: { email: data.ownerEmail },
    });
    if (existing) throw new ConflictException('Email ya registrado');

    const slug = data.tenantName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const slugExists = await this.prisma.tenant.findUnique({ where: { slug } });
    if (slugExists) throw new ConflictException('Nombre de empresa ya en uso');

    const plan = await this.prisma.plan.findFirst({
      where: { tier: data.planTier, active: true },
    });
    if (!plan) throw new BadRequestException('Plan no disponible');

    const passwordHash = await hash(data.password, 12);

    const tenant = await this.prisma.tenant.create({
      data: {
        name: data.tenantName,
        slug,
        planId: plan.id,
        country: data.country,
        currency: data.country === 'AR' ? 'ARS' : 'USD',
      },
    });

    const user = await this.prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: data.ownerEmail,
        name: data.ownerName,
        passwordHash,
        role: 'owner',
      },
    });

    const now = new Date();
    const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    await this.prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status: data.planTier === 'trial' ? 'trialing' : 'active',
        paymentProvider: 'manual',
        currentPeriodStart: now,
        currentPeriodEnd: trialEnd,
      },
    });

    await this.prisma.warehouse.create({
      data: { tenantId: tenant.id, name: 'Depósito Principal', afipPointOfSale: '00001' },
    });

    await this.prisma.cashAccount.create({
      data: { tenantId: tenant.id, name: 'Caja Principal' },
    });

    const sequenceNames = [
      'quote', 'sale_order', 'invoice', 'credit_note', 'debit_note',
      'delivery_note', 'receipt', 'purchase_order', 'goods_receipt',
      'purchase_invoice', 'payment_order',
    ];
    const prefixes: Record<string, string> = {
      quote: 'PR', sale_order: 'PV', invoice: 'FC', credit_note: 'NC',
      debit_note: 'ND', delivery_note: 'RE', receipt: 'RC',
      purchase_order: 'OC', goods_receipt: 'RM', purchase_invoice: 'FP',
      payment_order: 'OP',
    };
    await this.prisma.sequence.createMany({
      data: sequenceNames.map((name) => ({
        tenantId: tenant.id,
        name,
        prefix: prefixes[name] ?? '',
      })),
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        action: 'create',
        entityType: 'tenant',
        entityId: tenant.id,
        newValues: { tenantName: data.tenantName, plan: data.planTier },
        origin: 'web',
      },
    });

    const tokens = await this.generateTokens(user.id, tenant.id, user.role, 'web');

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        tenantId: tenant.id,
        email: user.email,
        name: user.name,
        role: user.role,
        active: true,
        totpEnabled: false,
        lastLoginAt: null,
      },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, logo: null },
    };
  }

  async refreshToken(refreshToken: string) {
    const session = await this.prisma.session.findUnique({
      where: { refreshToken },
      include: { user: { select: { id: true, tenantId: true, role: true, active: true } } },
    });

    if (!session || session.expiresAt < new Date() || !session.user.active) {
      if (session) {
        await this.prisma.session.delete({ where: { id: session.id } });
      }
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    await this.prisma.session.delete({ where: { id: session.id } });

    return this.generateTokens(
      session.user.id,
      session.user.tenantId,
      session.user.role,
      session.origin,
    );
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.session.deleteMany({
        where: { userId, refreshToken },
      });
    } else {
      await this.prisma.session.deleteMany({ where: { userId } });
    }
  }

  private async generateTokens(userId: string, tenantId: string, role: string, origin: string) {
    const payload = { sub: userId, tenantId, role, origin };

    const accessToken = this.jwt.sign(payload, {
      expiresIn: this.config.get('JWT_EXPIRES_IN', '15m'),
    });

    const refreshToken = randomUUID();
    const refreshExpiresIn = this.config.get('JWT_REFRESH_EXPIRES_IN', '7d');
    const days = parseInt(refreshExpiresIn.replace('d', ''), 10) || 7;

    await this.prisma.session.create({
      data: {
        userId,
        refreshToken,
        origin,
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken };
  }
}
