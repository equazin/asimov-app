# AFIP / ARCA — Facturación electrónica: estado y plan de fases

> Plan específico de la facturación electrónica (WSAA + WSFE) y su integración
> punta a punta desktop ↔ nube. Separado de [PENDIENTES.md](PENDIENTES.md) por su
> volumen. Última actualización: 2026-07-08.
>
> **Nota de nombre:** AFIP pasó a llamarse **ARCA** (Agencia de Recaudación y
> Control Aduanero). Los webservices y códigos son los mismos; el rename es de
> marca/terminología (ver Fase 6).

---

## Estado actual

### ✅ Fases 1–3 implementadas (2026-07-08)

**Backend cloud** (`v2/packages/api/src/modules/afip/`, commit `5417e43`):

- **WSAA real**: TRA firmado como CMS/PKCS#7 (`node-forge`), POST a `LoginCms`,
  parseo del `LoginTicketResponse` y cache del TA por tenant+service (12 h).
- **WSFE real**: `FECAESolicitar` con `Auth` + `FeCAEReq` + `Iva` por alícuota,
  parseo de `CAE`/`CAEFchVto`/`Resultado`, manejo de `Errors`/`Observaciones`,
  y `FECompUltimoAutorizado` real (numeración desde AFIP).
- **Cert/clave por tenant** cifrados (campos `afipCert`/`afipKey`/`afipCuit`).
- **Tests**: 33 casos AFIP (60 totales en la API), typecheck limpio.

**Desktop directo** (módulo portado, sin depender de la nube):

- Motor en `src/afip/` (domain, wsaa, wsfe, crypto, qr) — TypeScript puro, misma
  lógica que la API.
- `src/afip-service.ts`: cert/clave cifrados con `safeStorage` en `system_config`,
  TA con cache, `requestCae` escribe CAE/venc./número en la factura local y genera
  el **QR AFIP (RG 4892)**.
- IPC + preloads: `afip:status/save-credentials/test-connection/request-cae` y
  `shell:invoice-authorize` (persiste factura + pide CAE en un paso).
- UI: Configuración → AFIP (subir .crt/.key, CUIT, punto de venta, ambiente,
  "Probar conexión"), botón **Autorizar AFIP** habilitado en la factura, y
  QR + CAE en el comprobante impreso (`comprobante-print.js`).
- **Tests**: `test/afip.test.ts` (11 casos) — suite desktop completa en verde.

### ❌ Lo que falta

- **Modo offline** (resto de Fase 3): si no hay red/AFIP, dejar la factura
  "pendiente de CAE" y reintentar.
- **Comprobantes**: faltan **notas de crédito/débito** y validar A/B/C punta a
  punta (Fase 4).
- **Padrón** (consulta CUIT → condición IVA / razón social): no existe (Fase 5).
- **Homologación → producción**: sin certificar en el ambiente de testing de AFIP
  (Fase 6).

---

## Plan de fases

### Fase 1 — WSAA real (autenticación) ✅ *hecha (commit 5417e43)*

Sin token/sign reales, nada de WSFE funciona.

- [x] **Almacenar certificado + clave privada por tenant**, cifrados
      (reusar `src/secrets.ts` / equivalente en la API). Campos nuevos en Tenant:
      `afipCert`, `afipKey` (cifrados), `afipCuit`.
- [x] **Firmar el TRA** como **CMS/PKCS#7** con cert+key del contribuyente
      (`node-forge`).
- [x] **POST del CMS** (base64) a `LoginCms` (SOAP) y **parsear** el
      `LoginTicketResponse` → `token` + `sign` + `expirationTime`.
- [x] **Cachear el TA** por `tenant+service` (vale 12 h) para no re-autenticar en
      cada comprobante; refrescar al vencer.
- [x] Tests de firma/parseo con TRA de ejemplo (sin red).

### Fase 2 — WSFE real (emisión de CAE) ✅ *hecha (commit 5417e43)*

- [x] **Armar el SOAP `FECAESolicitar`**: `Auth` (token/sign/Cuit) + `FeCAEReq`
      con `ImpNeto`/`ImpIVA`/`ImpTotal` + `Iva = buildIvaAlicuotas(...)`.
