import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const plans = await Promise.all([
    prisma.plan.upsert({
      where: { id: 'plan-trial' },
      update: {},
      create: {
        id: 'plan-trial',
        name: 'Trial',
        tier: 'trial',
        priceArs: 0,
        priceUsd: 0,
        maxUsers: 3,
        maxBranches: 1,
        maxDocsPerMonth: 100,
        maxMobileDevices: 1,
        hasAfip: false,
        hasPublicApi: false,
        hasCustomDomain: false,
        hasPrioritySupport: false,
      },
    }),
    prisma.plan.upsert({
      where: { id: 'plan-basic' },
      update: {},
      create: {
        id: 'plan-basic',
        name: 'Basic',
        tier: 'basic',
        priceArs: 15000,
        priceUsd: 15,
        maxUsers: 5,
        maxBranches: 1,
        maxDocsPerMonth: 500,
        maxMobileDevices: 1,
        hasAfip: false,
        hasPublicApi: false,
        hasCustomDomain: false,
        hasPrioritySupport: false,
      },
    }),
    prisma.plan.upsert({
      where: { id: 'plan-pro' },
      update: {},
      create: {
        id: 'plan-pro',
        name: 'Pro',
        tier: 'pro',
        priceArs: 45000,
        priceUsd: 45,
        maxUsers: 15,
        maxBranches: 3,
        maxDocsPerMonth: 5000,
        maxMobileDevices: 5,
        hasAfip: true,
        hasPublicApi: false,
        hasCustomDomain: true,
        hasPrioritySupport: false,
      },
    }),
    prisma.plan.upsert({
      where: { id: 'plan-enterprise' },
      update: {},
      create: {
        id: 'plan-enterprise',
        name: 'Enterprise',
        tier: 'enterprise',
        priceArs: 120000,
        priceUsd: 120,
        maxUsers: 9999,
        maxBranches: 9999,
        maxDocsPerMonth: 999999,
        maxMobileDevices: 9999,
        hasAfip: true,
        hasPublicApi: true,
        hasCustomDomain: true,
        hasPrioritySupport: true,
      },
    }),
  ]);

  const passwordHash = await hash('asimov2026', 12);

  const demoTenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      id: 'tenant-demo',
      name: 'Empresa Demo',
      slug: 'demo',
      planId: 'plan-pro',
      country: 'AR',
      currency: 'ARS',
      fiscalId: '30-12345678-9',
      fiscalName: 'Empresa Demo S.R.L.',
      fiscalAddress: 'Av. Corrientes 1234, CABA',
      phone: '11-4567-8900',
      email: 'demo@asimov.app',
    },
  });

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: demoTenant.id, email: 'admin@demo.asimov.app' } },
    update: {},
    create: {
      tenantId: demoTenant.id,
      email: 'admin@demo.asimov.app',
      name: 'Admin Demo',
      passwordHash,
      role: 'owner',
    },
  });

  await prisma.subscription.upsert({
    where: { id: 'sub-demo' },
    update: {},
    create: {
      id: 'sub-demo',
      tenantId: demoTenant.id,
      planId: 'plan-pro',
      status: 'active',
      paymentProvider: 'manual',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.warehouse.upsert({
    where: { id: 'wh-demo-main' },
    update: {},
    create: {
      id: 'wh-demo-main',
      tenantId: demoTenant.id,
      name: 'Depósito Principal',
      afipPointOfSale: '00001',
    },
  });

  await prisma.cashAccount.upsert({
    where: { id: 'cash-demo-main' },
    update: {},
    create: {
      id: 'cash-demo-main',
      tenantId: demoTenant.id,
      name: 'Caja Principal',
    },
  });

  await prisma.sequence.createMany({
    skipDuplicates: true,
    data: [
      { tenantId: demoTenant.id, name: 'quote', prefix: 'PR' },
      { tenantId: demoTenant.id, name: 'sale_order', prefix: 'PV' },
      { tenantId: demoTenant.id, name: 'invoice', prefix: 'FC' },
      { tenantId: demoTenant.id, name: 'credit_note', prefix: 'NC' },
      { tenantId: demoTenant.id, name: 'debit_note', prefix: 'ND' },
      { tenantId: demoTenant.id, name: 'delivery_note', prefix: 'RE' },
      { tenantId: demoTenant.id, name: 'receipt', prefix: 'RC' },
      { tenantId: demoTenant.id, name: 'purchase_order', prefix: 'OC' },
      { tenantId: demoTenant.id, name: 'goods_receipt', prefix: 'RM' },
      { tenantId: demoTenant.id, name: 'purchase_invoice', prefix: 'FP' },
      { tenantId: demoTenant.id, name: 'payment_order', prefix: 'OP' },
    ],
  });

  const defaultTemplates = [
    { id: 'tpl-invoice-classic', name: 'Factura Clásica', type: 'invoice' },
    { id: 'tpl-invoice-modern', name: 'Factura Moderna', type: 'invoice' },
    { id: 'tpl-delivery-classic', name: 'Remito Clásico', type: 'delivery_note' },
    { id: 'tpl-quote-classic', name: 'Presupuesto Clásico', type: 'quote' },
  ];

  for (const tpl of defaultTemplates) {
    await prisma.printTemplate.upsert({
      where: { id: tpl.id },
      update: {},
      create: {
        id: tpl.id,
        name: tpl.name,
        type: tpl.type,
        html: `<div class="template ${tpl.type}">{{content}}</div>`,
        isDefault: tpl.name.includes('Clásica') || tpl.name.includes('Clásico'),
      },
    });
  }

  console.log(`Seed complete: ${plans.length} plans, 1 demo tenant, 1 admin user`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
