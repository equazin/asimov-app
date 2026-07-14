# Pedidos y cotizaciones con kits, margen y dólar oficial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan.

**Goal:** Equiparar pedidos y cotizaciones con la factura para trabajar con esquemas/kits, margen comercial y precios cargados en USD convertidos a ARS con la cotización oficial.

**Architecture:** Los formularios mantienen el precio fuente en USD o ARS para editar, muestran y calculan el total final en ARS, y envían la moneda y cotización al proceso principal. La persistencia vuelve a validar y convertir los importes a ARS, conserva metadatos de moneda/cotización y guarda la identidad del artículo para reconstruir kits al imprimir o reimprimir.

**Tech Stack:** Electron, TypeScript, HTML/JavaScript, SQLite, Vitest.

## Global Constraints

- Mantener compatibilidad con pedidos y cotizaciones existentes.
- La conversión monetaria definitiva se realiza en backend; la UI solo anticipa el resultado.
- La cotización oficial se puede corregir manualmente si la API no responde.
- Los componentes del kit se muestran sin precios individuales y el precio queda en el renglón principal.
- No modificar cambios locales ajenos a esta tarea.

---

## Task 1: Persistencia y contratos monetarios

- [x] Extender `src/db.ts` con metadatos `usd_rate`, `source_currency` y `show_kit_components` para `sale_orders` y `quotes`, incluyendo migración idempotente.
- [x] Generalizar en `src/documents.ts` la conversión de ítems USD a ARS y aplicarla a pedidos y cotizaciones.
- [x] Conservar `articleId` al persistir ítems para poder reconstruir kits.
- [x] Agregar pruebas de conversión, totales, metadatos y compatibilidad en `test/documents.test.ts` y pruebas de esquema/migración.
- [x] Ejecutar `npm test -- --run test/documents.test.ts`.

## Task 2: Pedidos con dólar oficial y kits

- [x] Exponer `dolarLatest` y `getKitInfo` en `src/new-sale-order-preload.ts`.
- [x] Actualizar `src/new-sale-order.html` para cargar el dólar oficial, validar la cotización, mostrar totales en ARS y conservar artículo/kit.
- [x] Incorporar el selector para imprimir los componentes del kit y enviar los metadatos al guardar e imprimir.
- [x] Agregar cobertura de UI en `test/sale-documents-pricing-ui.test.ts`.

## Task 3: Cotizaciones con costo, margen, dólar oficial y kits

- [x] Exponer `dolarLatest` y `getKitInfo` en `src/new-quote-preload.ts`.
- [x] Agregar costo, margen por renglón y margen general en `src/new-quote.html`.
- [x] Cargar el dólar oficial, convertir totales a ARS y permitir imprimir componentes de kits sin precios individuales.
- [x] Mantener la carga manual de clientes sin razón social obligatoria.
- [x] Completar las pruebas de UI para cotizaciones.

## Task 4: Reimpresión, revisión y entrega

- [x] Hidratar kits y cotización al reimprimir pedidos y presupuestos desde `src/shell.html`.
- [x] Ejecutar pruebas focalizadas, suite completa, typecheck y build.
- [x] Revisar el diff con la guía `code-review-and-quality` y corregir hallazgos.
- [ ] Incrementar versión, crear commit, push y release con artefactos de autoupdate.
