// POST /api/precios — los precios de IsThereAnyDeal de una lista de títulos (P1 del plan de la ficha y los precios).
//
// Entrada: `{ titulos: string[] }`, hasta 400 (una lista de Deseados más larga se pide por partes, P3), cada uno de
// hasta `MAX_NOMBRE` caracteres. Salida: `{ juegos: Record<titulo, PrecioItad | null> }`, y `incompleto: true` si
// ITAD no contestó y parte salió de lo guardado o vacía.
//
// SOLO CON SESIÓN (P0.2: el interruptor de ITAD solo existe con espacio social), para saber el rango de quien pide:
//  · el rango decide cuánto le vale un precio guardado (`PROFILE_TIER_PRICE_TTL_MS`): si pide antes de tiempo, se le
//    contesta con lo que hay en la caché del borde sin preguntar a ITAD;
//  · su tope de peticiones por hora (`PROFILE_TIER_PRICE_REQUESTS_PER_HOUR`), una red de seguridad por si un cliente
//    se porta mal. Al pasarse, 429 con `Retry-After`, y el cliente se queda con lo que tiene;
//  · y si tiene la tercera pasada, la de las ediciones (`PROFILE_TIER_PRICE_EDITION_SEARCH`, solo mithril).
// Además, un tope global de llamadas a ITAD por minuto. Los dos topes viven en la memoria del aislado: no son globales
// de verdad (Cloudflare reparte entre aislados), así que lo que protege la clave de verdad son la caché y los plazos.
//
// Sin `ITAD_API_KEY`: 501, como `igdb-search`. ITAD caído y nada guardado: 503 (`unavailable`), como el resto de la API.
import { requireUser } from '../_lib/context';
import { fail, json, readJson, unavailable } from '../_lib/http';
import { MAX_NOMBRE } from '../_lib/igdbCover';
import { ItadSinCupo, cacheDelBorde, resolverPrecios, type PresupuestoItad } from '../_lib/itad';
import { apuntarUsoItad, contarLlamadas } from '../_lib/itadUso';
import type { Env } from '../_lib/keys';
import { readProfileFacts } from '../_lib/quota';
import { PROFILE_TIER_PRICE_EDITION_SEARCH, PROFILE_TIER_PRICE_REQUESTS_PER_HOUR, PROFILE_TIER_PRICE_TTL_MS } from '../../src/core/constants/tiers';

interface EnvConItad extends Env {
  ITAD_API_KEY?: string;
}

/** Títulos por petición: el tope de Deseados con el claim `admin` (`WISHLIST_MAX_GAMES_ADMIN`). */
export const MAX_TITULOS = 400;
/** Llamadas a ITAD por minuto en este aislado: por debajo de las 200 de media que da su cupo (1.000 cada 5 min). */
export const ITAD_LLAMADAS_POR_MINUTO = 150;

const HORA_MS = 60 * 60 * 1000;
const MINUTO_MS = 60 * 1000;

/** Peticiones de cada usuario en la hora en curso. Se vacía al pasar de 5.000 usuarios, para no crecer sin fin. */
const porUsuario = new Map<string, { hora: number; peticiones: number }>();
let globalPorMinuto = { minuto: 0, llamadas: 0 };

/** ¿Le quedan peticiones esta hora? Si sí, gasta una. */
export function tomarPeticion(uid: string, tope: number, ahora: number): boolean {
  const hora = Math.floor(ahora / HORA_MS);
  if (porUsuario.size > 5_000) porUsuario.clear();
  const actual = porUsuario.get(uid);
  const cuenta = actual && actual.hora === hora ? actual : { hora, peticiones: 0 };
  if (cuenta.peticiones >= tope) return false;
  porUsuario.set(uid, { hora, peticiones: cuenta.peticiones + 1 });
  return true;
}

