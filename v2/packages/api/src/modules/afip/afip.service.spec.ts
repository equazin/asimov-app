import { describe, it, expect } from 'vitest';
import {
  AfipService,
  afipIvaCode,
  buildIvaAlicuotas,
  buildLoginTicketRequest,
} from './afip.service';
import type { PrismaService } from '../../common/prisma.service';
import type { ConfigService } from '@nestjs/config';

describe('afipIvaCode — mapeo de alícuota a código AFIP', () => {
  it('mapea las alícuotas conocidas', () => {
    expect(afipIvaCode(0)).toBe(3);
    expect(afipIvaCode(2.5)).toBe(9);
    expect(afipIvaCode(5)).toBe(8);
    expect(afipIvaCode(10.5)).toBe(4);
    expect(afipIvaCode(21)).toBe(5);
    expect(afipIvaCode(27)).toBe(6);
  });
  it('cae a 21% (código 5) para una alícuota desconocida', () => {
    expect(afipIvaCode(15)).toBe(5);
  });
});

describe('buildIvaAlicuotas — desglose de IVA por alícuota (WSFE)', () => {
  it('agrupa por alícuota sumando base e IVA', () => {
    const alic = buildIvaAlicuotas([
      { ivaRate: 21, subtotal: 200 },
      { ivaRate: 21, subtotal: 100 },
      { ivaRate: 10.5, subtotal: 50 },
    ]);
    expect(alic).toEqual([
      { Id: 4, BaseImp: 50, Importe: 5.25 }, // 10.5%: 50 → 5.25
      { Id: 5, BaseImp: 300, Importe: 63 },  // 21%: 300 → 63
    ]);
  });

  it('redondea a 2 decimales', () => {
    const alic = buildIvaAlicuotas([{ ivaRate: 10.5, subtotal: 45 }]);
    expect(alic[0]).toEqual({ Id: 4, BaseImp: 45, Importe: 4.73 }); // 4.725 → 4.73
  });

  it('lista vacía → array vacío', () => {
    expect(buildIvaAlicuotas([])).toEqual([]);
  });
});

describe('buildLoginTicketRequest — TRA del WSAA', () => {
  it('genera un TRA válido con el service y tiempos coherentes', () => {
    const now = new Date('2026-07-07T12:00:00.000Z');
    const tra = buildLoginTicketRequest('wsfe', now);
    expect(tra).toContain('<service>wsfe</service>');
    expect(tra).toContain('<loginTicketRequest version="1.0">');
    // generationTime en el pasado, expirationTime en el futuro (ventana ±10 min)
    expect(tra).toContain('<generationTime>2026-07-07T11:50:00.000Z</generationTime>');
    expect(tra).toContain('<expirationTime>2026-07-07T12:10:00.000Z</expirationTime>');
    expect(tra).toContain('<uniqueId>' + Math.floor(now.getTime() / 1000) + '</uniqueId>');
  });
});

describe('AfipService.getInvoiceTypeCode — tipos de comprobante', () => {
  const service = new AfipService(
    {} as unknown as PrismaService,
    { get: () => undefined } as unknown as ConfigService,
  );

  it('responsable inscripto: A=1, B=6, C=11', () => {
    expect(service.getInvoiceTypeCode('A', 'responsable_inscripto')).toBe(1);
    expect(service.getInvoiceTypeCode('B', 'responsable_inscripto')).toBe(6);
    expect(service.getInvoiceTypeCode('C', 'responsable_inscripto')).toBe(11);
  });
  it('notas de crédito/débito A y B', () => {
    expect(service.getInvoiceTypeCode('credit_note_A', 'responsable_inscripto')).toBe(3);
    expect(service.getInvoiceTypeCode('debit_note_B', 'responsable_inscripto')).toBe(7);
  });
  it('monotributista: C=11', () => {
    expect(service.getInvoiceTypeCode('C', 'monotributista')).toBe(11);
  });
  it('tipo desconocido → 11 (factura C) por defecto', () => {
    expect(service.getInvoiceTypeCode('Z', 'otro')).toBe(11);
  });
});