- [x] **POST a WSFE** y **parsear** `CAE` + `CAEFchVto` + `Resultado`.
- [x] **Manejar `Errors` / `Observaciones`** (duplicado, CUIT inválido, fecha
      fuera de rango, etc.) con mensajes claros y estado "rechazada".
- [x] **`FECompUltimoAutorizado`** real: numeración desde AFIP (no desde la DB),
      con reconciliación ante desfasajes.
- [x] Reemplazar los `CAE_<timestamp>` stub por el CAE real en `document.update`.
- [x] Tests de armado del envelope y del parseo de respuestas (mocks de WSFE).

### Fase 3 — Integración en el desktop ✅ *hecha (falta sólo modo offline)*

Que el operador pueda facturar electrónicamente desde la app. Se implementó como
**AFIP directo desde el desktop** (motor propio en `src/afip/`), sin depender de
la nube.

- [x] **Habilitar "Autorizar AFIP"** en `new-invoice.html` (hoy `disabled`).
- [x] **IPC**: `afip:request-cae` + `shell:invoice-authorize` (persiste la
      factura y pide el CAE en un paso, sin cerrar la ventana).
- [x] **Escribir el CAE** de vuelta en la factura local (`invoices.cae`,
      `cae_expiry`, número definitivo) y reflejar estado en el banner AFIP.
- [x] **QR AFIP** (RG 4892) + CAE y venc. en el **comprobante impreso**
      (`comprobante-print.*`, integra con los membretes ya existentes).
- [ ] Modo **offline**: si no hay nube/AFIP, la factura queda "pendiente de CAE" y
      se reintenta (encaja con la cola de sync existente).

### Fase 4 — Cobertura de comprobantes 🟠

- [ ] **Notas de crédito y débito** (A/B/C) con su tipo AFIP y asociación al
      comprobante de origen (encaja con `document_links` de v4.8.0).
- [ ] Validar **Factura A / B / C** punta a punta según condición del cliente
      (el mapeo ya está en `getInvoiceTypeCode`).
- [ ] Comprobantes tipo **M** y percepciones si aplica al rubro.

### Fase 5 — Padrón y extras 🟢

- [ ] **Consulta de padrón (A13)**: al cargar CUIT del cliente, traer razón social
      y condición de IVA desde AFIP (autocompleta y valida el tipo de comprobante).
- [ ] **CAEA** (Código de Autorización Electrónico Anticipado) para contingencia
      cuando WSFE no responde.
- [ ] Reportes fiscales: **libro IVA ventas** exportable en formato AFIP.

### Fase 6 — Homologación → Producción → ARCA 🔴 *gate de salida real*

- [ ] Probar todo el circuito en el **ambiente de homologación** (`wsaahomo` /
      `wswhomo`) con un certificado de testing.
- [ ] **Set de pruebas de certificación** de AFIP para habilitar el punto de venta
      de facturación electrónica en producción.
- [ ] Cambiar `AFIP_ENV=production` y validar contra los endpoints productivos.
- [ ] **Rename a ARCA** en UI/labels/documentación (webservices y códigos siguen
      igual; es terminología de marca).

---

## Notas técnicas

- **Ambientes** (ya cableados en `afip.service.ts`):
  - Homologación: `wsaahomo.afip.gov.ar` / `wswhomo.afip.gov.ar`
  - Producción: `wsaa.afip.gob.ar` / `servicios1.afip.gov.ar/wsfev1`
  - Se elige con `AFIP_ENV` (`ConfigService`).
- **Orden recomendado**: Fase 1 → 2 → 3 son la ruta crítica para facturar de
  verdad. Fase 6 (homologación) puede hacerse en paralelo apenas la Fase 2 arme
  envelopes válidos.
- **Seguridad**: el certificado y la clave privada son secretos de máxima
  sensibilidad — siempre cifrados en reposo, nunca en logs ni en el repo.

## Referencias

- Servicio actual (con los `// Lo que falta:` marcados): `v2/packages/api/src/modules/afip/afip.service.ts`
- Controller: `v2/packages/api/src/modules/afip/afip.controller.ts`
- Form desktop: `src/new-invoice.html` (pestaña AFIP)
- Roadmap general: [PENDIENTES.md](PENDIENTES.md) (punto 6 — Higiene/técnico)
