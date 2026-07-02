# Plan de trabajo — Asimov

Estado: iniciado el 2026-07-02. Ordenado por prioridad; cada fase deja el sistema
en un estado usable.

---

## Fase 0 — Persistencia de datos maestros + selectores ✅ (COMPLETADA)

**Objetivo:** que Cliente / Proveedor / Artículo se guarden y aparezcan en las
listas, y que los selectores (pickers) funcionen y se vean con el tema actual.

- [x] **Bug raíz:** los formularios `new-client/new-supplier/new-article` emitían
  un evento (`shell:*-created`) que el main solo reenviaba a un picker, **sin
  escribir en SQLite**. Ahora el main persiste vía `masters.ts` (mapeo UI→schema)
  usando los upserts compartidos de `db.ts`.
- [x] **Mapeo de campos** form→schema en `src/masters.ts`
  (`razonSocial→business_name`, `domicilio→address`, `telefono→phone`,
  `condicionIva→fiscal_type`, etc.).
- [x] **Refresco automático** de la vista activa del shell tras crear un maestro
  (`shell:clients-changed` / `suppliers-changed` / `articles-changed` →
  `refreshCurrentView()`), y recarga del picker abierto.
- [x] **Selector de proveedores nuevo** (`supplier-selection.html` + preload +
  `createSupplierSelectionWindow`/`loadSuppliersForPicker` en main). Antes NO
  existía: el botón "..." de proveedor en Orden de Compra / Recepción / Factura
  de Compra / Orden de Pago llamaba a `openClientSelection`/`electronAPI`
  inexistentes → no hacía nada. Ahora abre un picker real de proveedores.
- [x] **Restyle de `client-selection.html`** al tema oscuro Ink (antes usaba el
  tema Windows-clásico púrpura/beige). Se creó `supplier-selection.html` con el
  mismo tema.
- [x] Refactor: eliminar los bloques muertos `if(window.electronAPI){…}` en las
  fichas. Removidos de `new-purchase-order`, `new-goods-receipt`,
  `new-payment-order` y `new-purchase-invoice` (eran inertes: `electronAPI` no
  existe; el puente real es `asimovNew*`). De paso: `imprimir()` ahora usa
  `window.print()`, y el `anular()` de factura de compra —que era el único que
  dependía de `electronAPI`— se reencaminó al patrón de los demás (setea
  `estadoCont='Anulada'` → `guardar()`; se agregó la opción "Anulada" al select).
- [x] Persistencia + refresco de los **9 documentos** (pedido, cotización,
  factura, remito, recibo, OC, recepción, FC, orden de pago) verificado: cada
  handler `*-saved` del main persiste vía `documents.ts` y notifica al shell.
  **Bug corregido:** el `FORM_REFRESH_MAP` del shell no escuchaba
  `shell:quote-saved` (la cotización no refrescaba), mapeaba mal
  `purchase-invoice→facturas` y solo refrescaba la lista propia del documento,
  ignorando los efectos colaterales (caja, cta. cte., stock, dashboard). Ahora
  cualquier `*-saved` o `*-changed` dispara `refreshCurrentView()` (mismo patrón
  que los maestros). Verificado con `scripts/verify-documents.js` (12/12 OK).

## Fase 1 — Integridad transaccional (stock y caja) ✅ (COMPLETADA)

**Objetivo:** que los documentos ejecuten sus efectos. Hoy la mayoría **no
escribe nada**: los handlers `*-saved` del main solo cerraban la ventana y varios
formularios ni siquiera llamaban a su método de guardado (cableado roto, igual
que el bug de datos maestros).

- [x] **Recepción de mercadería → stock IN** (patrón de referencia). Nuevo módulo
  `src/documents.ts` con `persistGoodsReceipt`: persiste header + ítems y, salvo
  que esté rechazada, inserta `stock_movements` (entrada) y actualiza
  `article_stock` en una sola transacción. Autonumera (RMC), normaliza fecha
  dd/mm/yyyy→ISO, es idempotente (re-guardar no duplica), y solo mueve stock de
  artículos locales que manejan stock. Verificado con
  `scripts/verify-goods-receipt.js` (VERIFY OK). También se arregló el botón
  Guardar del form (llamaba a `electronAPI`/`onSaved` inexistentes).
- [x] **Remito → stock OUT.** `persistDeliveryNote`: header + ítems + salida de
  stock. Verificado.
- [x] **Recibo (cobro) → caja IN.** `persistReceipt`: header + ítems +
  `cash_movements` (ingreso) + update de `cash_accounts.balance`. Verificado.
- [x] **Orden de pago → caja OUT.** `persistPaymentOrder`: header + ítems +
  `cash_movements` (egreso) + update de balance. Se arregló el botón Guardar del
  form (estaba roto igual que recepción). Verificado.
