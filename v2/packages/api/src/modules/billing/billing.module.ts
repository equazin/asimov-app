import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { BillingScheduler } from './billing.scheduler';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [BillingController],
  providers: [BillingService, BillingScheduler],
  exports: [BillingService],
})
export class BillingModule {}
