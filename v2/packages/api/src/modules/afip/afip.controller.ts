import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AfipService } from './afip.service';
import { CurrentUser, RequestUser, Roles } from '../../common/decorators';

@ApiTags('AFIP')
@ApiBearerAuth()
@Controller('afip')
export class AfipController {
  constructor(private readonly afipService: AfipService) {}

  @Post('cae')
  @Roles('owner', 'admin', 'accountant')
  async requestCae(
    @CurrentUser() user: RequestUser,
    @Body() body: {
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
    },
  ) {
    const result = await this.afipService.requestCae(user.tenantId, body);
    return { success: true, data: result };
  }

  @Get('last-number/:pointOfSale/:invoiceType')
  @Roles('owner', 'admin', 'accountant')
  async getLastNumber(
    @CurrentUser() user: RequestUser,
    @Param('pointOfSale') pointOfSale: string,
    @Param('invoiceType') invoiceType: string,
  ) {
    const number = await this.afipService.getLastInvoiceNumber(
      user.tenantId,
      parseInt(pointOfSale, 10),
      parseInt(invoiceType, 10),
    );
    return { success: true, data: { lastNumber: number } };
  }

  @Post('credentials')
  @Roles('owner', 'admin')
  async saveCredentials(
    @CurrentUser() user: RequestUser,
    @Body() body: { cuit: string; certPem: string; keyPem: string; env?: 'homologacion' | 'produccion' },
  ) {
    const result = await this.afipService.saveCredentials(user.tenantId, body);
    return { success: true, data: result };
  }

  @Post('test-auth')
  @Roles('owner', 'admin')
  async testAuth(@CurrentUser() user: RequestUser) {
    const result = await this.afipService.testAuth(user.tenantId);
    return { success: true, data: result };
  }
}
