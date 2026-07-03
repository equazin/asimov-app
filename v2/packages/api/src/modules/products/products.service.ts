import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
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
      ...(query.category && { category: query.category }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' as const } },
          { code: { contains: query.search, mode: 'insensitive' as const } },
          { barcode: { contains: query.search } },
          { description: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [query.sortBy ?? 'name']: query.sortOrder ?? 'asc' },
        include: {
          stockLevels: { include: { warehouse: { select: { id: true, name: true } } } },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      success: true,
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(tenantId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        stockLevels: { include: { warehouse: { select: { id: true, name: true } } } },
        priceListItems: { include: { priceList: { select: { id: true, name: true, currency: true } } } },
      },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return { success: true, data: product };
  }

  async findByBarcode(tenantId: string, barcode: string) {
    const product = await this.prisma.product.findFirst({
      where: { tenantId, barcode, deletedAt: null },
      include: {
        stockLevels: { include: { warehouse: { select: { id: true, name: true } } } },
      },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return { success: true, data: product };
  }

  async create(tenantId: string, data: {
    code: string;
    name: string;
    barcode?: string;
    description?: string;
    category?: string;
    subcategory?: string;
    unit?: string;
    costPrice?: number;
    salePrice?: number;
    ivaPct?: number;
    weight?: number;
    managesStock?: boolean;
    managesSerial?: boolean;
    minStock?: number;
    notes?: string;
  }) {
    const existing = await this.prisma.product.findFirst({
      where: { tenantId, code: data.code, deletedAt: null },
    });
    if (existing) throw new ConflictException(`Ya existe un producto con código ${data.code}`);

    const product = await this.prisma.product.create({
      data: { tenantId, ...data },
    });

    if (data.managesStock !== false) {
      const warehouses = await this.prisma.warehouse.findMany({
        where: { tenantId, active: true },
      });
      if (warehouses.length > 0) {
        await this.prisma.productStock.createMany({
          data: warehouses.map((wh) => ({
            productId: product.id,
            warehouseId: wh.id,
            minQty: data.minStock ?? 0,
          })),
        });
      }
    }

    return { success: true, data: product };
  }

  async update(tenantId: string, id: string, data: Record<string, unknown>) {
    const existing = await this.prisma.product.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Producto no encontrado');

    const product = await this.prisma.product.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
    });
    return { success: true, data: product };
  }

  async softDelete(tenantId: string, id: string) {
    const existing = await this.prisma.product.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Producto no encontrado');

    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), active: false },
    });
    return { success: true };
  }

  async getCategories(tenantId: string) {
    const categories = await this.prisma.product.groupBy({
      by: ['category'],
      where: { tenantId, deletedAt: null, active: true, category: { not: null } },
      _count: true,
    });
    return { success: true, data: categories };
  }
}
