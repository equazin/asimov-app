import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SuppliersService } from './suppliers.service';
import { CurrentUser, RequestUser, Roles } from '../../common/decorators';

@ApiTags('Proveedores')
@ApiBearerAuth()
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  async findAll(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('active') active?: string,
  ) {
    return this.suppliersService.findAll(user.tenantId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
      active: active !== undefined ? active === 'true' : undefined,
    });
  }

  @Get(':id')
  async findById(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.suppliersService.findById(user.tenantId, id);
  }

  @Post()
  @Roles('owner', 'admin')
  async create(@CurrentUser() user: RequestUser, @Body() body: Record<string, unknown>) {
    return this.suppliersService.create(user.tenantId, body);
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  async update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.suppliersService.update(user.tenantId, id, body);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  async delete(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.suppliersService.softDelete(user.tenantId, id);
  }
}
