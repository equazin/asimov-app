# Consolidar ítems de factura Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que una factura armada con productos individuales se imprima como un único concepto con el precio total, manteniendo sus componentes como detalle sin precios individuales.

**Architecture:** La preferencia se captura en el formulario y se persiste en la cabecera de la factura. El generador compartido de comprobantes usa esa preferencia para reemplazar los renglones valorizados por una línea principal totalizada y sublíneas informativas; la reimpresión reconstruye el mismo estado desde SQLite.

**Tech Stack:** Electron, TypeScript, HTML/JavaScript, SQLite (`better-sqlite3`), Vitest.

## Global Constraints

- El modo consolidado debe ser optativo y no alterar facturas existentes.
- ARCA debe seguir recibiendo y calculando los ítems fiscales reales.
- Los componentes se muestran sin precio individual.
- La línea principal muestra cantidad 1 y el subtotal neto total; IVA y total siguen en el pie fiscal.
- Debe conservarse el comportamiento al reimprimir una factura autorizada o sin CAE.
- Publicar una versión nueva con autoupdate después de pasar pruebas y revisión.

---

### Task 1: Persistir la preferencia de impresión

**Files:**
- Modify: `src/db.ts`
- Modify: `src/documents.ts`
- Test: `test/documents.test.ts`

**Interfaces:**
- Consumes: `InvoiceForm.consolidarItems` y `InvoiceForm.descripcionConsolidada`.
- Produces: columnas `invoices.consolidated_print` y `invoices.consolidated_label` disponibles en `invoices.get`.

- [ ] **Step 1: Ejecutar la prueba de persistencia y verificar que cubra modo apagado, descripción explícita y descripción predeterminada**

Run: `npx vitest run test/documents.test.ts`

Expected: la prueba guarda `0/null`, `1/PC gaming a medida` y `1/Equipo armado` respectivamente.

- [ ] **Step 2: Corregir el INSERT/UPSERT o la migración si la prueba falla**

La migración debe agregar las columnas sin destruir bases existentes y el UPSERT debe actualizar ambas preferencias.

- [ ] **Step 3: Repetir la prueba**

Run: `npx vitest run test/documents.test.ts`

Expected: PASS.

### Task 2: Imprimir y reimprimir el documento consolidado

**Files:**
- Modify: `src/new-invoice.html`
- Modify: `src/comprobante-print.js`
- Modify: `src/shell.html`
- Test: `test/comprobante-print.test.ts`

**Interfaces:**
- Consumes: `data.consolidated`, `data.consolidatedLabel`, `data.items` y `data.totals.subtotal`.
- Produces: una fila principal valorizada y una subfila sin valores monetarios por cada producto real.

- [ ] **Step 1: Agregar una prueba de render que falle sin el comportamiento consolidado**

La prueba debe renderizar dos productos con precios distintos y comprobar una única aparición monetaria del subtotal en la tabla, la descripción consolidada, ambos componentes y la ausencia de sus precios individuales.

- [ ] **Step 2: Ejecutar la prueba focalizada**

Run: `npx vitest run test/comprobante-print.test.ts`

Expected: FAIL antes de completar el render o PASS si el cambio incompleto ya satisface íntegramente el contrato.

- [ ] **Step 3: Completar formulario, payload, render y reimpresión**

El checkbox habilita la descripción; el guardado y la autorización llevan la preferencia; el render no expande kits encima del modo consolidado; la reimpresión lee las columnas guardadas.

- [ ] **Step 4: Repetir las pruebas focalizadas**

Run: `npx vitest run test/documents.test.ts test/comprobante-print.test.ts`

Expected: PASS.

### Task 3: Revisar, verificar y publicar

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: implementación y pruebas completas.
- Produces: commit, push de `main` y release público con `latest.yml` para autoupdate.

- [ ] **Step 1: Revisar el diff por corrección, legibilidad, arquitectura, seguridad y rendimiento**

La revisión debe confirmar que los ítems fiscales reales no se reemplazan en persistencia ni en ARCA, y que sólo cambia la presentación impresa.

- [ ] **Step 2: Ejecutar la suite y compilación**

Run: `npm test`

Expected: todos los tests PASS.

Run: `npm run build`

Expected: TypeScript y copia de assets terminan sin errores.

- [ ] **Step 3: Ejecutar smoke test**

Run: `npm run smoke-test`

Expected: Electron inicia y cierra sin crash.

- [ ] **Step 4: Incrementar patch, commitear y publicar**

Run: `npm version patch --no-git-tag-version`

Expected: versión posterior a `4.20.1` en `package.json` y `package-lock.json`.

Run: `npm run release`

Expected: instalador, blockmap y `latest.yml` publicados para la versión nueva.

