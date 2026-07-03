import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { StockService } from './stock.service';
import { CurrentUser, RequestUser, Roles } from '../../common/decorators';

@ApiTags('Stock')
@ApiBearerAuth()
@Controller('stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get('product/:productId')
  async getByProduct(@CurrentUser() user: RequestUser, @Param('productId') productId: string) {
    return this.stockService.getStockByProduct(user.tenantId, productId);
  }

  @Get('warehouse/:warehouseId')
  async getByWarehouse(
    @CurrentUser() user: RequestUser,
    @Param('warehouseId') warehouseId: string,
    @Query('search') search?: string,
    @Query('lowStockOnly') lowStockOnly?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.stockService.getStockByWarehouse(user.tenantId, warehouseId, {
      search,
      lowStockOnly: lowStockOnly === 'true',
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('alerts')
  async getLowStockAlerts(@CurrentUser() user: RequestUser) {
    return this.stockService.getLowStockAlerts(user.tenantId);
  }

  @Get('movements')
  async getMovements(
    @CurrentUser() user: RequestUser,
    @Query('productId') productId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.stockService.getMovements(user.tenantId, {
      productId,
      warehouseId,
      dateFrom,
      dateTo,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('movements')
  @Roles('owner', 'admin', 'warehouse')
  async createMovement(@CurrentUser() user: RequestUser, @Body() body: any) {
    return this.stockService.createMovement(user.tenantId, user.userId, body);
  }
}
