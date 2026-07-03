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
    return this.tenantService.getMasterDashboard();
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos los tenants' })
  async findAll(
    @Query('status') status?: string,
    @Query('planId') planId?: string,
    @Query('search') search?: string,
  ) {
    return this.tenantService.findAll({ status, planId, search });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un tenant' })
  async findById(@Param('id') id: string) {
    return this.tenantService.findById(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Cambiar estado de un tenant (bloquear, reactivar, dar de baja)' })
  async updateStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.tenantService.updateStatus(id, body.status);
  }

  @Patch(':id/customization')
  @ApiOperation({ summary: 'Actualizar personalización (logo, colores, membrete)' })
  async updateCustomization(@Param('id') id: string, @Body() body: Record<string, string>) {
    return this.tenantService.updateCustomization(id, body);
  }

  @Patch(':id/features/:feature')
  @ApiOperation({ summary: 'Toggle feature flag de un tenant' })
  async setFeatureFlag(
    @Param('id') id: string,
    @Param('feature') feature: string,
    @Body() body: { enabled: boolean },
  ) {
    return this.tenantService.setFeatureFlag(id, feature, body.enabled);
  }
}
