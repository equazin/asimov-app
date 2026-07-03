import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters?: { status?: string; planId?: string; search?: string }) {
    return this.prisma.tenant.findMany({
      where: {
        ...(filters?.status && { status: filters.status }),
        ...(filters?.planId && { planId: filters.planId }),
        ...(filters?.search && {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' as const } },
            { slug: { contains: filters.search, mode: 'insensitive' as const } },
            { fiscalId: { contains: filters.search } },
          ],
        }),
      },
      include: {
        plan: { select: { name: true, tier: true } },
        _count: { select: { users: true, documents: true } },
        subscriptions: {
          where: { status: { in: ['active', 'trialing', 'past_due'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { currentPeriodEnd: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAuditLogs(filters?: { action?: string }) {
    const logs = await this.prisma.auditLog.findMany({
      where: { ...(filters?.action && { action: filters.action }) },
      include: {
        user: { select: { name: true, email: true } },
        tenant: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // Mapeo al shape que espera el panel (entity/details).
    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      entity: log.entityType,
      entityId: log.entityId,
      details: log.newValues ? JSON.stringify(log.newValues) : null,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
      user: log.user ?? undefined,
      tenant: log.tenant ?? undefined,
    }));
  }

  async findById(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        plan: true,
        users: { select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true } },
        subscriptions: { orderBy: { createdAt: 'desc' }, take: 5 },
        featureFlags: true,
        usageRecords: { orderBy: { month: 'desc' }, take: 6 },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    return tenant;
  }

  async updateStatus(id: string, status: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');

    await this.prisma.tenant.update({
      where: { id },
      data: { status },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: id,
        action: 'update',
        entityType: 'tenant',
        entityId: id,
        oldValues: { status: tenant.status },
        newValues: { status },
        origin: 'system',
      },
    });

    return { id, status };
  }

  async updateCustomization(id: string, data: {
    logo?: string;
    primaryColor?: string;
    secondaryColor?: string;
    printHeader?: string;
    printFooter?: string;
    printTemplateId?: string;
    fiscalId?: string;
    fiscalName?: string;
    fiscalAddress?: string;
    phone?: string;
    email?: string;
    website?: string;
    customDomain?: string;
  }) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');

    return this.prisma.tenant.update({
      where: { id },
      data,
    });
  }

  async setFeatureFlag(tenantId: string, feature: string, enabled: boolean) {
    return this.prisma.featureFlag.upsert({
      where: { tenantId_feature: { tenantId, feature } },
      update: { enabled },
      create: { tenantId, feature, enabled },
    });
  }

  async getMasterDashboard() {
    const [totalTenants, activeTenants, blockedTenants, totalUsers, docsToday] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: 'active' } }),
      this.prisma.tenant.count({ where: { status: { in: ['blocked', 'read_only'] } } }),
      this.prisma.user.count({ where: { active: true } }),
      this.prisma.document.count({
        where: { createdAt: { gte: new Date(new Date().toISOString().slice(0, 10)) } },
      }),
    ]);

    const subscriptions = await this.prisma.subscription.findMany({
      where: { status: { in: ['active', 'trialing'] } },
      include: { plan: { select: { priceArs: true, priceUsd: true } } },
    });

    const mrrArs = subscriptions.reduce((sum, s) => sum + Number(s.plan.priceArs), 0);
    const mrrUsd = subscriptions.reduce((sum, s) => sum + Number(s.plan.priceUsd), 0);

    const expiringCount = await this.prisma.subscription.count({
      where: {
        status: { in: ['active', 'trialing'] },
        currentPeriodEnd: {
          lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          gte: new Date(),
        },
      },
    });

    return {
      totalTenants,
      activeTenants,
      blockedTenants,
      totalUsers,
      docsToday,
      mrrArs,
      mrrUsd,
      arrArs: mrrArs * 12,
      expiringCount,
    };
  }
}
