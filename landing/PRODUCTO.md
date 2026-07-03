# Asimov ERP — Análisis de producto

> Documento de trabajo para la landing de venta. Relevado desde el código fuente
> del repo `equazin/asimov-app` (shell.html, formularios nativos, air.ts, README)
> y la web de Bartez Tecnología (bartez.com.ar). Fecha: julio 2026.

## Qué es

**Asimov** es el ERP de gestión comercial de **Bartez Tecnología** (distribuidora
IT argentina con 18 años en el mercado y más de 10.000 clientes). Se compone de:

1. **ERP web** — backend y frontend web con todos los módulos de gestión.
2. **App de escritorio para Windows** (este repo) — Electron. No empaqueta el
   frontend: carga la web remota del ERP y comparte backend y base de datos con
   la versión web. Cada deploy de la web actualiza la app al instante.

Tagline real del sistema (splash.html): **"ERP empresarial modular"**.

## Módulos del ERP (relevados del shell y los formularios nativos)

### Dashboard
- Indicadores del día: ventas hoy, facturas pendientes, clientes, alertas de
  stock, compras pendientes, tickets abiertos, saldo en caja.
- Accesos rápidos con atajos de teclado (Ctrl+2 Ventas, Ctrl+3 Compras, etc.).

### Ventas
- **Pedidos de venta** con encabezado completo (cliente, condición de venta,
  lista de precios, vendedor, moneda ARS/USD, sucursal, depósito, prioridad).
- **Cotizaciones / presupuestos** con validez y confirmación del cliente.
- **Clientes** con condición IVA, CUIT, cuenta corriente.
- **Oportunidades** (pipeline comercial).
- **Margen de ganancia por ítem**: columnas de costo, % margen y precio
  calculado automáticamente (costo × (1 + margen)). Margen general por pedido.
- Ítems con buscador de artículos (F4), descuentos por línea y descuento general.

### Compras
- **Órdenes de compra** a proveedores.
- **Recepciones de mercadería** (goods receipt).
- **Proveedores** con cuenta corriente.
- **Facturas de compra**.

### Stock
- Stock consolidado con mínimos y alertas.
- **Movimientos** de stock.
- **Multi-depósito** (depósitos).
- **Números de serie** (trazabilidad por unidad).
- **Alertas** de stock bajo.

### Facturación (Argentina: ARCA/ex AFIP)
- **Facturas A / B / C / M, Notas de Débito y Crédito** con selector de tipo
  según condición IVA del cliente (auto-sugerido).
- **CAE**: autorización electrónica ARCA en tiempo real, con estado
  (pendiente / autorizada / rechazada), modalidad CAE/CAEA y mensajes de error.
- IVA 21% / 10,5% / exento por línea; percepciones IIBB; retenciones.
- **Remitos**, **Recibos**, **Listas de precios**.
- Formas de cobro: efectivo, transferencia, cheques, tarjetas, MercadoPago,
  cuenta corriente, cuotas con cálculo de importe por cuota.

### Tesorería
- **Caja** (saldo en tiempo real en el dashboard).
- **Cuenta corriente de clientes** y **de proveedores**.
- **Órdenes de pago**.

### Contabilidad
- **Libro diario**, **reportes**, **export contable**, **auditoría**.
- Una venta descuenta stock, genera la factura y asienta en contabilidad
  automáticamente (flujo integrado real del sistema).

### CRM
- Cuentas CRM integradas con ventas y oportunidades.

### RMA (postventa)
- Gestión de garantías y devoluciones — módulo poco común en competidores
  de este segmento.

### Integraciones
- **AIR S.R.L.** (mayorista IT): sincronización automática de catálogo del
  proveedor — precios, stock por sucursal (Rosario, Mendoza, Córdoba, etc.),
  part numbers — cada 15 minutos. Los artículos del proveedor aparecen en el
  buscador de productos y en la vista de stock con badge de origen.
  Es decir: **el catálogo del mayorista vive adentro del ERP** y se puede
  pedir/facturar con margen sobre el costo real del proveedor.

## App de escritorio (diferencial fuerte)

- **Impresión nativa silenciosa**: facturas y presupuestos salen directo a la
  impresora, sin diálogos del navegador.
- **Notificaciones de Windows**: leads y alertas llegan al escritorio.
- **Multi-servidor / multi-empresa**: selector con historial y nombres editables;
  cambio de empresa al instante.
- **Multi-ventana** (Ctrl+N) para operar dos pantallas del ERP en paralelo.
- **Favoritos** de pantallas del ERP (Ctrl+B / Ctrl+D).
- Menú nativo por módulos (Ventas, Compras, Stock, Facturación, Tesorería,
  Contabilidad, RMA, Config).
- **Inicio automático con Windows** y bandeja del sistema (tray).
- **Auto-actualización** vía GitHub Releases: siempre la última versión.
- Deeplinks `bartez://` para abrir pantallas desde otras apps.
- Sesión persistente aislada y barra de estado (servidor, versión, conexión).
- Descarga: https://github.com/equazin/asimov-app/releases/latest

## Diferenciales para vender (vs. Xubio / Colppy / Contabilium / Holded)

1. **App de escritorio nativa incluida** — los competidores directos son
   solo-web. Impresión directa + notificaciones + autoarranque es un flujo de
   mostrador real.
2. **Margen de ganancia por ítem y por documento** — pedidos y facturas parten
   del costo y calculan el precio; nadie vende al costo por error.
3. **Catálogo de mayoristas integrado** (AIR) — stock y costo del proveedor en
   tiempo real dentro del buscador de artículos.
4. **Números de serie + RMA** — trazabilidad completa para rubros técnicos
   (IT, electrónica, electrodomésticos), donde los ERP contables flojean.
5. **Flujo integrado real**: venta → stock → factura → contabilidad sin pasos
   manuales.
6. **Facturación legal en dos países**: ARCA (CAE) en Argentina; España con
   Verifactu (obligatorio para sociedades desde 1/1/2027 y autónomos desde
   1/7/2027) — llegar antes de la obligación es el pitch.
7. **Multi-empresa sin costo por CUIT extra** (selector de servidores).

## Público objetivo

Dueños de pymes y distribuidoras (IT, electrónica, repuestos, insumos) de
Argentina y España que hoy usan Excel o un sistema viejo de escritorio.
Poco técnicos: valoran que funcione el primer día, el mostrador rápido y
no perder plata por vender al costo.
