import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

export interface ReservedRange {
  name: string;
  start: number;
  end: number;
}

@Injectable()
export class SequencesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reserva un bloque de números correlativos para `name` dentro del tenant y
   * devuelve el rango `[start, end]` (ambos inclusive). La operación es atómica:
   * dos PCs que reserven a la vez obtienen rangos disjuntos, evitando que tomen
   * el mismo número de comprobante.
   *
   * `min` permite sembrar la secuencia por encima de números ya usados localmente
   * (primer emparejamiento de una PC con datos preexistentes): el bloque nunca
   * empieza por debajo de `min`.
   */
  async reserve(
    tenantId: string,
    name: string,
    count: number,
    min: number,
  ): Promise<ReservedRange> {
    const safeCount = Math.max(1, Math.min(Math.floor(count) || 1, 1000));
    const safeMin = Math.max(0, Math.floor(min) || 0);
    const prefix = name.toUpperCase().slice(0, 2);

    // Hi/Lo atómico en Postgres: inserta o incrementa tomando el mayor entre el
    // valor actual y `min`. `RETURNING last` da el fin del rango reservado.
    const rows = await this.prisma.$queryRaw<Array<{ last: number }>>`
      INSERT INTO sequences (id, "tenantId", name, prefix, last)
      VALUES (gen_random_uuid(), ${tenantId}, ${name}, ${prefix}, GREATEST(${safeMin}, 0) + ${safeCount})
      ON CONFLICT ("tenantId", name)
      DO UPDATE SET last = GREATEST(sequences.last, ${safeMin}) + ${safeCount}
      RETURNING last
    `;

    const end = Number(rows[0]?.last ?? safeCount);
    const start = end - safeCount + 1;
    return { name, start, end };
  }
}
