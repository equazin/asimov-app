import { describe, it, expect } from "vitest";
import * as forge from "node-forge";
import { signTRA, certNotAfter, isValidCertPem, isValidKeyPem } from "../src/afip/crypto";
import {
  buildLoginTicketRequest, buildLoginCmsEnvelope, extractLoginCmsReturn,
  parseLoginTicketResponse, isTaValid,
} from "../src/afip/wsaa";
import {
  afipDate, formatAfipDate, buildUltimoAutorizadoEnvelope, parseUltimoAutorizado,
  buildFECAESolicitarEnvelope, parseFECAEResponse, callWsfe, WSFE_URLS,
} from "../src/afip/wsfe";
import { callLoginCms, WSAA_URLS } from "../src/afip/wsaa";
import {
  afipIvaCode, buildIvaAlicuotas, getInvoiceTypeCode, receptorDocType,
  AfipUnavailableError, isAfipUnavailable,
  resolveVoucherTypeCode, validateVoucherForClient, requiresAssociatedInvoice, voucherLetterForClient,
} from "../src/afip/domain";
import { buildAfipQrUrl } from "../src/afip/qr";

function makeSelfSigned(): { certPem: string; keyPem: string } {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const attrs = [{ name: "commonName", value: "test" }, { name: "countryName", value: "AR" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { certPem: forge.pki.certificateToPem(cert), keyPem: forge.pki.privateKeyToPem(keys.privateKey) };
}

function escapeForXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

describe("afip/domain", () => {
  it("afipIvaCode mapea alícuotas y cae a 21% por defecto", () => {
    expect(afipIvaCode(21)).toBe(5);
    expect(afipIvaCode(10.5)).toBe(4);
    expect(afipIvaCode(15)).toBe(5);
  });

  it("buildIvaAlicuotas agrupa por alícuota y redondea", () => {
    const alic = buildIvaAlicuotas([
      { ivaRate: 21, subtotal: 200 }, { ivaRate: 21, subtotal: 100 }, { ivaRate: 10.5, subtotal: 50 },
    ]);
    expect(alic).toEqual([
      { Id: 4, BaseImp: 50, Importe: 5.25 },
      { Id: 5, BaseImp: 300, Importe: 63 },
    ]);
  });

  it("getInvoiceTypeCode y receptorDocType", () => {
    expect(getInvoiceTypeCode("A", "responsable_inscripto")).toBe(1);
    expect(getInvoiceTypeCode("C", "monotributista")).toBe(11);
    expect(receptorDocType("20304050607")).toEqual({ docType: 80, docNumber: "20304050607" });
    expect(receptorDocType("")).toEqual({ docType: 99, docNumber: "0" });
  });
});

describe("afip/qr — QR de AFIP (RG 4892)", () => {
  it("arma la URL oficial con el payload base64 decodificable", () => {
    const url = buildAfipQrUrl({
      fecha: "2026-07-08", cuit: 30712345678, ptoVta: 3, tipoCmp: 6, nroCmp: 43,
      importe: 121, tipoDocRec: 80, nroDocRec: 27111111112, codAut: 75123456789012,
    });
    expect(url.startsWith("https://www.afip.gob.ar/fe/qr/?p=")).toBe(true);
    const b64 = url.split("p=")[1];
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    expect(json).toMatchObject({
      ver: 1, cuit: 30712345678, ptoVta: 3, tipoCmp: 6, nroCmp: 43,
      importe: 121, moneda: "PES", ctz: 1, tipoCodAut: "E", codAut: 75123456789012,
    });
  });
});

describe("afip/crypto — firma CMS", () => {
  it("firma el TRA y produce un PKCS#7 base64 parseable", () => {
    const { certPem, keyPem } = makeSelfSigned();
    const cms = signTRA(buildLoginTicketRequest("wsfe"), certPem, keyPem);
    const p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(forge.util.decode64(cms)));
    expect(p7).toBeTruthy();
  });

  it("valida PEMs y rechaza inválidos", () => {
    const { certPem, keyPem } = makeSelfSigned();
    expect(isValidCertPem(certPem)).toBe(true);
    expect(isValidKeyPem(keyPem)).toBe(true);
    expect(isValidCertPem("no-pem")).toBe(false);
    expect(() => signTRA("", certPem, keyPem)).toThrow(/vacío/);
    expect(certNotAfter(certPem).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("afip/wsaa", () => {
  it("envelope de LoginCms + parseo del TA", () => {
    expect(buildLoginCmsEnvelope("CMS")).toContain("<wsaa:in0>CMS</wsaa:in0>");
    const ticket =
      "<loginTicketResponse><header><expirationTime>2026-07-08T12:00:00.000-03:00</expirationTime></header>" +
      "<credentials><token>TOK</token><sign>SGN</sign></credentials></loginTicketResponse>";
    const soap = "<Envelope><Body><loginCmsResponse><loginCmsReturn>" +
      escapeForXml(ticket) + "</loginCmsReturn></loginCmsResponse></Body></Envelope>";
    const ta = parseLoginTicketResponse(extractLoginCmsReturn(soap));
    expect(ta.token).toBe("TOK");
    expect(ta.sign).toBe("SGN");
  });

  it("SOAP Fault se reporta legible; isTaValid respeta el margen", () => {
    const fault = "<Envelope><Body><Fault><faultstring>El CEE ya posee un TA valido</faultstring></Fault></Body></Envelope>";
    expect(() => extractLoginCmsReturn(fault)).toThrow(/ya posee un TA valido/);
    expect(isTaValid({ expiration: new Date(Date.now() + 30 * 60_000).toISOString() })).toBe(true);
    expect(isTaValid({ expiration: new Date(Date.now() + 2 * 60_000).toISOString() })).toBe(false);
    expect(isTaValid(null)).toBe(false);
  });
});

describe("afip/wsfe", () => {
  const ta = { token: "T", sign: "S", expiration: new Date().toISOString() };
  const cab = { cuit: "20304050607", pointOfSale: 3, invoiceType: 6 };

  it("fechas y último autorizado", () => {
    expect(afipDate(new Date("2026-07-08T10:00:00"))).toBe("20260708");
    expect(formatAfipDate("20260718")).toBe("2026-07-18");
    const xml = "<Env><Body><FECompUltimoAutorizadoResult><CbteNro>42</CbteNro></FECompUltimoAutorizadoResult></Body></Env>";
    expect(parseUltimoAutorizado(xml)).toBe(42);
    expect(buildUltimoAutorizadoEnvelope(ta, cab)).toContain("<ar:PtoVta>3</ar:PtoVta>");
  });

  it("FECAESolicitar: envelope con IVA y factura C sin IVA", () => {
    const cbte = {
      docType: 80, docNumber: "27111111112", invoiceNumber: 43, date: new Date("2026-07-08T10:00:00"),
      impNeto: 100, impIva: 21, impTotal: 121, items: [{ ivaRate: 21, subtotal: 100 }],
    };
    const env = buildFECAESolicitarEnvelope(ta, cab, cbte);
    expect(env).toContain("<ar:CbteDesde>43</ar:CbteDesde>");
    expect(env).toContain("<ar:ImpIVA>21</ar:ImpIVA>");
    expect(env).toContain("<ar:Id>5</ar:Id>");
    const envC = buildFECAESolicitarEnvelope(ta, { ...cab, invoiceType: 11 }, cbte);
    expect(envC).not.toContain("<ar:Iva>");
    expect(envC).toContain("<ar:ImpIVA>0</ar:ImpIVA>");
  });

  it("parsea CAE aprobado y rechazo con observaciones", () => {
    const ok =
      "<Env><Body><FECAESolicitarResult><FeDetResp><FECAEDetResponse>" +
      "<CbteDesde>43</CbteDesde><Resultado>A</Resultado><CAE>75123456789012</CAE><CAEFchVto>20260718</CAEFchVto>" +
      "</FECAEDetResponse></FeDetResp></FECAESolicitarResult></Body></Env>";
    const r1 = parseFECAEResponse(ok);
    expect(r1.ok).toBe(true);
    if (r1.ok) { expect(r1.cae).toBe("75123456789012"); expect(r1.caeExpiration).toBe("2026-07-18"); }

    const rej =
      "<Env><Body><FECAESolicitarResult><FeDetResp><FECAEDetResponse><Resultado>R</Resultado>" +
      "<Observaciones><Obs><Code>10015</Code><Msg>Fecha fuera de rango</Msg></Obs></Observaciones>" +
      "</FECAEDetResponse></FeDetResp></FECAESolicitarResult></Body></Env>";
    const r2 = parseFECAEResponse(rej);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.observations[0]).toEqual({ code: "10015", msg: "Fecha fuera de rango" });
  });
});

describe("afip/domain — Fase 4: NC/ND, letra según cliente y validación", () => {
  it("resolveVoucherTypeCode deriva la letra de la condición del cliente", () => {
    expect(voucherLetterForClient("Responsable Inscripto")).toBe("A");
    expect(voucherLetterForClient("Consumidor Final")).toBe("B");
    // NC/ND: 3/8 y 2/7 según el cliente
    expect(resolveVoucherTypeCode("NC", "Responsable Inscripto")).toBe(3);
    expect(resolveVoucherTypeCode("NC", "Consumidor Final")).toBe(8);
    expect(resolveVoucherTypeCode("ND", "Responsable Inscripto")).toBe(2);
    expect(resolveVoucherTypeCode("ND", "Monotributista")).toBe(7);
    // Facturas
    expect(resolveVoucherTypeCode("A", "Responsable Inscripto")).toBe(1);
    expect(resolveVoucherTypeCode("B", "Consumidor Final")).toBe(6);
    expect(resolveVoucherTypeCode("M", "Responsable Inscripto")).toBe(51);
    // Emisor monotributista: serie C
    expect(resolveVoucherTypeCode("B", "Consumidor Final", "monotributista")).toBe(11);
    expect(resolveVoucherTypeCode("NC", "Responsable Inscripto", "monotributista")).toBe(13);
    expect(resolveVoucherTypeCode("ND", "Consumidor Final", "monotributista")).toBe(12);
  });

  it("validateVoucherForClient detecta incoherencias A/B/C", () => {
    expect(validateVoucherForClient("A", "Responsable Inscripto", "30712345678")).toBeNull();
    expect(validateVoucherForClient("B", "Consumidor Final", "")).toBeNull();
    expect(validateVoucherForClient("A", "Consumidor Final", "")).toMatch(/Responsable Inscripto/);
    expect(validateVoucherForClient("A", "Responsable Inscripto", "")).toMatch(/CUIT/);
    expect(validateVoucherForClient("B", "Responsable Inscripto", "30712345678")).toMatch(/corresponde Factura A/);
    expect(validateVoucherForClient("C", "Consumidor Final", "")).toMatch(/monotributista/);
    expect(validateVoucherForClient("NC", "Responsable Inscripto", "")).toMatch(/CUIT/);
    expect(validateVoucherForClient("NC", "Consumidor Final", "")).toBeNull();
    // Emisor monotributista emite C a cualquiera
    expect(validateVoucherForClient("C", "Consumidor Final", "", "monotributista")).toBeNull();
  });

  it("requiresAssociatedInvoice sólo para NC/ND", () => {
    expect(requiresAssociatedInvoice("NC")).toBe(true);
    expect(requiresAssociatedInvoice("nd")).toBe(true);
    expect(requiresAssociatedInvoice("A")).toBe(false);
    expect(requiresAssociatedInvoice("")).toBe(false);
  });
});

describe("afip/wsfe — CbtesAsoc (comprobante asociado de NC/ND)", () => {
  const ta = { token: "T", sign: "S", expiration: new Date().toISOString() };
  const cbteBase = {
    docType: 80, docNumber: "27111111112", invoiceNumber: 7, date: new Date("2026-07-08T10:00:00"),
    impNeto: 100, impIva: 21, impTotal: 121, items: [{ ivaRate: 21, subtotal: 100 }],
  };

  it("incluye CbtesAsoc antes de Iva, con tipo/ptovta/nro/cuit", () => {
    const env = buildFECAESolicitarEnvelope(ta, { cuit: "30712345678", pointOfSale: 3, invoiceType: 3 }, {
      ...cbteBase,
      cbtesAsoc: [{ tipo: 1, ptoVta: 3, nro: 43, cuit: "30712345678" }],
    });
    expect(env).toContain(
      "<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>1</ar:Tipo><ar:PtoVta>3</ar:PtoVta><ar:Nro>43</ar:Nro>" +
      "<ar:Cuit>30712345678</ar:Cuit></ar:CbteAsoc></ar:CbtesAsoc>",
    );
    expect(env.indexOf("<ar:CbtesAsoc>")).toBeLessThan(env.indexOf("<ar:Iva>"));
  });

  it("sin asociados no emite el bloque", () => {
    const env = buildFECAESolicitarEnvelope(ta, { cuit: "30712345678", pointOfSale: 3, invoiceType: 6 }, cbteBase);
    expect(env).not.toContain("CbtesAsoc");
  });
});

describe("afip — modo offline (AfipUnavailableError)", () => {
  const ta = { token: "T", sign: "S", expiration: new Date().toISOString() };
  const cab = { cuit: "20304050607", pointOfSale: 3, invoiceType: 6 };
  const fetchDown = (() => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch;

  it("callWsfe sin red lanza AfipUnavailableError (no un rechazo)", async () => {
    const call = callWsfe(WSFE_URLS.homologacion, "FECAESolicitar", buildUltimoAutorizadoEnvelope(ta, cab), fetchDown);
    await expect(call).rejects.toBeInstanceOf(AfipUnavailableError);
    await expect(call).rejects.toThrow(/No se pudo conectar con AFIP/);
  });

  it("callLoginCms sin red lanza AfipUnavailableError", async () => {
    await expect(callLoginCms(WSAA_URLS.homologacion, "Q01T", fetchDown)).rejects.toBeInstanceOf(AfipUnavailableError);
  });

  it("isAfipUnavailable distingue caída de red de un rechazo de AFIP", () => {
    expect(isAfipUnavailable(new AfipUnavailableError("sin red"))).toBe(true);
    expect(isAfipUnavailable(new Error("AFIP rechazó el comprobante: [10015] Fecha fuera de rango"))).toBe(false);
    expect(isAfipUnavailable("string")).toBe(false);
  });

  it("una respuesta HTTP con SOAP Fault NO es 'no disponible': es un error real", async () => {
    const fetchFault = (() => Promise.resolve({
      ok: false, status: 500,
      text: () => Promise.resolve("<Envelope><Body><Fault><faultstring>Computador no autorizado</faultstring></Fault></Body></Envelope>"),
    })) as unknown as typeof fetch;
    const call = callWsfe(WSFE_URLS.homologacion, "FECAESolicitar", "<x/>", fetchFault);
    await expect(call).rejects.toThrow(/Computador no autorizado/);
    await expect(call).rejects.not.toBeInstanceOf(AfipUnavailableError);
  });
});
