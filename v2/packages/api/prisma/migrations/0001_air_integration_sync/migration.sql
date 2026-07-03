-- AIR integration state shared by tenant across desktop PCs.

CREATE TABLE "integration_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "external_catalog_products" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "partNumber" TEXT,
    "brand" TEXT,
    "category" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'un',
    "priceUsd" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "priceArs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ivaPct" DECIMAL(5,2) NOT NULL DEFAULT 21,
    "stock" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "rawJson" JSONB,
    "syncedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_catalog_products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_configs_tenantId_provider_key" ON "integration_configs"("tenantId", "provider");
CREATE INDEX "integration_configs_tenantId_provider_idx" ON "integration_configs"("tenantId", "provider");

CREATE UNIQUE INDEX "external_catalog_products_tenantId_provider_externalCode_key" ON "external_catalog_products"("tenantId", "provider", "externalCode");
CREATE INDEX "external_catalog_products_tenantId_provider_active_idx" ON "external_catalog_products"("tenantId", "provider", "active");
CREATE INDEX "external_catalog_products_tenantId_provider_externalCode_idx" ON "external_catalog_products"("tenantId", "provider", "externalCode");

ALTER TABLE "integration_configs" ADD CONSTRAINT "integration_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_catalog_products" ADD CONSTRAINT "external_catalog_products_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
