import { Module } from '@nestjs/common';
import { CustomizationService } from './customization.service';
import { CustomizationController } from './customization.controller';

@Module({
  controllers: [CustomizationController],
  providers: [CustomizationService],
  exports: [CustomizationService],
})
export class CustomizationModule {}
