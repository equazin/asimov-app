# Flujo de compras: remitos y facturas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renombrar las recepciones como remitos de compra, exponer las facturas de compra en el shell y enlazar Orden de compra → Factura de compra → Remito de compra con precarga de proveedor e ítems.

**Architecture:** Se mantienen las tablas y canales internos existentes para conservar compatibilidad, mientras que la interfaz adopta la terminología “Remito de compra”. Los vínculos se guardan en `document_links`; los formularios consultan documentos pendientes mediante IPC y precargan sus renglones antes de persistir el documento destino.

**Tech Stack:** Electron, TypeScript, HTML/JavaScript, SQLite, Vitest.

## Global Constraints

- Conservar todos los remitos de compra existentes en `goods_receipts` sin migraciones destructivas.
- El remito de compra continúa siendo el único documento de compras que incrementa stock.
- La factura de compra no modifica stock.
- Mantener los cambios locales de `graphify-out` fuera del commit.
- Publicar el resultado en la rama `main`.

---

### Task 1: Vínculos y consultas del flujo de compras

**Files:**
- Modify: `src/document-links.ts`
- Modify: `src/documents.ts`
- Modify: `src/ipc.ts`
- Test: `test/document-links.test.ts`
- Test: `test/documents.test.ts`

**Interfaces:**
- Produces: `listPendingPurchaseOrders(supplierId?: string): PendingPurchaseDoc[]`.
- Produces: `listPendingPurchaseInvoices(supplierId?: string): PendingPurchaseDoc[]`.
- Extends: `getSourceItems(docType, docId)` for `purchase-order` and `purchase-invoice`.
- Consumes: `GoodsReceiptForm.origen` and `PurchaseInvoiceForm.origen` as `DocumentSource`.

- [x] Escribir pruebas que cubran precarga, persistencia, trazabilidad y exclusión de documentos ya vinculados.
- [x] Ejecutar `npx vitest run test/document-links.test.ts test/documents.test.ts` y confirmar que las pruebas nuevas fallen.
- [x] Extender el modelo de vínculos, consultas IPC y persistencia transaccional.
- [x] Reejecutar las pruebas focalizadas y confirmar que pasen.

### Task 2: Selectores en factura y remito de compra

**Files:**
- Modify: `src/new-purchase-invoice-preload.ts`
- Modify: `src/new-purchase-invoice.html`
- Modify: `src/new-goods-receipt-preload.ts`
- Modify: `src/new-goods-receipt.html`
- Test: `test/purchase-document-flow-ui.test.ts`

**Interfaces:**
- Consumes: `listPendingPurchaseOrders`, `listPendingPurchaseInvoices` y `getSourceItems` vía IPC.
- Produces: payloads con `origen: { tipo, id }`.

- [x] Escribir pruebas de contrato de preload y presencia de controles de UI.
- [x] Agregar “Traer orden de compra” a la factura, precargando proveedor e ítems.
- [x] Agregar “Traer factura” al remito, precargando proveedor, cantidades e identificación.
- [x] Validar reemplazo de ítems existentes y estados vacíos sin perder datos.

### Task 3: Navegación y terminología de compras

**Files:**
- Modify: `src/shell.html`
- Modify: `src/menu.ts`
- Modify: `src/main.ts`
- Modify: `src/documents.ts`
- Test: `test/purchase-document-flow-ui.test.ts`

**Interfaces:**
- Produces: vista `facturas-compra` cargada mediante `asimov().purchaseInvoices.list(search)`.
- Preserves: vista interna `recepciones` y canal `goods-receipt` por compatibilidad.

- [x] Cambiar toda la copia visible del módulo a “Remitos de compra”.
- [x] Agregar navegación, vista, buscador y botón “Nueva factura de compra”.
- [x] Mantener la ruta antigua y sumar `/compras/remitos` y `/compras/facturas`.
- [x] Verificar las pruebas de UI.

### Task 4: Revisión y entrega

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: commit en `main` y push a `origin/main`.

- [x] Ejecutar `npm test`, `npm run build` y el smoke test de Electron.
- [x] Revisar pruebas e implementación por corrección, legibilidad, arquitectura, seguridad y rendimiento.
- [x] Incrementar la versión, crear el commit y ejecutar `git push origin main`.
