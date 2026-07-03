import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import { CurrentUser, RequestUser, Roles } from '../../common/decorators';

@ApiTags('Clientes')
@ApiBearerAuth()
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar clientes del tenant' })
  async findAll(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('active') active?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.clientsService.findAll(user.tenantId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
      active: active !== undefined ? active === 'true' : undefined,
      sortBy,
      sortOrder,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un cliente' })
  async findById(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.clientsService.findById(user.tenantId, id);
  }

  @Post()
  @Roles('owner', 'admin', 'seller')
  @ApiOperation({ summary: 'Crear cliente' })
  async create(@CurrentUser() user: RequestUser, @Body() body: Record<string, unknown>) {
    return this.clientsService.create(user.tenantId, body as any);
  }

  @Patch(':id')
  @Roles('owner', 'admin', 'seller')
  @ApiOperation({ summary: 'Actualizar cliente' })
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.clientsService.update(user.tenantId, id, body);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Eliminar cliente (soft delete)' })
  async delete(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.clientsService.softDelete(user.tenantId, id);
  }
}
