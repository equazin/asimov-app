import { describe, expect, it, vi } from 'vitest';
import { SyncService } from './sync.service';

function serviceWithPrisma() {
  const prisma = {
    client: { upsert: vi.fn(), updateMany: vi.fn() },
    supplier: { upsert: vi.fn(), updateMany: vi.fn() },
    product: { upsert: vi.fn(), updateMany: vi.fn() },
    integrationConfig: { upsert: vi.fn(), updateMany: vi.fn() },
    opportunity: { upsert: vi.fn(), updateMany: vi.fn() },
    activity: { upsert: vi.fn(), updateMany: vi.fn() },
    task: { upsert: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return { prisma, service: new SyncService(prisma as never) };
}

describe('SyncService — contratos del desktop', () => {
  it('acepta el shape histórico name/taxId/ivaCondition de clientes', async () => {
    const { prisma, service } = serviceWithPrisma();

    const result = await service.pushChanges('tenant-1', 'user-1', [{
      entity: 'client', action: 'update', id: 'client-1',
      data: { code: 'C1', name: 'Cliente local', taxId: '20123456789', ivaCondition: 'responsable_inscripto' },
    }]);

    expect(result).toEqual({ processed: 1, conflicts: [], conflictDetails: [] });
    expect(prisma.client.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        id: 'client-1', tenantId: 'tenant-1', businessName: 'Cliente local', cuit: '20123456789',
        fiscalType: 'responsable_inscripto',
      }),
    }));
  });

  it('acepta price, cost e ivaPct de productos del desktop', async () => {
    const { prisma, service } = serviceWithPrisma();

    const result = await service.pushChanges('tenant-1', 'user-1', [{
      entity: 'product', action: 'update', id: 'product-1',
      data: { code: 'P1', name: 'Producto', price: 150, cost: 100, ivaPct: 10.5 },
    }]);

    expect(result.processed).toBe(1);
    expect(prisma.product.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ salePrice: 150, costPrice: 100, ivaPct: 10.5 }),
    }));
  });

  it('no convierte una falla de auditoría posterior en conflicto de sync', async () => {
    const { prisma, service } = serviceWithPrisma();
    prisma.auditLog.create.mockRejectedValueOnce(new Error('audit unavailable'));

    const result = await service.pushChanges('tenant-1', 'user-1', [{
      entity: 'client', action: 'update', id: 'client-audit',
      data: { code: 'C-AUDIT', name: 'Cliente aplicado' },
    }]);

    expect(prisma.client.upsert).toHaveBeenCalledOnce();
    expect(result).toEqual({ processed: 1, conflicts: [], conflictDetails: [] });
  });

  it('devuelve el motivo y la entidad cuando una mutación realmente falla', async () => {
    const { prisma, service } = serviceWithPrisma();
    prisma.product.upsert.mockRejectedValueOnce(new Error('Código duplicado'));

    const result = await service.pushChanges('tenant-1', 'user-1', [{
      entity: 'product', action: 'update', id: 'product-bad', data: { code: 'DUP', name: 'Duplicado' },
    }]);

    expect(result).toEqual({
      processed: 0,
      conflicts: ['product-bad'],
      conflictDetails: [{ id: 'product-bad', entity: 'product', error: 'Código duplicado' }],
    });
  });

  it('elimina credenciales de la configuración antes de guardarla', async () => {
    const { prisma, service } = serviceWithPrisma();

    await service.pushChanges('tenant-1', 'user-1', [{
      entity: 'integration_config', action: 'update', id: 'air',
      data: { provider: 'air', config: { enabled: true, username: 'usuario', password: 'no-subir', access_token: 'no-subir' } },
    }]);

    expect(prisma.integrationConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ config: { enabled: true, username: 'usuario' } }),
      update: expect.objectContaining({ config: { enabled: true, username: 'usuario' } }),
    }));
  });

  it('aplica configuración ARCA sin certificados', async () => {
    const { prisma, service } = serviceWithPrisma();

    const result = await service.pushChanges('tenant-1', 'user-1', [{
      entity: 'integration_config',
      action: 'update',
      id: 'afip',
      data: {
        provider: 'afip',
        config: { enabled: true, cuit: '30123456780', environment: 'prod', pointOfSale: 1, hasCert: true, hasKey: true, certificate: 'SECRET', privateKey: 'SECRET' },
      },
    }]);

    expect(result.processed).toBe(1);
    expect(prisma.integrationConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        config: { enabled: true, cuit: '30123456780', environment: 'prod', pointOfSale: 1, hasCert: true, hasKey: true },
      }),
      update: expect.objectContaining({
        config: { enabled: true, cuit: '30123456780', environment: 'prod', pointOfSale: 1, hasCert: true, hasKey: true },
      }),
    }));
  });

  it('aplica oportunidad CRM desde desktop', async () => {
    const { prisma, service } = serviceWithPrisma();

    const result = await service.pushChanges('tenant-1', 'user-1', [{
      entity: 'crm_opportunity',
      action: 'update',
      id: 'opp-1',
      data: { name: 'Venta grande', stage: 'negotiation', value: 10000, probability: 50 },
    }]);

    expect(result.processed).toBe(1);
    expect(result.conflicts).toHaveLength(0);
    expect(prisma.opportunity.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        id: 'opp-1',
        tenantId: 'tenant-1',
        name: 'Venta grande',
        stage: 'negotiation',
        value: 10000,
        probability: 50,
      }),
    }));
  });
});
