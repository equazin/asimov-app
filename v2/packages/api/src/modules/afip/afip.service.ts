import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import {
  loadEncKey,
  encryptSecret,
  decryptSecret,
  signTRA,
  certNotAfter,
} from './afip-crypto';
import {
  WSAA_URLS,
  buildLoginTicketRequest,
  callLoginCms,
  isTaValid,
  type AfipTA,
} from './afip-wsaa';
import {
  WSFE_URLS,
  buildUltimoAutorizadoEnvelope,
  parseUltimoAutorizado,
  buildFECAESolicitarEnvelope,
  parseFECAEResponse,
  callWsfe,
  type FeCabecera,
  type FeComprobante,
} from './afip-wsfe';
import { receptorDocType, getInvoiceTypeCode } from './afip-domain';

// Re-export de la lógica de dominio para compatibilidad con imports existentes.
export {
  AFIP_IVA_CODES,
  afipIvaCode,
  buildIvaAlicuotas,
  getInvoiceTypeCode,
  type AfipAlicIva,
} from './afip-domain';
export { buildLoginTicketRequest } from './afip-wsaa';

const AFIP_PROVIDER = 'afip';

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
  concepto?: number;
  date?: Date;
}

interface CaeResultDto {
  cae: string;
  caeExpirationDate: string;
  invoiceNumber: number;
  observations?: Array<{ code: string; msg: string }>;
}

/** Config AFIP del tenant, tal como se guarda en `integration_configs.config`. */
interface AfipTenantConfig {
  cuit: string;
  certEnc?: string;      // certificado (PEM) cifrado
  keyEnc?: string;       // clave privada (PEM) cifrada
  env?: 'homologacion' | 'produccion';
  ta?: AfipTA;           // TA cacheado (token/sign/expiration)
}

