-- Documentos multi-PC del desktop: snapshot lossless (cabecera + ítems + movimientos).

CREATE TABLE "synced_documents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "synced_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "synced_documents_tenantId_docId_key" ON "synced_documents"("tenantId", "docId");

CREATE INDEX "synced_documents_tenantId_updatedAt_idx" ON "synced_documents"("tenantId", "updatedAt");

ALTER TABLE "synced_documents" ADD CONSTRAINT "synced_documents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
