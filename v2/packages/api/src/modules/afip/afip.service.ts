import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';

interface AfipAuthResult {
  token: string;
  sign: string;
  expirationTime: string;
}

interface CaeResult {
  cae: string;
  caeExpirationDate: string;
  invoiceNumber: number;
}

interface AfipInvoiceData {
  documentId: string;
  pointOfSale: number;
  invoiceType: number;
  clientCuit: string;
  clientFiscalType: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    ivaRate: number;
    subtotal: number;
  }>;
  total: number;
  totalIva: number;
  totalNet: number;
}

/** Códigos de alícuota de IVA de AFIP (FEParamGetTiposIva). */
export const AFIP_IVA_CODES: Record<string, number> = {
  '0': 3,
  '2.5': 9,
  '5': 8,
  '10.5': 4,
  '21': 5,
  '27': 6,
};

/** Devuelve el código de alícuota de AFIP para un porcentaje de IVA (default 21%). */
export function afipIvaCode(rate: number): number {
  return AFIP_IVA_CODES[String(rate)] ?? 5;
}

// Redondeo a 2 decimales medio-arriba, robusto ante el ruido de punto flotante
// (p.ej. 4.725 → 4.73, y no 4.72 por 4.725*100 = 472.4999…).
const round2 = (n: number): number => Math.round(Number((n * 100).toFixed(6))) / 100;

export interface AfipAlicIva {
  Id: number;
  BaseImp: number;
  Importe: number;
}

/**
 * Agrupa los ítems por alícuota de IVA en el array `AlicIva` que exige WSFE
 * (FECAESolicitar → FeDetReq.Iva). BaseImp = neto gravado por alícuota;
 * Importe = IVA por alícuota. Los importes se redondean a 2 decimales.
 */
export function buildIvaAlicuotas(
  items: Array<{ ivaRate: number; subtotal: number }>,
): AfipAlicIva[] {
  const byCode = new Map<number, { base: number; iva: number }>();
  for (const it of items) {
    const code = afipIvaCode(it.ivaRate);
    const base = Number(it.subtotal) || 0;
    const iva = (base * (Number(it.ivaRate) || 0)) / 100;
    const acc = byCode.get(code) ?? { base: 0, iva: 0 };
    acc.base += base;
    acc.iva += iva;
    byCode.set(code, acc);
  }
  return [...byCode.entries()]
    .map(([Id, v]) => ({ Id, BaseImp: round2(v.base), Importe: round2(v.iva) }))
    .sort((a, b) => a.Id - b.Id);
}

/**
 * Arma el LoginTicketRequest (TRA) que WSAA exige. `service` es el webservice
 * destino (p.ej. 'wsfe'). El TRA se firma como CMS/PKCS#7 con el certificado del
 * contribuyente y se envía a LoginCms para obtener el token + sign (TA, vale 12h).
 */
export function buildLoginTicketRequest(service = 'wsfe', now: Date = new Date()): string {
  const uniqueId = Math.floor(now.getTime() / 1000);
  const generationTime = new Date(now.getTime() - 60_000).toISOString();
  const expirationTime = new Date(now.getTime() + 10 * 60_000).toISOString();
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<loginTicketRequest version="1.0">' +
    `<header><uniqueId>${uniqueId}</uniqueId>` +
    `<generationTime>${generationTime}</generationTime>` +
    `<expirationTime>${expirationTime}</expirationTime></header>` +
    `<service>${service}</service>` +
    '</loginTicketRequest>'
  );
}