@Injectable()
export class AfipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private encKey(): Buffer {
    return loadEncKey(this.config.get<string>('AFIP_ENC_KEY'));
  }

  private isProdDefault(): boolean {
    return this.config.get('AFIP_ENV') === 'production';
  }

  /** Tipo de comprobante AFIP según condición fiscal (delega en afip-domain). */
  getInvoiceTypeCode(invoiceType: string, fiscalType: string): number {
    return getInvoiceTypeCode(invoiceType, fiscalType);
  }

  // ── Configuración de credenciales por tenant ────────────────────────────

  /** Guarda (cifrado) el certificado + clave del contribuyente para un tenant. */
  async saveCredentials(
    tenantId: string,
    input: { cuit: string; certPem: string; keyPem: string; env?: 'homologacion' | 'produccion' },
  ): Promise<{ ok: true; certExpires: string }> {
    const encKey = this.encKey();
    if (!/^\d{11}$/.test(String(input.cuit))) {
      throw new BadRequestException('CUIT inválido: deben ser 11 dígitos.');
    }
    let expires: Date;
    try {
      expires = certNotAfter(input.certPem);
    } catch {
      throw new BadRequestException('El certificado no es un PEM válido.');
    }
    const config: AfipTenantConfig = {
      cuit: input.cuit,
      certEnc: encryptSecret(input.certPem, encKey),
      keyEnc: encryptSecret(input.keyPem, encKey),
      env: input.env ?? (this.isProdDefault() ? 'produccion' : 'homologacion'),
      // Al cambiar credenciales se invalida el TA cacheado.
      ta: undefined,
    };
    await this.prisma.integrationConfig.upsert({
      where: { tenantId_provider: { tenantId, provider: AFIP_PROVIDER } },
      create: { tenantId, provider: AFIP_PROVIDER, config: config as object, active: true },
      update: { config: config as object, active: true, deletedAt: null },
    });
    return { ok: true, certExpires: expires.toISOString() };
  }

  private async loadConfig(tenantId: string): Promise<AfipTenantConfig> {
    const row = await this.prisma.integrationConfig.findUnique({
      where: { tenantId_provider: { tenantId, provider: AFIP_PROVIDER } },
    });
    if (!row || !row.active) {
      throw new BadRequestException('AFIP no está configurado para esta empresa. Cargá el certificado primero.');
    }
    const cfg = row.config as unknown as AfipTenantConfig;
    if (!cfg?.certEnc || !cfg?.keyEnc || !cfg?.cuit) {
      throw new BadRequestException('Configuración AFIP incompleta: falta certificado, clave o CUIT.');
    }
    return cfg;
  }

  private async persistTa(tenantId: string, cfg: AfipTenantConfig, ta: AfipTA): Promise<void> {
    await this.prisma.integrationConfig.update({
      where: { tenantId_provider: { tenantId, provider: AFIP_PROVIDER } },
      data: { config: { ...cfg, ta } as object },
    });
  }

  // ── WSAA: obtener TA (con cache) ─────────────────────────────────────────

  /**
   * Devuelve un TA válido: reusa el cacheado si sigue vigente (AFIP rechaza
   * pedir uno nuevo mientras el anterior no venció) y, si no, autentica.
   */
  async getTA(tenantId: string): Promise<AfipTA> {
    const cfg = await this.loadConfig(tenantId);
    if (isTaValid(cfg.ta)) return cfg.ta as AfipTA;

    const encKey = this.encKey();
    const certPem = decryptSecret(cfg.certEnc as string, encKey);
    const keyPem = decryptSecret(cfg.keyEnc as string, encKey);
    const tra = buildLoginTicketRequest('wsfe');
    const cms = signTRA(tra, certPem, keyPem);
    const url = cfg.env === 'produccion' ? WSAA_URLS.produccion : WSAA_URLS.homologacion;

    const ta = await callLoginCms(url, cms);
    await this.persistTa(tenantId, cfg, ta);
    return ta;
  }

  /** Prueba de autenticación (para el botón "Probar conexión"). */
  async testAuth(tenantId: string): Promise<{ expirationTime: string }> {
    const ta = await this.getTA(tenantId);
    return { expirationTime: ta.expiration };
  }

  // ── WSFE: último autorizado + solicitud de CAE ───────────────────────────

  async getLastInvoiceNumber(tenantId: string, pointOfSale: number, invoiceType: number): Promise<number> {
    const cfg = await this.loadConfig(tenantId);
    const ta = await this.getTA(tenantId);
    const cab: FeCabecera = { cuit: cfg.cuit, pointOfSale, invoiceType };
    const url = cfg.env === 'produccion' ? WSFE_URLS.produccion : WSFE_URLS.homologacion;
    const xml = await callWsfe(url, 'FECompUltimoAutorizado', buildUltimoAutorizadoEnvelope(ta, cab));
    return parseUltimoAutorizado(xml);
  }

  async requestCae(tenantId: string, invoiceData: AfipInvoiceData): Promise<CaeResultDto> {
    const cfg = await this.loadConfig(tenantId);
    const ta = await this.getTA(tenantId);
    const url = cfg.env === 'produccion' ? WSFE_URLS.produccion : WSFE_URLS.homologacion;

    const cab: FeCabecera = {
      cuit: cfg.cuit,
      pointOfSale: invoiceData.pointOfSale,
      invoiceType: invoiceData.invoiceType,
    };

    // Número: último autorizado por AFIP + 1 (fuente de verdad, no la DB).
    const lastNumber = parseUltimoAutorizado(
      await callWsfe(url, 'FECompUltimoAutorizado', buildUltimoAutorizadoEnvelope(ta, cab)),
    );
    const invoiceNumber = lastNumber + 1;

    const { docType, docNumber } = receptorDocType(invoiceData.clientCuit);
    const cbte: FeComprobante = {
      concepto: invoiceData.concepto ?? 1,
      docType,
      docNumber,
      invoiceNumber,
      date: invoiceData.date ?? new Date(),
      impNeto: invoiceData.totalNet,
      impIva: invoiceData.totalIva,
      impTotal: invoiceData.total,
      items: invoiceData.items,
    };

    const envelope = buildFECAESolicitarEnvelope(ta, cab, cbte);
    const result = parseFECAEResponse(await callWsfe(url, 'FECAESolicitar', envelope));

    if (!result.ok) {
      const detail = [...result.errors, ...result.observations].map((m) => `[${m.code}] ${m.msg}`).join('; ');
      throw new BadRequestException(`AFIP rechazó el comprobante: ${detail || 'sin detalle'}`);
    }

    const number = `${String(invoiceData.pointOfSale).padStart(5, '0')}-${String(result.invoiceNumber).padStart(8, '0')}`;
    await this.prisma.document.update({
      where: { id: invoiceData.documentId },
      data: {
        cae: result.cae,
        caeExpiry: new Date(result.caeExpiration),
        number,
        pointOfSale: String(invoiceData.pointOfSale).padStart(5, '0'),
        invoiceType: String(invoiceData.invoiceType),
      },
    });

    return {
      cae: result.cae,
      caeExpirationDate: new Date(result.caeExpiration).toISOString(),
      invoiceNumber: result.invoiceNumber,
      observations: result.observations,
    };
  }
}
