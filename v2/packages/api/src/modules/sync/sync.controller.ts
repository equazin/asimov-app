import { Controller, Get, Post, Query, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SyncService } from './sync.service';
import { CurrentUser, RequestUser } from '../../common/decorators';

@ApiTags('Sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get('pull')
  async pull(
    @CurrentUser() user: RequestUser,
    @Query('since') since: string,
  ) {
    const data = await this.syncService.pullChanges(
      user.tenantId,
      since ?? '2020-01-01T00:00:00.000Z',
    );
    return { success: true, data };
  }

  @Post('push')
  async push(
    @CurrentUser() user: RequestUser,
    @Body() body: {
      changes: Array<{
        entity: string;
        action: string;
        id: string;
        data: Record<string, unknown>;
      }>;
    },
  ) {
    const result = await this.syncService.pushChanges(
      user.tenantId,
      user.userId,
      body.changes ?? [],
    );
    return { success: true, data: result };
  }
}
