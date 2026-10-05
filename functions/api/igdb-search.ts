// GET /api/igdb-search?q=<texto> — busca en IGDB los juegos con carátula que se llaman así. Solo el administrador.
//
// Lo usa el panel de premios para que el administrador ELIJA la carátula de un nominado de las categorías de
// juegos cuando la automática no es la buena: un nominado es solo un nombre, y entre dos fichas que se llaman
// igual —el *Ocarina of Time* de N64 y su remake de Switch 2— el emparejamiento se queda con la más votada (ver
// `buscarCandidatos` en `_lib/igdbCover.ts`). Es el gemelo de `tmdb-search` para los juegos.
//
// SOLO EL ADMINISTRADOR, por lo mismo que `tmdb-search`: cada búsqueda son dos consultas a IGDB con las credenciales
// de la aplicación, y abierta a cualquiera sería un proxy gratis a su API. No escribe nada en KV salvo, si hace
// falta, el token de Twitch. Quien vota no busca: ve la carátula elegida, que sirve `/cover?i=` sin consultar nada.
import { requireAdmin } from '../_lib/context';
import { fail, json } from '../_lib/http';
import { buscarCandidatos, leerCaratulaCacheada, MAX_NOMBRE, type EntornoIgdb } from '../_lib/igdbCover';
import type { Env } from '../_lib/keys';

interface EnvConIgdb extends Env, EntornoIgdb {}

export async function onRequestGet(context: { request: Request; env: EnvConIgdb }): Promise<Response> {
  const caller = await requireAdmin(context.request, context.env);
  if (caller instanceof Response) {
    return caller;
  }

  if (!context.env.IGDB_CLIENT_ID || !context.env.IGDB_CLIENT_SECRET) {
    // Configuración incompleta es fallo nuestro, y 501 lo distingue de una avería (igual que en `/cover`).
    return fail(501, 'La búsqueda de IGDB no está configurada en este entorno');
  }

  const consulta = (new URL(context.request.url).searchParams.get('q') ?? '').trim();
  if (!consulta || consulta.length > MAX_NOMBRE) {
    return fail(400, 'Falta qué buscar');
  }

  const [candidatos, automatica] = await Promise.all([
    buscarCandidatos(context.env, consulta),
    // La que la votación enseñaría SIN elegir nada: la de ese nombre a secas, sin plataformas, que es como la
    // resuelve el panel (ver `resolverCaratulasDeNominados`). El panel la marca entre los candidatos, y así se ve
    // de un vistazo si hay que cambiarla. Una lectura de KV; nada se resuelve.
    leerCaratulaCacheada(context.env, consulta, []).catch(() => undefined),
  ]);
  if (candidatos === null) {
    // No se ha podido preguntar: no es «no hay resultados», y el panel lo dice distinto.
    return fail(503, 'No se ha podido consultar IGDB; inténtalo más tarde');
  }
  return json({ results: candidatos, automatic: automatica ?? null });
}
