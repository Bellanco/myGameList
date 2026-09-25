import { coverUrl } from '../../../core/utils/coverUrl';
import { pedirCupoDeCaratulasLibre } from '../coverQuotaRepository';

/** Qué ha pasado con cada nominado al resolverlo. */
export interface ResumenCaratulas {
  /** Resueltos con carátula: los votantes la verán. */
  conCaratula: number;
  /** IGDB no tiene carátula para ese título: saldrá la portada de casa con el nombre. */
  sinCaratula: number;
  /** No se ha podido preguntar (cupo, red, servidor): hay que volver a guardar para reintentarlo. */
  fallidas: number;
}

/** Espera entre títulos: la misma que el llenado inicial (`useCoverBackfill`), por debajo de 4/s contra IGDB. */
const PAUSA_MS = 160;

/**
 * LAS CARÁTULAS DE LOS NOMINADOS SE RESUELVEN AQUÍ, desde el panel, y no mientras la gente vota.
 *
 * La pantalla de votar las pide con `c=1` —solo lo ya resuelto, ver `NomineeCard`—, así que durante la votación
 * no se consulta IGDB ni se escribe en KV por mucha gente que entre. El gasto se paga una vez, aquí: una
 * resolución por título, que es lo que cuesta de verdad y no depende de cuántos voten.
 *
 * Con `m=1`, el modo «solo resolver»: deja el emparejamiento en el servidor y no descarga la imagen. Y sin
 * plataformas ni modo ampliado, que es exactamente como la piden los votantes: otra clave sería resolver un
 * emparejamiento que nadie va a leer.
 *
 * NUNCA LANZA. Lo llama quien acaba de abrir la edición o guardar una categoría, y eso ya está hecho: un fallo
 * aquí se cuenta en el resumen para que el administrador sepa que tiene que reintentarlo, no deshace nada.
 */
export async function resolverCaratulasDeNominados(nombres: readonly string[]): Promise<ResumenCaratulas> {
  const resumen: ResumenCaratulas = { conCaratula: 0, sinCaratula: 0, fallidas: 0 };
  const unicos = [...new Set(nombres.map((nombre) => String(nombre || '').trim()).filter(Boolean))];
  if (!unicos.length) return resumen;

  // El panel es de la cuenta de administración, que es mithril: con el cupo levantado, una edición grande no
  // topa con el tope por IP. Si no se concede, se sigue con el normal, que a unas decenas de títulos les sobra.
  await pedirCupoDeCaratulasLibre();

  for (const [i, nombre] of unicos.entries()) {
    if (i > 0) await new Promise((resolver) => setTimeout(resolver, PAUSA_MS));
    try {
      const respuesta = await fetch(`${coverUrl(nombre)}&m=1`);
      if (respuesta.status === 404) resumen.sinCaratula += 1;
      else if (respuesta.ok) resumen.conCaratula += 1;
      else resumen.fallidas += 1;
    } catch {
      resumen.fallidas += 1;
    }
  }
  return resumen;
}
