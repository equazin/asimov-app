import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class CustomizationService {
  constructor(private readonly prisma: PrismaService) {}

  async getTenantBranding(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        logo: true,
        primaryColor: true,
        printHeader: true,
        printFooter: true,
      },
    });

    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    return tenant;
  }

  async updateBranding(
    tenantId: string,
    data: {
      logo?: string;
      primaryColor?: string;
      printHeader?: string;
      printFooter?: string;
    },
  ) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        logo: data.logo,
        primaryColor: data.primaryColor,
        printHeader: data.printHeader,
        printFooter: data.printFooter,
      },
      select: {
        id: true,
        logo: true,
        primaryColor: true,
        printHeader: true,
        printFooter: true,
      },
    });
  }

  async getPrintTemplates(tenantId: string) {
    return this.prisma.printTemplate.findMany({
      where: { tenantId },
      orderBy: { documentType: 'asc' },
    });
  }

  async getPrintTemplate(tenantId: string, id: string) {
    const template = await this.prisma.printTemplate.findFirst({
      where: { id, tenantId },
    });

    if (!template) throw new NotFoundException('Template no encontrado');
    return template;
  }

  async updatePrintTemplate(
    tenantId: string,
    id: string,
    data: { name?: string; htmlTemplate?: string; isDefault?: boolean },
  ) {
    const template = await this.prisma.printTemplate.findFirst({
      where: { id, tenantId },
    });

    if (!template) throw new NotFoundException('Template no encontrado');

    if (data.isDefault) {
      await this.prisma.printTemplate.updateMany({
        where: { tenantId, documentType: template.documentType },
        data: { isDefault: false },
      });
    }

    return this.prisma.printTemplate.update({
      where: { id },
      data: {
        name: data.name,
        htmlTemplate: data.htmlTemplate,
        isDefault: data.isDefault,
      },
    });
  }

  async createPrintTemplate(
    tenantId: string,
    data: { documentType: string; name: string; htmlTemplate: string; isDefault?: boolean },
  ) {
    if (data.isDefault) {
      await this.prisma.printTemplate.updateMany({
        where: { tenantId, documentType: data.documentType },
        data: { isDefault: false },
      });
    }

    return this.prisma.printTemplate.create({
      data: {
        tenantId,
        documentType: data.documentType,
        name: data.name,
        htmlTemplate: data.htmlTemplate,
        isDefault: data.isDefault ?? false,
      },
    });
  }

  async renderDocument(tenantId: string, documentId: string): Promise<string> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, tenantId },
      include: {
        client: true,
        supplier: true,
        items: { include: { product: true } },
      },
    });

    if (!document) throw new NotFoundException('Documento no encontrado');

    const template = await this.prisma.printTemplate.findFirst({
      where: { tenantId, documentType: document.type, isDefault: true },
    });

    const branding = await this.getTenantBranding(tenantId);

    const html = template?.htmlTemplate ?? this.getDefaultTemplate(document.type);

    return this.interpolateTemplate(html, {
      document,
      branding,
      items: document.items,
      client: document.client,
      supplier: document.supplier,
    });
  }

  private interpolateTemplate(
    html: string,
    data: Record<string, unknown>,
  ): string {
    const branding = data.branding as Record<string, unknown>;
    const doc = data.document as Record<string, unknown>;
    const client = data.client as Record<string, unknown> | null;
    const items = data.items as Array<Record<string, unknown>>;

    let result = html
      .replace(/\{\{company\.name\}\}/g, String(branding?.name ?? ''))
      .replace(/\{\{company\.logo\}\}/g, String(branding?.logo ?? ''))
      .replace(/\{\{company\.primaryColor\}\}/g, String(branding?.primaryColor ?? '#f97316'))
      .replace(/\{\{letterhead\}\}/g, String(branding?.printHeader ?? ''))
      .replace(/\{\{footer\}\}/g, String(branding?.printFooter ?? ''))
      .replace(/\{\{document\.type\}\}/g, String(doc?.type ?? ''))
      .replace(/\{\{document\.number\}\}/g, String(doc?.number ?? ''))
      .replace(/\{\{document\.date\}\}/g, doc?.createdAt ? new Date(doc.createdAt as string).toLocaleDateString('es-AR') : '')
      .replace(/\{\{document\.subtotal\}\}/g, String(doc?.subtotal ?? '0'))
      .replace(/\{\{document\.totalIva\}\}/g, String(doc?.totalIva ?? '0'))
      .replace(/\{\{document\.total\}\}/g, String(doc?.total ?? '0'))
      .replace(/\{\{document\.notes\}\}/g, String(doc?.notes ?? ''))
      .replace(/\{\{client\.name\}\}/g, String(client?.businessName ?? ''))
      .replace(/\{\{client\.cuit\}\}/g, String(client?.cuit ?? ''))
      .replace(/\{\{client\.address\}\}/g, String(client?.address ?? ''))
      .replace(/\{\{client\.fiscalType\}\}/g, String(client?.fiscalType ?? ''));

    const itemsHtml = items.map((item) => `
      <tr>
        <td>${(item.product as Record<string, unknown>)?.code ?? ''}</td>
        <td>${item.description ?? ''}</td>
        <td style="text-align:right">${item.qty}</td>
        <td style="text-align:right">$${item.unitPrice}</td>
        <td style="text-align:right">${item.ivaRate}%</td>
        <td style="text-align:right">$${item.subtotal}</td>
      </tr>
    `).join('');

    result = result.replace(/\{\{items\}\}/g, itemsHtml);

    return result;
  }

  private getDefaultTemplate(documentType: string): string {
    const typeLabels: Record<string, string> = {
      invoice: 'FACTURA',
      quote: 'PRESUPUESTO',
      sale_order: 'PEDIDO DE VENTA',
      delivery_note: 'REMITO',
      receipt: 'RECIBO',
      purchase_order: 'ORDEN DE COMPRA',
      credit_note: 'NOTA DE CRÉDITO',
      debit_note: 'NOTA DE DÉBITO',
    };

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
.header { display: flex; justify-content: space-between; border-bottom: 2px solid {{company.primaryColor}}; padding-bottom: 10px; margin-bottom: 20px; }
.logo img { max-height: 60px; }
.title { font-size: 18px; font-weight: bold; color: {{company.primaryColor}}; }
table { width: 100%; border-collapse: collapse; margin: 10px 0; }
th { background: {{company.primaryColor}}; color: white; padding: 8px; text-align: left; }
td { padding: 6px 8px; border-bottom: 1px solid #eee; }
.totals { text-align: right; margin-top: 20px; }
.total-row { font-size: 14px; margin: 4px 0; }
.total-final { font-size: 18px; font-weight: bold; color: {{company.primaryColor}}; }
.footer { margin-top: 40px; border-top: 1px solid #ccc; padding-top: 10px; font-size: 10px; color: #666; }
</style></head>
<body>
{{letterhead}}
<div class="header">
  <div class="logo"><img src="{{company.logo}}" alt="{{company.name}}" /></div>
  <div><div class="title">${typeLabels[documentType] ?? documentType.toUpperCase()}</div>
  <div>N° {{document.number}}</div>
  <div>Fecha: {{document.date}}</div></div>
</div>
<div><strong>Cliente:</strong> {{client.name}}<br/>
<strong>CUIT:</strong> {{client.cuit}}<br/>
<strong>Dirección:</strong> {{client.address}}<br/>
<strong>Cond. IVA:</strong> {{client.fiscalType}}</div>
<table><thead><tr><th>Código</th><th>Descripción</th><th>Cant.</th><th>P. Unit.</th><th>IVA</th><th>Subtotal</th></tr></thead>
<tbody>{{items}}</tbody></table>
<div class="totals">
  <div class="total-row">Subtotal: ${{document.subtotal}}</div>
  <div class="total-row">IVA: ${{document.totalIva}}</div>
  <div class="total-final">TOTAL: ${{document.total}}</div>
</div>
<div class="footer">{{footer}}</div>
</body></html>`;
  }
}
