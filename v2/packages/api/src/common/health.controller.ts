import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Public } from './decorators';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    const dbOk = await this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    return {
      status: dbOk ? 'ok' : 'degraded',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      db: dbOk ? 'connected' : 'disconnected',
    };
  }
}
