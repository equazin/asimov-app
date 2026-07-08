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

### ✅ Lo que YA está (lógica de dominio testeable)

En `v2/packages/api/src/modules/afip/afip.service.ts`:

- **Desglose de IVA por alícuota** (`buildIvaAlicuotas`) — arma el array `AlicIva`
  que exige WSFE (`FECAESolicitar → FeDetReq.Iva`), con `BaseImp`/`Importe` por
  alícuota y redondeo a 2 decimales robusto.
- **Códigos de alícuota AFIP** (`afipIvaCode` / `AFIP_IVA_CODES`) — mapea
  0/2.5/5/10.5/21/27 % a los códigos 3/9/8/4/5/6.
- **Mapeo de tipo de comprobante** (`getInvoiceTypeCode`) — Factura/NC/ND A/B/C
  según condición fiscal (RI / Monotributo).
- **Armado del TRA** (`buildLoginTicketRequest`) — LoginTicketRequest XML de WSAA
  (uniqueId, generationTime, expirationTime, service).
- **Último número desde DB** (`getLastInvoiceNumber`).
- **Endpoints REST**: `POST /afip/cae`, `GET /afip/last-number/:pos/:tipo`,
  `POST /afip/test-auth` (`afip.controller.ts`), con roles owner/admin/accountant.
- **Tests**: `afip.service.spec.ts`.
- **Desktop**: pestaña AFIP en `src/new-invoice.html` con campos CAE / venc. /
  estado banner. La columna `invoices.cae` y `cae_expiry` ya existen en el schema.
- **Tenant**: flags `hasAfip`, `fiscalId` (CUIT), `afipPointOfSale` en Prisma.

### ❌ Lo que está STUBBEADO / falta

- **WSAA real**: el TRA se arma pero **no se firma** (CMS/PKCS#7) ni se envía a
  `LoginCms`. `authenticate()` devuelve token/sign **falsos**.
- **WSFE real**: `requestCae()` **no** arma ni postea `FECAESolicitar`; devuelve
  `CAE_<timestamp>` inventado y venc. a 10 días.
- **Certificado/clave**: no hay dónde guardarlos (faltan campos cifrados en
  Tenant) ni UI para subirlos.
- **`FECompUltimoAutorizado`**: el último número sale de la DB local, no de AFIP
  (riesgo de desalineación / recuperación ante fallos).
- **Desktop → nube**: el botón "Autorizar AFIP" está **deshabilitado**; no hay IPC
  que llame a `POST /afip/cae` ni que escriba el CAE de vuelta en la factura local.
- **QR de la factura** (RG 4892): no se genera ni se imprime.
- **Comprobantes**: sólo el camino "factura" básico; faltan **notas de crédito/
  débito** y validar A/B/C punta a punta.
- **Padrón** (consulta CUIT → condición IVA / razón social): no existe.
- **Homologación → producción**: sin certificar en el ambiente de testing de AFIP.

---

## Plan de fases

### Fase 1 — WSAA real (autenticación) 🔴 *bloqueante de todo lo demás*

Sin token/sign reales, nada de WSFE funciona.

- [ ] **Almacenar certificado + clave privada por tenant**, cifrados
      (reusar `src/secrets.ts` / equivalente en la API). Campos nuevos en Tenant:
      `afipCert`, `afipKey` (cifrados), `afipCuit`.
- [ ] **Firmar el TRA** como **CMS/PKCS#7** con cert+key del contribuyente
      (`node-forge` o `openssl` vía child_process).
- [ ] **POST del CMS** (base64) a `LoginCms` (SOAP) y **parsear** el
      `LoginTicketResponse` → `token` + `sign` + `expirationTime`.
- [ ] **Cachear el TA** por `tenant+service` (vale 12 h) para no re-autenticar en
      cada comprobante; refrescar al vencer.
- [ ] Tests de firma/parseo con TRA de ejemplo (sin red).

### Fase 2 — WSFE real (emisión de CAE) 🔴

- [ ] **Armar el SOAP `FECAESolicitar`**: `Auth` (token/sign/Cuit) + `FeCAEReq`
      con `ImpNeto`/`ImpIVA`/`ImpTotal` + `Iva = buildIvaAlicuotas(...)` (ya listo).
- [ ] **POST a WSFE** y **parsear** `CAE` + `CAEFchVto` + `Resultado`.
- [ ] **Manejar `Errors` / `Observaciones`** (duplicado, CUIT inválido, fecha
      fuera de rango, etc.) con mensajes claros y estado "rechazada".
- [ ] **`FECompUltimoAutorizado`** real: numeración desde AFIP (no desde la DB),
      con reconciliación ante desfasajes.
- [ ] Reemplazar los `CAE_<timestamp>` stub por el CAE real en `document.update`.
- [ ] Tests de armado del envelope y del parseo de respuestas (mocks de WSFE).

### Fase 3 — Integración en el desktop 🟠

Que el operador pueda facturar electrónicamente desde la app.

- [ ] **Habilitar "Autorizar AFIP"** en `new-invoice.html` (hoy `disabled`).
- [ ] **IPC desktop → nube**: método en cloud-preload/ipc-cloud que llame a
      `POST /afip/cae` con el documento y espere CAE/venc.
- [ ] **Escribir el CAE** de vuelta en la factura local (`invoices.cae`,
      `cae_expiry`, número definitivo) y reflejar estado en el banner AFIP.
- [ ] **QR AFIP** (RG 4892) + CAE y venc. en el **comprobante impreso**
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
