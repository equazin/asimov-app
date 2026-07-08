/**
 * Código QR de la factura electrónica (RG 4892/2020 de AFIP/ARCA).
 *
 * El QR codifica una URL `https://www.afip.gob.ar/fe/qr/?p=<base64(JSON)>` con
 * los datos del comprobante autorizado. `buildAfipQrUrl` es pura y testeable;
 * la generación de la imagen (data URL) vive en el servicio (usa `qrcode`).
 */

export interface AfipQrData {
  fecha: string;      // yyyy-mm-dd
  cuit: number;       // CUIT del emisor
  ptoVta: number;
  tipoCmp: number;    // código de comprobante AFIP
  nroCmp: number;
  importe: number;    // importe total
  tipoDocRec: number; // 80 CUIT, 96 DNI, 99 consumidor final
  nroDocRec: number;
  codAut: number;     // CAE
  moneda?: string;    // default PES
  ctz?: number;       // default 1
}

/** Arma la URL del QR según el formato oficial de AFIP. */
export function buildAfipQrUrl(data: AfipQrData): string {
  const payload = {
    ver: 1,
    fecha: data.fecha,
    cuit: data.cuit,
    ptoVta: data.ptoVta,
    tipoCmp: data.tipoCmp,
    nroCmp: data.nroCmp,
    importe: Math.round(data.importe * 100) / 100,
    moneda: data.moneda ?? 'PES',
    ctz: data.ctz ?? 1,
    tipoDocRec: data.tipoDocRec,
    nroDocRec: data.nroDocRec,
    tipoCodAut: 'E',
    codAut: data.codAut,
  };
  const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  return `https://www.afip.gob.ar/fe/qr/?p=${b64}`;
}
