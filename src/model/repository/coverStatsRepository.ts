/**
 * EL GASTO DE CARÁTULAS DEL DÍA, para la pantalla de administración.
 *
 * MÓDULO APARTE Y NO JUNTO A `coverQuotaRepository`, que es lo que parecía natural: ese lo importa el recorrido
 * de fondo, o sea el arranque de TODO el mundo, mientras que esto solo lo mira el panel, que es un chunk
 * perezoso y de una sola persona. Compartiendo fichero, la lectura del contador viajaba en el arranque de
 * quien nunca va a abrir ese panel — y el presupuesto del service worker está a menos de un kilobyte de su
 * tope (`scripts/ci-validate.js`), así que ahí no caben pasajeros.
 */

import { shareAuthHeaders } from './shareRepository';

/** Lo que el servicio lleva resuelto hoy, tal y como lo cuenta el servidor (ver `functions/api/cover-stats.ts`). */
export interface GastoDeCaratulas {
  /** Día UTC al que corresponde la cuenta, en `AAAA-MM-DD`. */
  dia: string;
  gastado: number;
  techo: number;
  quedan: number;
}

/**
 * El gasto de carátulas del día, para la pantalla de administración.
 *
 * Silencioso como el de arriba, y por el mismo motivo: es un dato de más en un panel que sigue siendo útil sin
 * él. Enseñar un cero cuando no se ha podido leer sería afirmar que hoy no se ha resuelto nada, así que ante
 * cualquier fallo se devuelve `null` y la fila no se pinta — el mismo criterio que el censo de enlaces.
 */
export async function leerGastoDeCaratulas(): Promise<GastoDeCaratulas | null> {
  try {
    const headers = await shareAuthHeaders(() => new Error('sin sesión'));
    const respuesta = await fetch('/api/cover-stats', { headers });
    if (!respuesta.ok) return null;
    const datos = (await respuesta.json()) as Partial<GastoDeCaratulas>;
    if (typeof datos.gastado !== 'number' || typeof datos.techo !== 'number') return null;
    return {
      dia: String(datos.dia ?? ''),
      gastado: datos.gastado,
      techo: datos.techo,
      quedan: typeof datos.quedan === 'number' ? datos.quedan : Math.max(0, datos.techo - datos.gastado),
    };
  } catch {
    return null;
  }
}