@Injectable()
export class AfipService {
  private readonly wsaaUrl: string;
  private readonly wsfeUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const isProduction = config.get('AFIP_ENV') === 'production';
    this.wsaaUrl = isProduction
      ? 'https://wsaa.afip.gob.ar/ws/services/LoginCms'
      : 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms';
    this.wsfeUrl = isProduction
      ? 'https://servicios1.afip.gov.ar/wsfev1/service.asmx'
      : 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx';
  }

  async authenticate(tenantId: string): Promise<AfipAuthResult> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) throw new BadRequestException('Tenant no encontrado');

    const certPath = this.config.get<string>('AFIP_CERT_PATH');
    const keyPath = this.config.get<string>('AFIP_KEY_PATH');

    if (!certPath || !keyPath) {
      throw new BadRequestException(
        'Certificado AFIP no configurado. Configure AFIP_CERT_PATH y AFIP_KEY_PATH.',
      );
    }

    // TRA listo para firmar. Lo que falta (requiere el certificado de AFIP):
    // 1. Firmar este TRA como CMS/PKCS#7 con cert+key del contribuyente.
    // 2. POST del CMS (base64) a WSAA LoginCms (this.wsaaUrl).
    // 3. Parsear el LoginTicketResponse → token + sign + expirationTime.
    // 4. Cachear el TA por tenant+service (vale 12h).
    const tra = buildLoginTicketRequest('wsfe');
    void tra;
    void this.wsaaUrl;
    return {
      token: `AFIP_TOKEN_${tenantId}_${Date.now()}`,
      sign: `AFIP_SIGN_${tenantId}_${Date.now()}`,
      expirationTime: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    };
  }

  async requestCae(
    tenantId: string,
    invoiceData: AfipInvoiceData,
  ): Promise<CaeResult> {
    await this.authenticate(tenantId);

    // Desglose de IVA por alícuota, listo para FeDetReq.Iva de FECAESolicitar.
    const alicIva = buildIvaAlicuotas(invoiceData.items);

    // Lo que falta (requiere el TA real del WSAA):
    // 1. Armar el SOAP FECAESolicitar (Auth token/sign/Cuit + FeCAEReq con
    //    ImpNeto/ImpIVA/ImpTotal + Iva=alicIva).
    // 2. POST a WSFE (this.wsfeUrl) y parsear CAE + CAEFchVto.
    // 3. Manejar Errors/Observaciones (duplicado, datos inválidos, etc.).
    void alicIva;
    void this.wsfeUrl;

    const lastNumber = await this.getLastInvoiceNumber(
      tenantId,
      invoiceData.pointOfSale,
      invoiceData.invoiceType,
    );

    const invoiceNumber = lastNumber + 1;

    // Store the CAE in the document
    await this.prisma.document.update({
      where: { id: invoiceData.documentId },
      data: {
        cae: `CAE_${Date.now()}`,
        caeExpiry: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        number: `${String(invoiceData.pointOfSale).padStart(5, '0')}-${String(invoiceNumber).padStart(8, '0')}`,
        pointOfSale: String(invoiceData.pointOfSale).padStart(5, '0'),
        invoiceType: String(invoiceData.invoiceType),
      },
    });

    return {
      cae: `CAE_${Date.now()}`,
      caeExpirationDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      invoiceNumber,
    };
  }

  async getLastInvoiceNumber(
    tenantId: string,
    pointOfSale: number,
    invoiceType: number,
  ): Promise<number> {
    // In production: call FECompUltimoAutorizado on WSFE
    const lastDoc = await this.prisma.document.findFirst({
      where: {
        tenantId,
        pointOfSale: String(pointOfSale).padStart(5, '0'),
        invoiceType: String(invoiceType),
        cae: { not: null },
      },
      orderBy: { number: 'desc' },
      select: { number: true },
    });

    if (!lastDoc?.number) return 0;
    const parts = lastDoc.number.split('-');
    return parts.length === 2 ? parseInt(parts[1], 10) : 0;
  }

  getInvoiceTypeCode(invoiceType: string, fiscalType: string): number {
    const typeMap: Record<string, Record<string, number>> = {
      responsable_inscripto: {
        A: 1,
        B: 6,
        C: 11,
        credit_note_A: 3,
        credit_note_B: 8,
        debit_note_A: 2,
        debit_note_B: 7,
      },
      monotributista: {
        C: 11,
        credit_note_C: 13,
        debit_note_C: 12,
      },
    };

    return typeMap[fiscalType]?.[invoiceType] ?? 11;
  }
}
