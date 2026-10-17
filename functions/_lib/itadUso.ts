// EL CONSUMO DE ISTHEREANYDEAL, para la pantalla de Capacidad del panel (`/api/admin/health`). ITAD no tiene ninguna
// API que diga cuánto se ha gastado de la clave, así que se cuenta aquí, en `/api/precios`.
//
// Dos contadores del día (UTC, como el de carátulas, y con 48 h de vida para que el de ayer siga ahí) en `SHARES`:
//  · LLAMADAS: cada llamada que sale de verdad hacia ITAD (cada intento que gasta del presupuesto por minuto; las que
//    contesta la caché del borde no cuentan). Por lotes al azar, como las carátulas (`LOTE_GLOBAL` en `/cover`): cada
//    llamada tiene 1/`ITAD_LOTE_LLAMADAS` de apuntar el lote entero, y una petición escribe una vez como mucho. Lo que
//    sale es un promedio de grano grueso, no una cuenta exacta.
//  · SIN CUPO: las peticiones que se quedaron sin precios nuevos porque ITAD contestó 429 o porque saltó nuestro tope
//    por minuto. Son raras y se cuentan una a una; pero en una ráfaga se comerían las escrituras, así que cada aislado
//    las junta en memoria y escribe como mucho una vez por minuto.
//
// Las escrituras salen de las 1.000 diarias de KV de TODA la cuenta: con lotes de 10, una por cada diez llamadas.
// Nunca hacen fallar la petición: sin cupo de KV o con KV caído, el contador se pierde y los precios se sirven igual.
import type { KVNamespace } from './keys';
import type { PresupuestoItad } from './itad';

/** Tamaño del lote de llamadas: una escritura de KV, de media, por cada tantas llamadas a ITAD. */
export const ITAD_LOTE_LLAMADAS = 10;
/** Lo más a menudo que un aislado apunta las peticiones sin cupo. */
export const ITAD_SIN_CUPO_CADA_MS = 60_000;
const VIDA_S = 48 * 3600;

const diaUtc = (ahora: number) => new Date(ahora).toISOString().slice(0, 10);

/** Llamadas a ITAD del día. */
export function itadLlamadasKey(ahora: number): string {
  return `itad:llamadas-dia:v1:${diaUtc(ahora)}`;
}

/** Peticiones que se quedaron sin cupo de ITAD en el día. */
export function itadSinCupoKey(ahora: number): string {
  return `itad:sin-cupo-dia:v1:${diaUtc(ahora)}`;
}

/** El presupuesto de siempre, contando cuántas llamadas deja salir. */
export function contarLlamadas(presupuesto: PresupuestoItad): PresupuestoItad & { readonly llamadas: number } {
  let llamadas = 0;
  return {
    tomar() {
      const puede = presupuesto.tomar();
      if (puede) llamadas += 1;
      return puede;
    },
    get llamadas() {
      return llamadas;
    },
  };
}

/** Cuántos lotes apunta una petición que hizo `llamadas` llamadas: cada una tira su dado. */
export function lotesAlAzar(llamadas: number, azar: () => number = Math.random): number {
  let lotes = 0;
  for (let i = 0; i < llamadas; i += 1) {
    if (azar() < 1 / ITAD_LOTE_LLAMADAS) lotes += 1;
  }
  return lotes;
}

async function sumarSiSePuede(kv: KVNamespace, clave: string, cuanto: number): Promise<void> {
  try {
    const actual = Number(await kv.get(clave)) || 0;
    await kv.put(clave, String(actual + cuanto), { expirationTtl: VIDA_S });
  } catch {
    // Sin cupo de KV o KV caído: el contador es orientativo y la petición no puede fallar por él.
  }
}

let sinCupo = { pendientes: 0, ultimo: 0 };

/** Apunta lo que gastó una petición a `/api/precios`. No lanza nunca. */
export async function apuntarUsoItad(
  kv: KVNamespace | undefined,
  uso: { llamadas: number; sinCupo: boolean },
  ahora: number,
  azar: () => number = Math.random,
): Promise<void> {
  if (!kv) return;
  const escrituras: Promise<void>[] = [];
  const lotes = lotesAlAzar(uso.llamadas, azar);
  if (lotes > 0) escrituras.push(sumarSiSePuede(kv, itadLlamadasKey(ahora), lotes * ITAD_LOTE_LLAMADAS));
  if (uso.sinCupo) sinCupo.pendientes += 1;
  // Lo pendiente se apunta también desde una petición que sí tuvo cupo: así la ráfaga no se queda en memoria.
  if (sinCupo.pendientes > 0 && ahora - sinCupo.ultimo >= ITAD_SIN_CUPO_CADA_MS) {
    escrituras.push(sumarSiSePuede(kv, itadSinCupoKey(ahora), sinCupo.pendientes));
    sinCupo = { pendientes: 0, ultimo: ahora };
  }
  await Promise.all(escrituras);
}

/** Solo para los tests: vacía lo que el aislado tiene pendiente de apuntar. */
export function reiniciarUsoItadParaTests(): void {
  sinCupo = { pendientes: 0, ultimo: 0 };
}
