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

    // In production, this would:
    // 1. Generate a LoginTicketRequest XML
    // 2. Sign it with the tenant's private key (CMS/PKCS#7)
    // 3. POST to WSAA LoginCms endpoint (this.wsaaUrl)
    // 4. Parse the LoginTicketResponse to extract token + sign
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

    // In production, this would:
    // 1. Call FECAESolicitar on WSFE (this.wsfeUrl)
    // 2. Send the invoice data in AFIP's XML format
    // 3. Parse the response for CAE + expiration
    // 4. Handle errors (duplicate, invalid data, etc.)
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