- [x] **Signos y reversas.** Movimientos con signo (entrada/ingreso +, salida/
  egreso −); saldo = suma. Re-guardar un documento revierte y re-aplica sus
  movimientos (idempotente). Todo verificado en `scripts/verify-documents.js`
  (6/6 checks OK): stock 7→4, caja +5000→3000, sin duplicar al re-guardar.
- [x] **Pedido de venta, cotización, OC, factura de compra y factura de venta →
  persistir header + ítems** (`persistSaleOrder/Quote/PurchaseOrder/
  PurchaseInvoice/Invoice`). Sin efecto de stock/caja. Se arregló el botón
  Guardar roto de OC y factura de compra. Verificado (12/12 en
  `scripts/verify-documents.js`): totales de venta/compra correctos, IVA por
  línea, número con punto de venta, percepciones sumadas, y confirmación de que
  NO tocan stock ni caja.
- [x] **Factura de venta → NO descuenta stock** (decisión de negocio 2026-07-02).
  El remito es el único documento que da salida de stock, para evitar el doble
  descuento cuando de un mismo pedido se emiten remito + factura. Documentado en
  `documents.ts`.
- [x] **Totales recalculados en el main.** Nuevo `computeSaleTotals(items)` en
  `documents.ts`: pedido, cotización y factura de venta derivan
  `subtotal/iva/total` de sus ítems (neto = Σ qty×precio, IVA = Σ redondeo(neto×
  iva%)) en lugar de confiar en los `totales` del renderer. OC/FC ya lo hacían.
  Verificado con `totales` adulterados: el header se recalcula igual (200/42/242
  y 300/63/363).
- [x] **Reversa explícita al anular desde la lista.** Nuevo `annulDocument(type,
  id)` en `documents.ts`: revierte los efectos de stock/caja (reusando los
  helpers idempotentes) y marca `status='anulado'` en una transacción; seguro
  ante documentos ya anulados o inexistentes. Cableado: IPC `shell:document-annul`
  en el main → `asimov.annulDocument` en el preload → botón **Anular** por fila en
  las listas de pedidos, cotizaciones, OC, recepciones, facturas, remitos y
  recibos (`shell.html`). De paso se endureció `persistReceipt` para honrar el
  estado anulado (los demás ya lo hacían). Verificado (anular remito 4→7, recibo
  3000→-2000, doble anulación / inexistente devuelven error).

> **Patrón de referencia:** `documents.ts` (persist + efecto en una transacción,
> con reversa para re-guardado) + wiring en el handler `*-saved` del main + fix
> del botón Guardar del form + `notifyShell` para refrescar la lista. Verificado
> con `scripts/verify-documents.js`.

## Fase 2 — Seguridad y acceso ✅ (COMPLETADA — resto diferido/opcional)

> Núcleo de seguridad terminado: hash de contraseñas, login gateado, roles con
> enforcement en el main, credenciales AIR cifradas y shell aislado
> (`contextIsolation`). Quedan dos ítems de bajo retorno marcados abajo: quitar
> `unsafe-inline` de la CSP (defensa-en-profundidad, ya mitigado por el aislamiento)
> y DB cifrada con SQLCipher (opcional).

- [x] **Hash real de contraseñas** con `scrypt` (Node nativo, sin dependencias):
  `src/auth.ts` (`hashPassword`/`verifyPassword` con salt aleatorio y comparación
  de tiempo constante). Cableado en `db:users:save` (acepta `password` opcional y
  la hashea; si no viene, preserva). Verificado (18/18 en
  `scripts/verify-auth.js`).
- [x] **Login de aplicación** contra tabla `users`. Ventana `login.html` (segura:
  `contextIsolation:true` + `contextBridge` + `sandbox`) que gatea el arranque; la
  ventana principal solo se crea al autenticar (`completeLogin`). Handlers
  `auth:login` / `auth:current` / `auth:logout` en el main.
- [x] **Seed de admin** en el primer arranque (`seedDefaultAdmin`): usuario
  `admin` / clave `asimov` — **CAMBIAR tras el primer ingreso**.
- [x] **Usuario en sesión + cerrar sesión** en la barra de estado del shell; campo
  de contraseña agregado al alta de usuarios. Rol disponible en la sesión.
- [x] **Roles**: gating real de módulos sensibles según `role`. Renderer
  (`shell.html`, `applyRolePolicy`): los no-admin no ven Usuarios, Auditoría,
  Integraciones ni Configuración (y se ocultan las secciones del nav que quedan
  vacías); `readonly` además no ve botones "Nuevo" ni la acción "Anular", y
  `navigate()` redirige al dashboard si se intenta entrar a un módulo no
  permitido. Enforcement real en el **main** (fuente de verdad, no solo UX):
  `db:users:save` / `db:users:toggle` exigen rol admin, y `shell:document-annul`
  rechaza a `readonly`. Se pasó `getCurrentUser` a `registerIpcHandlers`.
