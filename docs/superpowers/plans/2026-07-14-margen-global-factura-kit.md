# Margen global y facturación de kits - Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir recalcular toda la factura con un margen global y facturar un esquema como una sola línea comercial sin exponer los precios de sus componentes.

**Architecture:** El selector entregará costo y precio de venta como conceptos separados. Para un kit, el costo será la suma de sus componentes y el precio será el precio propio del esquema; la factura guardará e imprimirá únicamente el artículo kit. El Remito conservará la explosión de stock ya existente en `persistDeliveryNote`.

**Tech Stack:** Electron, HTML/CSS/JavaScript ES5, TypeScript, SQLite y Vitest.

## Global Constraints

- La factura y ARCA reciben una sola línea por kit.
- Los componentes no se copian a `invoice_items`.
- El margen global se calcula sobre el costo, no sobre el precio de venta anterior.
- El precio configurado del artículo se conserva mientras el usuario no aplique un margen global.
- No se agregan dependencias.
- Se publica una versión patch con `latest.yml` para autoupdate.

---

### Task 1: Definir regresiones de UI y contrato del selector

**Files:**
- Create: `test/new-invoice-margin-kit-ui.test.ts`
- Test: `test/kits.test.ts`

**Interfaces:**
- Consumes: `src/new-invoice.html`, `src/main.ts` y `persistInvoice`.
- Produces: pruebas del margen global y de la línea comercial única.

- [ ] **Step 1: Probar la ubicación y actualización del margen**

```ts
expect(invoiceHtml).toMatch(/panel-totales[\s\S]*id="txtMargenGral"/);
expect(invoiceHtml).toContain('addEventListener("input", applyGeneralMargin)');
expect(invoiceHtml).toContain("row.precio = row.costo * (1 + margin / 100)");
```

- [ ] **Step 2: Probar costo y precio separados en el selector**

```ts
expect(mainSource).toContain("effective_cost");
expect(mainSource).toContain("esquema: Boolean(a.is_kit)");
expect(invoiceHtml).toContain("data.product.costo");
expect(invoiceHtml).toContain("data.product.importe");
```

- [ ] **Step 3: Probar que la factura persiste solo el kit**

```ts
const invoice = persistInvoice({
  items: [{ codigo: "PC-R5", descripcion: "PC ARMADA", cantidad: 1, precio: 1500, iva: 21 }],
});
expect(dbAll("SELECT code FROM invoice_items WHERE invoice_id = ?", [invoice.id])).toEqual([{ code: "PC-R5" }]);
```

- [ ] **Step 4: Ejecutar las pruebas y confirmar el fallo inicial**

Run: `npx vitest run test/new-invoice-margin-kit-ui.test.ts test/kits.test.ts`

Expected: FAIL porque el margen sigue en Comprobante y el selector no separa costo de precio.

### Task 2: Implementar el costo real y la línea única del kit

**Files:**
- Create: `src/product-picker.ts`
- Modify: `src/main.ts`
- Modify: `src/product-selection.html`
- Modify: `src/new-invoice.html`
- Test: `test/new-invoice-margin-kit-ui.test.ts`
- Test: `test/kits.test.ts`

**Interfaces:**
- Consumes: `articles`, `kit_components` y el evento `shell:product-selected`.
- Produces: producto `{ codigo, descripcion, costo, importe, iva, esquema }`.

- [ ] **Step 1: Calcular el costo efectivo del selector**

```sql
CASE WHEN a.is_kit = 1 THEN
  COALESCE(SUM(kc.qty * component.cost_price), a.cost_price)
ELSE a.cost_price END AS effective_cost
FROM articles a
LEFT JOIN kit_components kc ON kc.kit_article_id = a.id
LEFT JOIN articles component ON component.id = kc.component_article_id
GROUP BY a.id
```

- [ ] **Step 2: Enviar costo, precio y marca de esquema**

```ts
{
  codigo: a.code,
  descripcion: a.name,
  costo: String(a.effective_cost ?? "0.00"),
  importe: String(a.sale_price ?? "0.00"),
  esquema: Boolean(a.is_kit),
}
```

- [ ] **Step 3: Mostrar el esquema en el selector**

```js
var srcBadge = prod.esquema
  ? '<span class="badge-kit">KIT</span>'
  : (prod.source || "local") === "air"
    ? '<span class="badge-air">AIR</span>'
    : '<span class="badge-local">LOCAL</span>';
```

- [ ] **Step 4: Conservar el precio propio al seleccionar**

```js
row.costo = parseFloat(data.product.costo || "0") || 0;
row.precio = parseFloat(data.product.importe || "0") || 0;
row.margen = row.costo > 0 ? ((row.precio / row.costo) - 1) * 100 : 0;
row.esquema = Boolean(data.product.esquema);
```

### Task 3: Mover el margen a Totales y recalcular en vivo

**Files:**
- Modify: `src/new-invoice.html`
- Test: `test/new-invoice-margin-kit-ui.test.ts`

**Interfaces:**
- Consumes: `items[]` con `costo`, `margen` y `precio`.
- Produces: `applyGeneralMargin()`.

- [ ] **Step 1: Mover el control a la pestaña Totales**

```html
<label for="txtMargenGral">Margen de ganancia</label>
<input type="number" id="txtMargenGral" min="0" max="999" step="0.1" placeholder="Ej. 30">
```

- [ ] **Step 2: Recalcular todas las líneas al escribir**

```js
function applyGeneralMargin() {
  var margin = parseFloat(document.getElementById("txtMargenGral").value);
  if (!Number.isFinite(margin)) return;
  items.forEach(function(row) {
    row.margen = margin;
    row.precio = row.costo * (1 + margin / 100);
  });
  renderItemsTable();
  recalcTotals();
  updateTotalsTab();
  updateCuotaImporte();
}
```

- [ ] **Step 3: Corregir los totales de impresión**

```js
window._totals = {
  subtotal: neto21 + neto10 + neto0,
  iva: iva21 + iva10,
  total: total
};
```

- [ ] **Step 4: Ejecutar pruebas focalizadas**

Run: `npx vitest run test/new-invoice-margin-kit-ui.test.ts test/kits.test.ts test/comprobante-print.test.ts`

Expected: todos los tests aprobados.

### Task 4: Verificar la interfaz y publicar

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: aplicación compilada.
- Produces: release estable con instalador y autoupdate.

- [ ] **Step 1: Renderizar la pestaña Totales**

Run: `npm run build` y abrir `dist/new-invoice.html` en Electron.

Expected: el margen aparece dentro de Totales, mantiene contraste y no desborda la tarjeta.

- [ ] **Step 2: Ejecutar la suite completa**

Run: `npm test && npm run build && git diff --check`

Expected: código de salida 0.

- [ ] **Step 3: Revisar y publicar**

Run: `git push origin main`, `git push origin <tag>` y `npm run release`.

Expected: release público con `.exe`, `.blockmap` y `latest.yml`.
