import { Controller, Get, Query, Res, Header } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { CurrentUser, RequestUser, Roles } from '../../common/decorators';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('sales')
  @Roles('owner', 'admin', 'accountant')
  async salesReport(
    @CurrentUser() user: RequestUser,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
  ) {
    const data = await this.reportsService.salesReport(user.tenantId, {
      dateFrom: dateFrom ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      dateTo: dateTo ?? new Date().toISOString(),
    });
    return { success: true, data };
  }

  @Get('stock')
  @Roles('owner', 'admin', 'warehouse')
  async stockReport(@CurrentUser() user: RequestUser) {
    const data = await this.reportsService.stockReport(user.tenantId);
    return { success: true, data };
  }

  @Get('accounts')
  @Roles('owner', 'admin', 'accountant')
  async accountReport(@CurrentUser() user: RequestUser) {
    const data = await this.reportsService.accountReport(user.tenantId);
    return { success: true, data };
  }

  @Get('export')
  @Roles('owner', 'admin', 'accountant')
  async exportCsv(
    @CurrentUser() user: RequestUser,
    @Query('entity') entity: string,
    @Query('type') type?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Res() res?: Response,
  ) {
    const csv = await this.reportsService.exportCsv(user.tenantId, entity, {
      type: type ?? '',
      dateFrom: dateFrom ?? '',
      dateTo: dateTo ?? '',
    });

    if (res) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${entity}_export.csv"`);
      res.send(csv);
      return;
    }

    return { success: true, data: csv };
  }
}