- [x] **Credenciales de AIR cifradas en reposo** con `safeStorage` (DPAPI/Keychain/
  libsecret). Nuevo `src/secrets.ts` (`encryptSecret`/`decryptSecret`, formato
  `enc:v1:<base64>`, migración transparente de texto plano y degradación segura si
  el SO no ofrece cifrado). `db:config:set` cifra `air_password`; `getAirLocalConfig`
  lo descifra; el volcado genérico `db:config:get-all` lo enmascara. Verificado con
  `scripts/verify-secrets.js` (6/6). **Pendiente (limitación externa):** el login de
  AIR envía la clave como query-param GET (`?q=login&pass=...`); es la API de AIR y
  no se puede cambiar desde acá — mitigable solo si AIR habilita POST/HTTPS-body.
- [x] **Endurecer el shell principal: `contextIsolation: true` + `sandbox: true` +
  `contextBridge`.** Era el único de los 12 windows con `contextIsolation:false`.
  El preload (`preload.ts`) pasó de asignar `window.asimov = api` a
  `contextBridge.exposeInMainWorld` (el getter `version` se convirtió en el método
  `appVersion()` porque los getters no sobreviven al puente). Esto corta el vector
  XSS→RCE: aunque haya un XSS en el renderer, no puede tocar Node/Electron.
  Verificado con `scripts/verify-shell-bridge.js` (10/10 bajo Electron real): el
  puente expone `window.asimov`, todas las sub-APIs y callbacks, y el roundtrip
  IPC funciona sin errores de preload.
- [~] **CSP sin `unsafe-inline`:** la CSP ya es estricta (`default-src 'none'`;
  sin `connect-src` → sin exfiltración de red; sin scripts externos/objects/
  frames). Falta solo quitar `'unsafe-inline'` de `script-src`, que exige extraer
  el `<script>` de ~1580 líneas **y** reescribir 102 handlers `onclick` inline +
  los generados dinámicamente a event-delegation. **Diferido a propósito:** con
  `contextIsolation` ya activo su valor es defensa-en-profundidad de bajo retorno
  (un inline inyectado no puede ni exfiltrar ni escalar), y el refactor es alto
  riesgo sin poder validar la UI automáticamente (el `smoke-test` no ejercita el
  shell, que solo abre tras login). Hacer como tarea dedicada con prueba manual.
- [ ] (Opcional) DB cifrada (SQLCipher).

## Fase 3 — Tests 🟠 (EN CURSO)

- [x] **Vitest configurado** (`vitest.config.ts` + scripts `test`/`test:watch`/
  `test:coverage`). `test/setup.ts` mockea `electron` (temp dir por archivo +
  `safeStorage` simulado); `test/helpers.ts` inicializa/limpia la DB SQLite.
- [x] **Unit: mapeadores de `masters.ts`** (`test/masters.test.ts`, 5 tests):
  cliente/proveedor/artículo UI→schema, default de `fiscal_type`, IVA por defecto
  y autocódigo.
- [x] **Unit: cliente AIR** (`test/air.test.ts`, 9 tests): `mapAirProduct`
  (alias de código/nombre, parseo es-AR `1.234,56` y `1,5`), sumas por depósito,
  estado activo/inactivo, y `mapAirProducts` filtrando inválidos.
- [ ] Unit: cálculos de IVA/totales/cta cte de `documents.ts` (portar
  `verify-documents.js` a Vitest: `test/documents.test.ts`).
- [ ] Unit: `auth.ts` (hash/verify/authenticate/seed) y `secrets.ts` round-trip.
- [ ] Integración: handlers `db:*` contra SQLite (reusando `test/helpers.ts`).
- [ ] Meta 80%: reactivar `thresholds` en `vitest.config.ts` al completar la suite.

> Estado actual: **14 tests en verde** (`npm test`). Los scripts `verify-*.js`
> siguen como checks de humo en CI. Config con `thresholds` comentados hasta
> cerrar la suite.

## Fase 4 — Deuda técnica y docs 🟡

- [ ] Actualizar el README (describe la arquitectura vieja de "wrapper web
  remoto", que contradice a `main.ts`: app 100% nativa).
- [ ] Extraer JS inline de las fichas HTML a módulos reutilizables.
- [ ] Unificar el patrón de comunicación form→main.

## Fase 5 — Fiscal y distribución 🟢

- [ ] Integración AFIP WSFE (factura electrónica + CAE real).
- [ ] Firma de código (certificado EV/OV) para evitar SmartScreen y habilitar
  auto-update confiable.

---

**Ruta crítica:** Fase 0 → Fase 1 → Fase 2.
