import { Controller, Get, Patch, Post, Body, Param, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { CustomizationService } from './customization.service';
import { CurrentUser, RequestUser, Roles } from '../../common/decorators';

@ApiTags('Customization')
@ApiBearerAuth()
@Controller('customization')
export class CustomizationController {
  constructor(private readonly customizationService: CustomizationService) {}

  @Get('branding')
  async getBranding(@CurrentUser() user: RequestUser) {
    const data = await this.customizationService.getTenantBranding(user.tenantId);
    return { success: true, data };
  }

  @Patch('branding')
  @Roles('owner', 'admin')
  async updateBranding(
    @CurrentUser() user: RequestUser,
    @Body() body: {
      logo?: string;
      primaryColor?: string;
      printHeader?: string;
      printFooter?: string;
    },
  ) {
    const data = await this.customizationService.updateBranding(user.tenantId, body);
    return { success: true, data };
  }

  @Get('templates')
  async getTemplates(@CurrentUser() user: RequestUser) {
    const data = await this.customizationService.getPrintTemplates(user.tenantId);
    return { success: true, data };
  }

  @Get('templates/:id')
  async getTemplate(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const data = await this.customizationService.getPrintTemplate(user.tenantId, id);
    return { success: true, data };
  }

  @Patch('templates/:id')
  @Roles('owner', 'admin')
  async updateTemplate(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() body: { name?: string; htmlTemplate?: string; isDefault?: boolean },
  ) {
    const data = await this.customizationService.updatePrintTemplate(user.tenantId, id, body);
    return { success: true, data };
  }

  @Post('templates')
  @Roles('owner', 'admin')
  async createTemplate(
    @CurrentUser() user: RequestUser,
    @Body() body: { documentType: string; name: string; htmlTemplate: string; isDefault?: boolean },
  ) {
    const data = await this.customizationService.createPrintTemplate(user.tenantId, body);
    return { success: true, data };
  }

  @Get('render/:documentId')
  async renderDocument(
    @CurrentUser() user: RequestUser,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    const html = await this.customizationService.renderDocument(user.tenantId, documentId);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }
}
