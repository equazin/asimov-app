import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DocumentsService } from './documents.service';
import type { PrismaService } from '../../common/prisma.service';

function makePrismaMock(lastSeq = 5) {
  return {
    sequence: {
      upsert: vi.fn().mockResolvedValue({ last: lastSeq }),
    },
    document: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'doc1', ...data }),
      ),
    },
    tenantUsage: {
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
}

const baseDto = {
  type: 'invoice',
  counterpartyName: 'Cliente SA',
  date: '2026-07-06',
  pointOfSale: '00001',
  items: [
    { code: 'A1', description: 'Prod A', qty: 2, unitPrice: 100, ivaPct: 21 },
    { code: 'B2', description: 'Prod B', qty: 1, unitPrice: 50, discount: 10, ivaPct: 10.5 },
  ],
};

describe('DocumentsService.create — IVA / totales / numeración', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  beforeEach(() => { prisma = makePrismaMock(5); });

  it('calcula subtotal, IVA y total del header a partir de los ítems (con descuento)', async () => {
    const service = new DocumentsService(prisma as unknown as PrismaService);
    await service.create('t1', 'u1', 'web', baseDto);

    const data = prisma.document.create.mock.calls[0][0].data;
    // A: 2*100=200 (IVA 21% → 42). B: 50*0.9=45 (IVA 10.5% → 4.725).
    expect(data.subtotal).toBeCloseTo(245, 3);
    expect(data.ivaAmount).toBeCloseTo(46.725, 3);
    expect(data.total).toBeCloseTo(291.725, 3);
  });

  it('numeración: punto de venta + correlativo del server con padding a 8', async () => {
    const service = new DocumentsService(prisma as unknown as PrismaService);
    await service.create('t1', 'u1', 'web', baseDto);
    expect(prisma.document.create.mock.calls[0][0].data.number).toBe('00001-00000005');
  });

  it('cada ítem lleva su subtotal e IVA calculados', async () => {
    const service = new DocumentsService(prisma as unknown as PrismaService);
    await service.create('t1', 'u1', 'web', baseDto);
    const items = prisma.document.create.mock.calls[0][0].data.items.create;
    expect(items[0]).toMatchObject({ subtotal: 200 });
    expect(items[0].ivaAmount).toBeCloseTo(42, 3);
    expect(items[1].subtotal).toBeCloseTo(45, 3);
    expect(items[1].ivaAmount).toBeCloseTo(4.725, 3);
  });

  it('ivaPct por defecto 21 cuando el ítem no lo trae', async () => {
    const service = new DocumentsService(prisma as unknown as PrismaService);
    await service.create('t1', 'u1', 'web', {
      ...baseDto,
      items: [{ code: 'C', description: 'C', qty: 1, unitPrice: 100 }],
    });
    const data = prisma.document.create.mock.calls[0][0].data;
    expect(data.ivaAmount).toBeCloseTo(21, 3);
  });

  it('incrementa el uso mensual del tenant (docsCreated)', async () => {
    const service = new DocumentsService(prisma as unknown as PrismaService);
    await service.create('t1', 'u1', 'web', baseDto);
    expect(prisma.tenantUsage.upsert).toHaveBeenCalledOnce();
  });

  it('sin ítems → BadRequest', async () => {
    const service = new DocumentsService(prisma as unknown as PrismaService);
    await expect(service.create('t1', 'u1', 'web', { ...baseDto, items: [] })).rejects.toThrow(/al menos un ítem/);
  });
});
