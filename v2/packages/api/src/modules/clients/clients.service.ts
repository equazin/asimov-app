import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: {
    page?: number;
    limit?: number;
    search?: string;
    active?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
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
          { email: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [query.sortBy ?? 'businessName']: query.sortOrder ?? 'asc' },
      }),
      this.prisma.client.count({ where }),
    ]);

    return {
      success: true,
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(tenantId: string, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        priceList: { select: { id: true, name: true } },
        accountMovements: { orderBy: { date: 'desc' }, take: 20 },
      },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return { success: true, data: client };
  }

  async create(tenantId: string, data: {
    businessName: string;
    code?: string;
    cuit?: string;
    fiscalType?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    province?: string;
    zipCode?: string;
    creditLimit?: number;
    priceListId?: string;
    notes?: string;
    tags?: string[];
  }) {
    const client = await this.prisma.client.create({
      data: { tenantId, ...data },
    });
    return { success: true, data: client };
  }

  async update(tenantId: string, id: string, data: Record<string, unknown>) {
    const existing = await this.prisma.client.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Cliente no encontrado');

    const client = await this.prisma.client.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
    });
    return { success: true, data: client };
  }

  async softDelete(tenantId: string, id: string) {
    const existing = await this.prisma.client.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Cliente no encontrado');

    await this.prisma.client.update({
      where: { id },
      data: { deletedAt: new Date(), active: false },
    });
    return { success: true };
  }
}
