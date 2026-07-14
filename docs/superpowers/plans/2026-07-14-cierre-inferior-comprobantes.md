# Cierre inferior para todos los comprobantes - Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anclar al final de la hoja el resumen monetario, las observaciones y el pie de Facturas, Remitos, Pedidos, Presupuestos y Recibos.

**Architecture:** El renderer compartido construirá un único `documentSummaryBlock(type, data)` dentro de `document-end`. Facturas mostrarán QR/CAE a la izquierda y totales a la derecha; Pedidos y Presupuestos mostrarán sus totales a la derecha; Recibos mostrarán el total recibido a la derecha; Remitos, que no imprimen precios, conservarán observaciones y pie anclados sin inventar importes.

**Tech Stack:** JavaScript ES5 para el renderer de Electron, CSS de impresión y Vitest.

## Global Constraints

- Mantener papel blanco y texto negro en todos los comprobantes.
- No agregar dependencias.
- Conservar el flujo multipágina cuando haya más de 16 ítems.
- Publicar una versión patch con instalador y manifiesto de autoupdate.

---

### Task 1: Cubrir los cinco formatos con pruebas

**Files:**
- Modify: `test/comprobante-print.test.ts`

**Interfaces:**
- Consumes: `window.renderComprobante(type, data)`.
- Produces: cobertura del anclaje y del resumen inferior por tipo.

- [ ] **Step 1: Generalizar el helper de render de prueba**

Crear `renderDocument(type, itemCount)` con datos de totales y CAE para comprobar cada formato.

- [ ] **Step 2: Agregar la regresión de los cinco formatos**

Verificar que Factura, Remito, Pedido, Presupuesto y Recibo reciban `document-end-pinned` con hasta 16 ítems; que Factura contenga QR antes de Totales; que Pedido y Presupuesto tengan Totales; que Recibo tenga `TOTAL RECIBIDO`; y que Remito no invente un bloque monetario.

- [ ] **Step 3: Ejecutar la prueba y confirmar que falla**

Run: `npx vitest run test/comprobante-print.test.ts`

Expected: FAIL porque actualmente solamente Factura ancla `document-end` y Recibo mantiene el total en el membrete.

### Task 2: Unificar el resumen inferior

**Files:**
- Modify: `src/comprobante-print.js`
- Modify: `src/comprobante-print.css`
- Test: `test/comprobante-print.test.ts`

**Interfaces:**
- Consumes: `totalsBlock(type, data)` y `caeBlock(data)`.
- Produces: `documentSummaryBlock(type, data)`.

- [ ] **Step 1: Adaptar los totales del Recibo**

Hacer que `totalsBlock("recibo", data)` genere una única fila `TOTAL RECIBIDO` usando `data.total`; mantener Remito sin importes.

- [ ] **Step 2: Crear el resumen común**

Reemplazar `fiscalSummaryBlock(data)` por `documentSummaryBlock(type, data)`, con autorización fiscal solamente para Factura y Totales según el tipo.

- [ ] **Step 3: Mover todos los totales a `document-end`**

Eliminar los totales del flujo central y el importe duplicado del membrete del Recibo. Anclar `document-end` para cualquier formato con hasta 16 ítems.

- [ ] **Step 4: Generalizar las clases CSS**

Renombrar `.fiscal-summary` a `.document-summary`, mantener dos columnas y colapsar a una sola columna de totales cuando no haya autorización fiscal.

- [ ] **Step 5: Ejecutar la prueba focalizada**

Run: `npx vitest run test/comprobante-print.test.ts`

Expected: 4 tests passed.

### Task 3: Verificar impresión y publicar

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: renderer y estilos compilados.
- Produces: release estable con autoupdate.

- [ ] **Step 1: Renderizar muestras PDF**

Generar una página por tipo en `tmp/pdfs/`, convertirlas a PNG con Poppler y verificar que el cierre quede abajo, sin recortes ni fondos negros.

- [ ] **Step 2: Ejecutar la suite completa**

Run: `npm test && npm run build && git diff --check`

Expected: todos los tests y el build finalizan con código 0.

- [ ] **Step 3: Revisar y versionar**

Aplicar la revisión de corrección, legibilidad, arquitectura, seguridad y rendimiento; incrementar la versión patch y crear su tag.

- [ ] **Step 4: Publicar**

Run: `git push origin main`, `git push origin <tag>` y `npm run release`.

Expected: release público con instalador `.exe`, `.blockmap` y `latest.yml`.
