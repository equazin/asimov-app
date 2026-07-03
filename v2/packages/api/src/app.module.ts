import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { ClientsModule } from './modules/clients/clients.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { ProductsModule } from './modules/products/products.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { StockModule } from './modules/stock/stock.module';
import { SyncModule } from './modules/sync/sync.module';
import { AfipModule } from './modules/afip/afip.module';
import { ReportsModule } from './modules/reports/reports.module';
import { CustomizationModule } from './modules/customization/customization.module';
import { HealthController } from './common/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    TenantModule,
    ClientsModule,
    SuppliersModule,
    ProductsModule,
    DocumentsModule,
    StockModule,
    SyncModule,
    AfipModule,
    ReportsModule,
    CustomizationModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
