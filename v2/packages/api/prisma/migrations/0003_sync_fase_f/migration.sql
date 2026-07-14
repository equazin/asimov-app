-- Sync Fase F (v4.18.0): cotizaciones de dólar, vínculos entre documentos y
-- componentes de kits. Los `id` son UUIDs generados por el desktop y viajan
-- tal cual para que las 3 PCs del tenant converjan a la misma fila.

-- --- exchange_rates ---------------------------------------------------------

CREATE TABLE "exchange_rates" (
    "id"         TEXT           NOT NULL,
    "tenantId"   TEXT           NOT NULL,
    "casa"       TEXT           NOT NULL,
    "nombre"     TEXT           NOT NULL,
    "compra"     DECIMAL(14, 4) NOT NULL,
    "venta"      DECIMAL(14, 4) NOT NULL,
    "sourceDate" TEXT,
    "fetchedAt"  TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3)   NOT NULL,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "exchange_rates_tenantId_casa_fetchedAt_idx"
    ON "exchange_rates"("tenantId", "casa", "fetchedAt");
CREATE INDEX "exchange_rates_tenantId_updatedAt_idx"
    ON "exchange_rates"("tenantId", "updatedAt");

ALTER TABLE "exchange_rates"
    ADD CONSTRAINT "exchange_rates_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- --- document_links ---------------------------------------------------------

CREATE TABLE "document_links" (
    "id"         TEXT         NOT NULL,
    "tenantId"   TEXT         NOT NULL,
    "sourceType" TEXT         NOT NULL,
    "sourceId"   TEXT         NOT NULL,
    "targetType" TEXT         NOT NULL,
    "targetId"   TEXT         NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_links_tenantId_sourceType_sourceId_targetType_targetId_key"
    ON "document_links"("tenantId", "sourceType", "sourceId", "targetType", "targetId");
CREATE INDEX "document_links_tenantId_sourceType_sourceId_idx"
    ON "document_links"("tenantId", "sourceType", "sourceId");
CREATE INDEX "document_links_tenantId_targetType_targetId_idx"
    ON "document_links"("tenantId", "targetType", "targetId");
CREATE INDEX "document_links_tenantId_updatedAt_idx"
    ON "document_links"("tenantId", "updatedAt");

ALTER TABLE "document_links"
    ADD CONSTRAINT "document_links_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- --- kit_components ---------------------------------------------------------

CREATE TABLE "kit_components" (
    "id"                 TEXT           NOT NULL,
    "tenantId"           TEXT           NOT NULL,
    "kitArticleId"       TEXT           NOT NULL,
    "componentArticleId" TEXT           NOT NULL,
    "qty"                DECIMAL(14, 3) NOT NULL,
    "createdAt"          TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3)   NOT NULL,

    CONSTRAINT "kit_components_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kit_components_tenantId_kitArticleId_componentArticleId_key"
    ON "kit_components"("tenantId", "kitArticleId", "componentArticleId");
CREATE INDEX "kit_components_tenantId_kitArticleId_idx"
    ON "kit_components"("tenantId", "kitArticleId");
CREATE INDEX "kit_components_tenantId_updatedAt_idx"
    ON "kit_components"("tenantId", "updatedAt");

ALTER TABLE "kit_components"
    ADD CONSTRAINT "kit_components_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
