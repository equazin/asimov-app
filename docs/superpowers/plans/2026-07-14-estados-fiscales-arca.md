# Estados fiscales y autorización ARCA desde la lista — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Diferenciar facturas guardadas de comprobantes fiscales autorizados, permitir solicitar o reintentar el CAE desde la lista y evitar anulaciones locales inválidas de comprobantes con CAE.

**Architecture:** `afip-service.ts` será la única frontera de dominio para las transiciones fiscales. Los renderers sólo enviarán el identificador de la factura por IPC; nunca reconstruirán solicitudes WSFE. Los estados persistidos serán `borrador`, `pendiente_cae`, `autorizada`, `rechazada` y `anulada`, con error de ARCA persistido para recuperación operativa.

**Tech Stack:** Electron 33, TypeScript, SQLite (`better-sqlite3`), HTML/JavaScript nativo, Vitest.

**Status:** Implementado y verificado el 2026-07-14 (`npm run build`; 162/162 pruebas).

## Global Constraints

- No volver a persistir una factura antes de autorizarla desde la lista.
- Una factura con CAE no puede anularse localmente; corresponde emitir una nota de crédito.
- La autorización debe ser idempotente y nunca solicitar un segundo CAE.
- Los comprobantes históricos con CAE migran a `autorizada`; los `emitida` sin CAE migran a `borrador`.
- Los errores permanentes de ARCA dejan la factura en `rechazada`; los errores de conectividad dejan `pendiente_cae`.

---

### Task 1: Modelo de estados y migración

**Files:**
- Modify: `src/db.ts`
- Modify: `src/documents.ts`
- Test: `test/db.test.ts`
- Test: `test/documents.test.ts`

**Interfaces:**
- Produces: columnas `afip_error TEXT` y estados fiscales normalizados.
- Produces: `persistInvoice(form)` guardando nuevas facturas como `borrador`.

- [ ] Agregar una migración idempotente para `afip_error`.
- [ ] Normalizar registros existentes según CAE y estado anterior.
- [ ] Cambiar `persistInvoice` para guardar como `borrador` y preservar campos fiscales al actualizar.
- [ ] Bloquear `annulDocument("invoice", id)` cuando la factura tenga CAE.
- [ ] Agregar pruebas de migración, persistencia y anulación fiscal.

### Task 2: Transiciones fiscales centralizadas

**Files:**
- Modify: `src/afip-service.ts`
- Test: `test/afip.test.ts`

**Interfaces:**
- Produces: `authorizeStoredInvoice(invoiceId: string): Promise<CaeSuccessDto>`.
- Produces: `markInvoiceRejected(invoiceId: string, error: string): void`.

- [ ] Validar existencia, estado anulable y ausencia de CAE antes de llamar WSFE.
- [ ] Reusar `buildCaeInputFromInvoice` y `requestCae` sin reinsertar la factura.
- [ ] Guardar `pendiente_cae` para indisponibilidad y `rechazada` para rechazo permanente.
- [ ] Hacer que el reintento automático use la misma transición y quite `afip_error` al autorizar.
- [ ] Cubrir estados e idempotencia con pruebas.

### Task 3: IPC y formulario nuevo

**Files:**
- Modify: `src/ipc/afip.ts`
- Modify: `src/preload.ts`
- Modify: `src/new-invoice-preload.ts`
- Modify: `src/main.ts`
- Modify: `src/new-invoice.html`

**Interfaces:**
- Produces: canal `afip:authorize-stored-invoice` que consume solamente `invoiceId`.
- Produces: `window.asimov.afip.authorizeStoredInvoice(invoiceId)`.

- [ ] Registrar el handler con control de rol administrativo.
- [ ] Reusar `authorizeStoredInvoice` también desde el formulario nuevo.
- [ ] Renombrar acciones a “Autorizar ARCA y guardar” y “Guardar sin CAE”.
- [ ] Confirmar explícitamente el guardado sin CAE.
- [ ] Mostrar el estado `rechazada` y el error persistido en la pestaña ARCA.

### Task 4: Acciones y estados en la lista

**Files:**
- Modify: `src/shell.html`

**Interfaces:**
- Consumes: `invoice.cae`, `invoice.status`, `invoice.afip_error` y `asimov().afip.authorizeStoredInvoice`.

- [ ] Derivar la etiqueta fiscal desde estado y CAE.
- [ ] Mostrar “Autorizar ARCA” para `borrador`/`rechazada` y “Reintentar ARCA” para `pendiente_cae`.
- [ ] Refrescar la lista tras cada transición y ofrecer impresión tras obtener CAE.
- [ ] Ocultar “Anular” para facturas autorizadas y explicar que corresponde nota de crédito.
- [ ] Mantener accesibilidad, estados de carga y mensajes comprensibles.

### Task 5: Verificación integral

**Files:**
- Modify: `AFIP-ARCA.md`

**Interfaces:**
- Consumes: todas las tareas anteriores.

- [ ] Ejecutar las pruebas focalizadas de DB, documentos y ARCA.
- [ ] Ejecutar `npm run build` y la suite completa.
- [ ] Verificar manualmente: guardar sin CAE, autorizar desde lista, reimprimir con QR y bloqueo de anulación.
- [ ] Actualizar la documentación del flujo y estados.
- [ ] Revisar el diff final para detectar regresiones fiscales o de permisos.
