import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { CurrentUser, RequestUser, Roles, Public } from '../../common/decorators';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('checkout/:subscriptionId')
  @ApiBearerAuth()
  @Roles('owner', 'admin')
  async createCheckout(
    @CurrentUser() user: RequestUser,
    @Param('subscriptionId') subscriptionId: string,
  ) {
    const data = await this.billingService.createPaymentPreference(
      user.tenantId,
      subscriptionId,
    );
    return { success: true, data };
  }

  @Post('webhook/mercadopago')
  @Public()
  async mercadoPagoWebhook(@Body() body: Record<string, unknown>) {
    const result = await this.billingService.handleWebhook('mercadopago', body);
    return { success: true, data: result };
  }

  @Post('webhook/stripe')
  @Public()
  async stripeWebhook(@Body() body: Record<string, unknown>) {
    const result = await this.billingService.handleWebhook('stripe', body);
    return { success: true, data: result };
  }

  @Get('history')
  @ApiBearerAuth()
  async getHistory(@CurrentUser() user: RequestUser) {
    const data = await this.billingService.getPaymentHistory(user.tenantId);
    return { success: true, data };
  }

  @Post('morosidad/check')
  @ApiBearerAuth()
  @Roles('owner')
  async runMorosidadCheck() {
    const data = await this.billingService.runMorosidadCheck();
    return { success: true, data };
  }
}
