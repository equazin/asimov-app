/**
 * Reserva de bloques de numeración contra la nube (Hi/Lo).
 *
 * `db.nextSequence` consume números de un bloque local; cuando falta o se agota,
 * marca la secuencia en `sequence_refill`. Este módulo, invocado desde el ciclo
 * de sync, pide un rango nuevo al server (`POST /sequences/reserve`) y lo guarda.
 * Así cada PC del tenant obtiene rangos disjuntos y nunca choca de número.
 */
import { net } from 'electron';
import { isCloudConnected, getAccessToken, getApiBaseUrl } from './api-client';
import { getSequenceRefillNames, getSequenceLocalLast, storeSequenceBlock } from './db';

/** Cuántos números se reservan por bloque. Más grande = menos llamadas, más huecos posibles. */
const SEQUENCE_BLOCK_SIZE = 50;

/**
 * Reserva bloques para todas las secuencias marcadas. No lanza: cualquier fallo
 * se reintenta en el próximo ciclo (la marca de refill queda hasta reservar bien).
 * Devuelve cuántos bloques se reservaron.
 */
export async function ensureSequenceBlocks(): Promise<number> {
  if (!isCloudConnected()) return 0;

  const names = getSequenceRefillNames();
  if (names.length === 0) return 0;

  const token = getAccessToken();
  if (!token) return 0;
  const baseUrl = getApiBaseUrl();

  let reserved = 0;
  for (const name of names) {
    try {
      // `min` = high-water local: el server arranca el bloque por encima de los
      // números ya usados localmente en esta PC (primer emparejamiento seguro).
      const min = getSequenceLocalLast(name);
      const response = await net.fetch(`${baseUrl}/sequences/reserve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, count: SEQUENCE_BLOCK_SIZE, min }),
      });
      if (!response.ok) continue;

      const json = (await response.json()) as {
        success: boolean;
        data?: { start: number; end: number };
      };
      if (json.success && json.data && json.data.end >= json.data.start) {
        storeSequenceBlock(name, json.data.start, json.data.end);
        reserved++;
      }
    } catch {
      // Se reintenta en el próximo ciclo de sync.
    }
  }
  return reserved;
}
