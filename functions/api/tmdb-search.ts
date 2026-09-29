// GET /api/tmdb-search?q=<texto>&k=person|screen — busca en TMDB actores, series o películas. Solo el administrador.
//
// Lo usa el panel de premios para que el administrador ELIJA la imagen de cada nominado de las categorías que no
// son de juegos (ver `src/core/premios/nomineeKind`): se enseñan los candidatos y se pulsa el bueno. No hay
// emparejamiento automático a propósito, por los homónimos (ver `_lib/tmdb.ts`).
//
// SOLO EL ADMINISTRADOR, y por dinero más que por secreto: cada búsqueda gasta de la clave de TMDB de la
// aplicación, y abierta a cualquiera sería un proxy gratis a su API. Quien vota no busca nada: ve la imagen ya
// elegida, que sirve `/poster` sin token.
//
// EL TOKEN NO SALE DE AQUÍ. Es un secreto de Pages (`TMDB_READ_TOKEN`), viaja solo en la cabecera de la consulta
// a TMDB y la respuesta al panel lleva únicamente los candidatos.
import { requireAdmin } from '../_lib/context';
import { fail, json } from '../_lib/http';
import type { Env } from '../_lib/keys';
import { buscarEnTmdb, MAX_BUSQUEDA_TMDB, type TipoBusquedaTmdb } from '../_lib/tmdb';

interface EnvConTmdb extends Env {
  TMDB_READ_TOKEN?: string;
}

export async function onRequestGet(context: { request: Request; env: EnvConTmdb }): Promise<Response> {
  const caller = await requireAdmin(context.request, context.env);
  if (caller instanceof Response) {
    return caller;
  }

  if (!context.env.TMDB_READ_TOKEN) {
    // Configuración incompleta es fallo nuestro, y 501 lo distingue de una avería (igual que en `/cover`).
    return fail(501, 'La búsqueda de TMDB no está configurada en este entorno');
  }

  const url = new URL(context.request.url);
  const consulta = (url.searchParams.get('q') ?? '').trim();
  const tipo: TipoBusquedaTmdb = url.searchParams.get('k') === 'person' ? 'person' : 'screen';
  if (!consulta || consulta.length > MAX_BUSQUEDA_TMDB) {
    return fail(400, 'Falta qué buscar');
  }

  const candidatos = await buscarEnTmdb(context.env.TMDB_READ_TOKEN, consulta, tipo);
  if (candidatos === null) {
    // No se ha podido preguntar: no es «no hay resultados», y el panel lo dice distinto.
    return fail(503, 'No se ha podido consultar TMDB; inténtalo más tarde');
  }
  return json({ results: candidatos });
}
