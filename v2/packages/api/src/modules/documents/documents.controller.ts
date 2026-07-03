import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import { CurrentUser, RequestUser, Roles } from '../../common/decorators';

@ApiTags('Documentos')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar documentos (facturas, remitos, pedidos, etc.)' })
  async findAll(
    @CurrentUser() user: RequestUser,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('clientId') clientId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.documentsService.findAll(user.tenantId, {
      type,
      status,
      clientId,
      supplierId,
      dateFrom,
      dateTo,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
      sortBy,
      sortOrder,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un documento' })
  async findById(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.documentsService.findById(user.tenantId, id);
  }

  @Post()
  @Roles('owner', 'admin', 'seller', 'warehouse', 'accountant')
  @ApiOperation({ summary: 'Crear documento' })
  async create(@CurrentUser() user: RequestUser, @Body() body: any) {
    return this.documentsService.create(user.tenantId, user.userId, user.origin, body);
  }

  @Patch(':id/status')
  @Roles('owner', 'admin', 'seller', 'accountant')
  @ApiOperation({ summary: 'Cambiar estado de documento (confirmar, anular)' })
  async updateStatus(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    return this.documentsService.updateStatus(user.tenantId, id, body.status, user.userId);
  }
}
