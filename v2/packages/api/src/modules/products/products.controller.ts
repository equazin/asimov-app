import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CurrentUser, RequestUser, Roles } from '../../common/decorators';

@ApiTags('Productos')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar productos del tenant' })
  async findAll(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('active') active?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.productsService.findAll(user.tenantId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
      category,
      active: active !== undefined ? active === 'true' : undefined,
      sortBy,
      sortOrder,
    });
  }

  @Get('categories')
  @ApiOperation({ summary: 'Listar categorías con conteo' })
  async getCategories(@CurrentUser() user: RequestUser) {
    return this.productsService.getCategories(user.tenantId);
  }

  @Get('barcode/:barcode')
  @ApiOperation({ summary: 'Buscar producto por código de barras' })
  async findByBarcode(@CurrentUser() user: RequestUser, @Param('barcode') barcode: string) {
    return this.productsService.findByBarcode(user.tenantId, barcode);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un producto' })
  async findById(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.productsService.findById(user.tenantId, id);
  }

  @Post()
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Crear producto' })
  async create(@CurrentUser() user: RequestUser, @Body() body: Record<string, unknown>) {
    return this.productsService.create(user.tenantId, body as any);
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Actualizar producto' })
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.productsService.update(user.tenantId, id, body);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Eliminar producto (soft delete)' })
  async delete(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.productsService.softDelete(user.tenantId, id);
  }
}
