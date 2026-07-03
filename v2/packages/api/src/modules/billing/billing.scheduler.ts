import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BillingService } from './billing.service';

/**
 * Ejecuta el ciclo de morosidad automáticamente una vez al día.
 * Recorre las suscripciones vencidas y actualiza el estado del tenant
 * (grace_period → read_only → blocked) según MOROSIDAD_TIMELINE.
 */
@Injectable()
export class BillingScheduler {
  private readonly logger = new Logger(BillingScheduler.name);

  constructor(private readonly billingService: BillingService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleMorosidadCron(): Promise<void> {
    this.logger.log('Iniciando ciclo de morosidad diario…');
    try {
      const result = await this.billingService.runMorosidadCheck();
      this.logger.log(
        `Ciclo de morosidad: ${result.warned} avisados, ${result.graced} en gracia, ` +
          `${result.readOnly} solo-lectura, ${result.blocked} bloqueados`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Fallo en ciclo de morosidad: ${message}`);
    }
  }
}