/** El presupuesto global de llamadas a ITAD por minuto de este aislado. */
export function presupuestoGlobal(ahora: () => number = Date.now): PresupuestoItad {
  return {
    tomar() {
      const minuto = Math.floor(ahora() / MINUTO_MS);
      if (globalPorMinuto.minuto !== minuto) globalPorMinuto = { minuto, llamadas: 0 };
      if (globalPorMinuto.llamadas >= ITAD_LLAMADAS_POR_MINUTO) return false;
      globalPorMinuto.llamadas += 1;
      return true;
    },
  };
}

/** Solo para los tests: vacía los topes en memoria. */
export function reiniciarTopesParaTests(): void {
  porUsuario.clear();
  globalPorMinuto = { minuto: 0, llamadas: 0 };
}

/** Los títulos de la petición, limpios y sin repetir, o `null` si la forma no vale. */
export function leerTitulos(cuerpo: Record<string, unknown> | null): string[] | null {
  const titulos = cuerpo?.titulos;
  if (!Array.isArray(titulos) || titulos.length === 0 || titulos.length > MAX_TITULOS) return null;
  const limpios: string[] = [];
  for (const titulo of titulos) {
    if (typeof titulo !== 'string') return null;
    const limpio = titulo.trim();
    if (!limpio || limpio.length > MAX_NOMBRE) return null;
    limpios.push(limpio);
  }
  return [...new Set(limpios)];
}

export async function onRequestPost(context: { request: Request; env: EnvConItad }): Promise<Response> {
  const caller = await requireUser(context.request, context.env);
  if (caller instanceof Response) {
    return caller;
  }
  const clave = String(context.env.ITAD_API_KEY || '').trim();
  if (!clave) {
    return fail(501, 'Los precios de IsThereAnyDeal no están configurados en este entorno');
  }
  const titulos = leerTitulos(await readJson(context.request, 100_000));
  if (!titulos) {
    return fail(400, `Hacen falta entre 1 y ${MAX_TITULOS} títulos`);
  }

  // Una lectura de Firestore por petición, como la cuota de compartir. Un fallo de lectura degrada a bronce: el rango
  // solo concede, nunca se promociona por un error.
  const { tier } = await readProfileFacts(caller.user, caller.projectId, caller.appCheckToken);
  const ahora = Date.now();
  if (!tomarPeticion(caller.user.uid, PROFILE_TIER_PRICE_REQUESTS_PER_HOUR[tier], ahora)) {
    const segundos = Math.ceil((HORA_MS - (ahora % HORA_MS)) / 1000);
    return json({ error: 'Demasiadas consultas de precios en poco tiempo. Inténtalo más tarde.' }, 429, { 'Retry-After': String(segundos) });
  }

  const presupuesto = contarLlamadas(presupuestoGlobal());
  const { juegos, preguntoAItad, fallo } = await resolverPrecios(titulos, {
    clave,
    plazoMs: PROFILE_TIER_PRICE_TTL_MS[tier],
    cache: cacheDelBorde(new URL(context.request.url).origin),
    presupuesto,
    ahora,
    conEdiciones: PROFILE_TIER_PRICE_EDITION_SEARCH[tier],
  });
  // Para Capacidad: ITAD no dice cuánto se ha gastado de la clave (`itadUso.ts`).
  await apuntarUsoItad(context.env.SHARES, { llamadas: presupuesto.llamadas, sinCupo: fallo instanceof ItadSinCupo }, ahora);
  const algoResuelto = Object.values(juegos).some(Boolean);
  // `x-cache` es de diagnóstico: con él se comprueba en el dominio real que la caché del borde guarda (P1).
  const diagnostico = { 'x-cache': preguntoAItad ? 'miss' : 'hit' };
  if (fallo && !algoResuelto) {
    if (fallo instanceof ItadSinCupo) {
      return json({ error: 'Los precios no están disponibles ahora mismo.', unavailable: true }, 429, {
        'Retry-After': String(fallo.reintentarEn),
        ...diagnostico,
      });
    }
    return unavailable();
  }
  return json({ juegos, ...(fallo ? { incompleto: true } : {}) }, 200, diagnostico);
}
