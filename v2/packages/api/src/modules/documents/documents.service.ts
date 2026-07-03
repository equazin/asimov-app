import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

interface CreateDocumentDto {
  type: string;
  clientId?: string;
  supplierId?: string;
  counterpartyName: string;
  date: string;
  dueDate?: string;
  invoiceType?: string;
  pointOfSale?: string;
  currency?: string;
  exchangeRate?: number;
  warehouseId?: string;
  relatedDocumentId?: string;
  notes?: string;
  origin?: string;
  items: Array<{
    productId?: string;
    code: string;
    description: string;
    unit?: string;
    qty: number;
    unitPrice: number;
    discount?: number;
    ivaPct?: number;
  }>;
}

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: {
    type?: string;
    status?: string;
    clientId?: string;
    supplierId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      tenantId,
      deletedAt: null,
      ...(query.type && { type: query.type }),
      ...(query.status && { status: query.status }),
      ...(query.clientId && { clientId: query.clientId }),
      ...(query.supplierId && { supplierId: query.supplierId }),
      ...(query.search && {
        OR: [
          { number: { contains: query.search, mode: 'insensitive' } },
          { counterpartyName: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    if (query.dateFrom || query.dateTo) {
      where.date = {};
      if (query.dateFrom) (where.date as Record<string, unknown>).gte = new Date(query.dateFrom);
      if (query.dateTo) (where.date as Record<string, unknown>).lte = new Date(query.dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.document.findMany({
        where: where as any,
        skip,
        take: limit,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
        include: {
          items: { orderBy: { sortOrder: 'asc' } },
          client: { select: { id: true, businessName: true, cuit: true } },
          supplier: { select: { id: true, businessName: true, cuit: true } },
          user: { select: { id: true, name: true } },
        },
      }),
      this.prisma.document.count({ where: where as any }),
    ]);

    return {
      success: true,
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(tenantId: string, id: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        items: { orderBy: { sortOrder: 'asc' }, include: { product: { select: { id: true, name: true, code: true } } } },
        client: true,
        supplier: true,
        user: { select: { id: true, name: true } },
        relatedDocument: { select: { id: true, type: true, number: true } },
        derivedDocuments: { select: { id: true, type: true, number: true, status: true } },
      },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    return { success: true, data: doc };
  }

  async create(tenantId: string, userId: string, origin: string, dto: CreateDocumentDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('El documento debe tener al menos un ítem');
    }

    const number = await this.getNextNumber(tenantId, dto.type, dto.pointOfSale ?? '00001');

    const items = dto.items.map((item, idx) => {
      const discount = item.discount ?? 0;
      const subtotal = item.qty * item.unitPrice * (1 - discount / 100);
      const ivaPct = item.ivaPct ?? 21;
      const ivaAmount = subtotal * (ivaPct / 100);
      return { ...item, subtotal, ivaAmount, ivaPct, discount, sortOrder: idx, unit: item.unit ?? 'un' };
    });

    const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0);
    const ivaAmount = items.reduce((sum, i) => sum + i.ivaAmount, 0);
    const total = subtotal + ivaAmount;

    const doc = await this.prisma.document.create({
      data: {
        tenantId,
        type: dto.type,
        number,
        pointOfSale: dto.pointOfSale ?? '00001',
        clientId: dto.clientId,
        supplierId: dto.supplierId,
        counterpartyName: dto.counterpartyName,
        date: new Date(dto.date),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        invoiceType: dto.invoiceType,
        currency: dto.currency ?? 'ARS',
        exchangeRate: dto.exchangeRate ?? 1,
        subtotal,
        ivaAmount,
        total,
        warehouseId: dto.warehouseId,
        relatedDocumentId: dto.relatedDocumentId,
        userId,
        origin,
        notes: dto.notes,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            code: item.code,
            description: item.description,
            unit: item.unit,
            qty: item.qty,
            unitPrice: item.unitPrice,
            discount: item.discount,
            ivaPct: item.ivaPct,
            subtotal: item.subtotal,
            ivaAmount: item.ivaAmount,
            sortOrder: item.sortOrder,
          })),
        },
      },
      include: { items: true },
    });

    await this.incrementUsage(tenantId);

    return { success: true, data: doc };
  }

  async updateStatus(tenantId: string, id: string, status: string, userId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');

    const updated = await this.prisma.document.update({
      where: { id },
      data: { status, updatedAt: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'update',
        entityType: 'document',
        entityId: id,
        oldValues: { status: doc.status },
        newValues: { status },
        origin: 'web',
      },
    });

    return { success: true, data: updated };
  }

  private async getNextNumber(tenantId: string, type: string, pointOfSale: string): Promise<string> {
    const seq = await this.prisma.sequence.upsert({
      where: { tenantId_name: { tenantId, name: type } },
      update: { last: { increment: 1 } },
      create: { tenantId, name: type, prefix: type.toUpperCase().slice(0, 2), last: 1 },
    });

    return `${pointOfSale}-${String(seq.last).padStart(8, '0')}`;
  }

  private async incrementUsage(tenantId: string) {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    await this.prisma.tenantUsage.upsert({
      where: { tenantId_month: { tenantId, month } },
      update: { docsCreated: { increment: 1 } },
      create: { tenantId, month, docsCreated: 1 },
    });
  }
}
