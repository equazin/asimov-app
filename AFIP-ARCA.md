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

- **Percepciones/tributos** (`Tributos` de WSFE), sólo si aplica al rubro
  (resto de Fase 4).
- **CAEA**: diferido (ver Fase 5) — la cola offline cubre la contingencia.
- **Homologación → producción**: sin certificar en el ambiente de testing de AFIP
  (Fase 6). Es el único gate que queda antes de facturar en serio.

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

### Fase 3 — Integración en el desktop ✅ *hecha*

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
- [x] Modo **offline**: si no hay conexión con AFIP (`AfipUnavailableError`), la
      factura queda guardada con estado `pendiente_cae` y se reintenta
      automáticamente (al arrancar la app y cada 10 min; también manual vía
      `afip:retry-pending`).

### Fase 4 — Cobertura de comprobantes ✅ *hecha (percepciones pendientes)*

- [x] **Notas de crédito y débito** (A/B/C) con su tipo AFIP (3/8, 2/7, 13/12,
      derivado de la condición del cliente) y **asociación al comprobante de
      origen** vía `document_links` (botón "Traer factura" en el form) →
      `CbtesAsoc` en `FECAESolicitar` (RG 4540). La NC/ND exige que la factura
      asociada tenga CAE.
- [x] Validar **Factura A / B / C** según condición del cliente ANTES de ir a
      AFIP (`validateVoucherForClient`): A/M exigen cliente RI con CUIT, B a un
      RI se rechaza (corresponde A), C sólo emisor monotributista.
- [x] Comprobante tipo **M** (código 51) mapeado. Percepciones/tributos
      (`Tributos` de WSFE): pendiente, sólo si aplica al rubro.

### Fase 5 — Padrón y extras ✅ *hecha (CAEA diferido)*

- [x] **Consulta de padrón**: botón 🔎 junto al CUIT en el alta de cliente —
      consulta `ws_sr_constancia_inscripcion` (personaServiceA5) y autocompleta
      razón social, condición de IVA (monotributo/RI/exento según la constancia)
      y domicilio fiscal. Requiere habilitar ese servicio para el certificado en
      el portal de AFIP. El TA de WSAA ahora se cachea **por servicio**.
- [ ] **CAEA** — *diferido a propósito*: exige régimen quincenal + informar
      comprobantes (FECAEARegInformativo) y apunta a emisores de alto volumen;
      la cola offline `pendiente_cae` con reintento automático ya cubre la
      contingencia de WSFE para este rubro. Retomar sólo si el volumen lo pide.
- [x] Reportes fiscales: **libro IVA ventas** exportable en formato AFIP
      (RG 4597): `REGINFO_CV_VENTAS_CBTE.txt` (266 pos.) +
      `REGINFO_CV_VENTAS_ALICUOTAS.txt` (62 pos.), desde Configuración → AFIP,
      con los comprobantes autorizados (con CAE) del período.

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
