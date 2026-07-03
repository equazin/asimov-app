import { Controller, Get, Patch, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { Roles } from '../../common/decorators';

@ApiTags('Tenants (Master)')
@ApiBearerAuth()
@Roles('superadmin')
@Controller('master/tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard del panel maestro' })
  async dashboard() {
    const data = await this.tenantService.getMasterDashboard();
    return { success: true, data };
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos los tenants' })
  async findAll(
    @Query('status') status?: string,
    @Query('planId') planId?: string,
    @Query('search') search?: string,
  ) {
    const data = await this.tenantService.findAll({ status, planId, search });
    return { success: true, data };
  }

  @Get('audit')
  @ApiOperation({ summary: 'Logs de auditoría de toda la plataforma' })
  async audit(@Query('action') action?: string) {
    const data = await this.tenantService.getAuditLogs({ action });
    return { success: true, data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un tenant' })
  async findById(@Param('id') id: string) {
    const data = await this.tenantService.findById(id);
    return { success: true, data };
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Cambiar estado de un tenant (bloquear, reactivar, dar de baja)' })
  async updateStatus(@Param('id') id: string, @Body() body: { status: string }) {
    const data = await this.tenantService.updateStatus(id, body.status);
    return { success: true, data };
  }

  @Patch(':id/customization')
  @ApiOperation({ summary: 'Actualizar personalización (logo, colores, membrete)' })
  async updateCustomization(@Param('id') id: string, @Body() body: Record<string, string>) {
    const data = await this.tenantService.updateCustomization(id, body);
    return { success: true, data };
  }

  @Patch(':id/features/:feature')
  @ApiOperation({ summary: 'Toggle feature flag de un tenant' })
  async setFeatureFlag(
    @Param('id') id: string,
    @Param('feature') feature: string,
    @Body() body: { enabled: boolean },
  ) {
    const data = await this.tenantService.setFeatureFlag(id, feature, body.enabled);
    return { success: true, data };
  }
}
