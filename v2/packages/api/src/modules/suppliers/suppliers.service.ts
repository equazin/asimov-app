import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: {
    page?: number; limit?: number; search?: string; active?: boolean;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      tenantId,
      deletedAt: null,
      ...(query.active !== undefined && { active: query.active }),
      ...(query.search && {
        OR: [
          { businessName: { contains: query.search, mode: 'insensitive' as const } },
          { cuit: { contains: query.search } },
          { code: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({ where, skip, take: limit, orderBy: { businessName: 'asc' } }),
      this.prisma.supplier.count({ where }),
    ]);

    return { success: true, data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(tenantId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { accountMovements: { orderBy: { date: 'desc' }, take: 20 } },
    });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');
    return { success: true, data: supplier };
  }

  async create(tenantId: string, data: Record<string, unknown>) {
    const supplier = await this.prisma.supplier.create({ data: { tenantId, ...data } as any });
    return { success: true, data: supplier };
  }

  async update(tenantId: string, id: string, data: Record<string, unknown>) {
    const existing = await this.prisma.supplier.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) throw new NotFoundException('Proveedor no encontrado');
    const supplier = await this.prisma.supplier.update({ where: { id }, data: { ...data, updatedAt: new Date() } as any });
    return { success: true, data: supplier };
  }

  async softDelete(tenantId: string, id: string) {
    const existing = await this.prisma.supplier.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) throw new NotFoundException('Proveedor no encontrado');
    await this.prisma.supplier.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    return { success: true };
  }
}
