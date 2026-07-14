# Conversión USD y ajustes fiscales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir a ARS los precios de factura ingresados en USD antes de persistir y autorizar, y permitir iniciar notas de crédito/débito asociadas desde una factura autorizada.

**Architecture:** La conversión fiscal vive en `documents.ts`, en el límite confiable antes de SQLite y ARCA; el renderer sólo anticipa el mismo cálculo para mostrar totales e impresión. Los ajustes fiscales reutilizan el circuito NC/ND existente y reciben una precarga desde la factura original, evitando un segundo modelo de autorización.

**Tech Stack:** Electron, TypeScript, SQLite, WSFEv1, HTML/JavaScript, Vitest.

## Global Constraints

- ARCA continúa recibiendo `MonId=PES` y `MonCotiz=1`.
- Un precio ingresado en USD se multiplica por la cotización USD→ARS antes de calcular base imponible, IVA y total.
- Una factura USD sin cotización positiva no puede guardarse ni autorizarse.
- Una factura con CAE no se elimina ni se anula localmente.
- La anulación fiscal se inicia mediante nota de crédito vinculada; la nota de débito también se vincula a la original.
- Las notas precargadas desde una factura autorizada usan sus importes ARS y no vuelven a convertirlos.
- Facturas históricas y formularios que no informen moneda conservan compatibilidad ARS en el backend.

---

### Task 1: Conversión fiscal confiable

**Files:**
- Modify: `src/db.ts`
- Modify: `src/documents.ts`
- Test: `test/documents.test.ts`

**Interfaces:**
- Consumes: `InvoiceForm.monedaPrecios`, `InvoiceForm.cotizacionUsd`, `InvoiceForm.items`.
- Produces: `normalizeInvoiceItemsToArs(form): SaleDocItem[]` y columnas de factura/ítems siempre expresadas en ARS.

- [ ] **Step 1: Escribir pruebas que exijan la conversión 1.394,55 USD × 1.505 = 2.098.797,75 ARS**

La prueba persiste ítems netos por 1.256,83 USD con IVA total 137,72 USD y verifica cabecera e ítems en ARS. Otra prueba exige error si `monedaPrecios="USD"` no trae cotización válida; una tercera conserva importes cuando la moneda es ARS.

- [ ] **Step 2: Ejecutar la prueba para observar el fallo**

Run: `npx vitest run test/documents.test.ts`

Expected: FAIL antes de implementar la normalización.

- [ ] **Step 3: Implementar la normalización en el proceso principal**

`persistInvoice` debe convertir una copia de cada ítem con `precioARS = precioOriginal * cotizacionUsd` sólo para USD, y ejecutar `computeSaleTotals` y los INSERT exclusivamente con esa copia. Debe persistir `source_currency` para auditoría.

- [ ] **Step 4: Repetir las pruebas**

Run: `npx vitest run test/documents.test.ts`

Expected: PASS.

### Task 2: Mostrar correctamente USD→ARS en el formulario

**Files:**
- Modify: `src/new-invoice.html`
- Test: `test/new-invoice-margin-kit-ui.test.ts`

**Interfaces:**
- Consumes: selector `selMonedaPrecios`, cotización `txtCotizacionUsd`, precios editables de `items`.
- Produces: totales ARS, payload con `monedaPrecios`, impresión previa en ARS.

- [ ] **Step 1: Agregar pruebas de contrato del formulario**

Las pruebas deben comprobar selector USD predeterminado, multiplicador central `invoiceCurrencyFactor`, recálculo al cambiar cotización/moneda y envío de `monedaPrecios`.

- [ ] **Step 2: Implementar selector y cálculo visual**

El subtotal de cada fila conserva la moneda de entrada; Totales e impresión usan `precio * factor`, donde `factor=cotización` para USD y `1` para ARS. Si falta cotización en USD, guardar/autorizar informa un error accionable.

- [ ] **Step 3: Ejecutar pruebas del formulario y persistencia**

Run: `npx vitest run test/new-invoice-margin-kit-ui.test.ts test/documents.test.ts`

Expected: PASS.

### Task 3: Acciones de nota de crédito y débito asociadas

**Files:**
- Modify: `src/main.ts`
- Modify: `src/preload.ts`
- Modify: `src/new-invoice-preload.ts`
- Modify: `src/new-invoice.html`
- Modify: `src/shell.html`
- Test: `test/shell-invoice-fiscal-status.test.ts`
- Test: `test/document-links.test.ts`
- Test: `test/afip.test.ts`

**Interfaces:**
- Consumes: `openInvoiceAdjustment(invoiceId, kind)` con `kind: "NC" | "ND"`.
- Produces: ventana de factura precargada con tipo, cliente, ítems ARS y `origen={tipo:"invoice", id, numero}`.

- [ ] **Step 1: Probar que el estado fiscal ofrece ambas acciones sólo con CAE**

La prueba debe localizar los botones y verificar que invocan `openInvoiceAdjustment` con NC/ND.

- [ ] **Step 2: Implementar el canal de precarga**

El proceso principal valida existencia y CAE, consulta cliente e ítems, abre la ventana existente y envía `invoice-adjustment:prefill`; el preload expone `onAdjustmentPrefill`.

- [ ] **Step 3: Aplicar la precarga en el formulario**

El formulario fija NC/ND, moneda ARS, cliente, ítems, cotización histórica y vínculo de origen. La NC queda lista para acreditar el total; la ND queda editable antes de autorizar.

- [ ] **Step 4: Verificar asociación WSFE existente**

Run: `npx vitest run test/shell-invoice-fiscal-status.test.ts test/document-links.test.ts test/afip.test.ts`

Expected: PASS e inclusión de `CbtesAsoc` para NC/ND.

### Task 4: Revisión y release

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: implementación aprobada.
- Produces: commit, push y release público con autoupdate.

- [ ] **Step 1: Revisar corrección, arquitectura, seguridad y rendimiento**

Debe confirmarse que la conversión ocurre una sola vez, que reintentar CAE usa el snapshot ARS y que ninguna acción modifica una factura autorizada.

- [ ] **Step 2: Ejecutar suite, build y smoke test**

Run: `npm test`

Run: `npm run build`

Run: `npm run rebuild:electron && npm run smoke-test`

Expected: todos los comandos PASS.

- [ ] **Step 3: Incrementar versión patch y publicar**

Run: `npm version patch --no-git-tag-version`

Run: `npm run release`

Expected: instalador, blockmap y `latest.yml` publicados en GitHub.
