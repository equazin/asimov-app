import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class TenantStatusGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user?.tenantId) return true;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { status: true },
    });

    if (!tenant) throw new ForbiddenException('Tenant no encontrado');

    if (tenant.status === 'blocked' || tenant.status === 'cancelled') {
      throw new ForbiddenException(
        'Cuenta bloqueada. Contacte a soporte en soporte@asimov.app para reactivar.',
      );
    }

    if (tenant.status === 'read_only') {
      const method = request.method;
      if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
        throw new ForbiddenException(
          'Cuenta en modo solo lectura por pago pendiente. Regularice su situación para continuar operando.',
        );
      }
    }

    return true;
  }
}
