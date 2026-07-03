import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PlanLimitGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user?.tenantId) return true;

    const method = request.method;
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      include: { plan: true },
    });

    if (!tenant) throw new ForbiddenException('Tenant no encontrado');

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const usage = await this.prisma.tenantUsage.findUnique({
      where: { tenantId_month: { tenantId: tenant.id, month } },
    });

    if (usage && usage.docsCreated >= tenant.plan.maxDocsPerMonth) {
      throw new ForbiddenException(
        `Límite de documentos mensuales alcanzado (${tenant.plan.maxDocsPerMonth}). Actualice su plan para continuar.`,
      );
    }

    return true;
  }
}
