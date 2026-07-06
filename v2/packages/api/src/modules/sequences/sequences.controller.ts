import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SequencesService } from './sequences.service';
import { CurrentUser, RequestUser } from '../../common/decorators';

@ApiTags('Sequences')
@ApiBearerAuth()
@Controller('sequences')
export class SequencesController {
  constructor(private readonly sequencesService: SequencesService) {}

  /**
   * Reserva un bloque de numeración para el tenant. El desktop consume los
   * números del rango localmente (offline-first) y pide otro bloque al agotarlo.
   */
  @Post('reserve')
  async reserve(
    @CurrentUser() user: RequestUser,
    @Body() body: { name?: string; count?: number; min?: number },
  ) {
    const name = String(body?.name ?? '').trim();
    if (!name) {
      return { success: false, error: 'name requerido' };
    }
    const data = await this.sequencesService.reserve(
      user.tenantId,
      name,
      Number(body?.count ?? 20),
      Number(body?.min ?? 0),
    );
    return { success: true, data };
  }
}
