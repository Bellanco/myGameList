// GET /api/share/all — censo de enlaces compartidos. Solo el administrador.
//
// Se recorre el prefijo `user:` y no `share:` porque la clave del índice ya lleva el uid dentro, así que el
// censo sale con autor y sin una sola lectura extra: los datos de cada fila viajan en la metadata.
//
// Paginado por cursor de KV. `?cursor=` continúa; `?uid=` filtra por un autor concreto, que es lo que se usa
// cuando llega un aviso sobre alguien.
import { requireAdmin } from '../../_lib/context';
import { json } from '../../_lib/http';
import { overrideKey, type Env, type ShareIndexMetadata } from '../../_lib/keys';
import type { ShareQuotaOverride } from '../../../src/core/constants/tiers';

const PAGE_SIZE = 200;

/** Prefijo de los ajustes individuales de cuota. Se deriva de `overrideKey` para que no se puedan desincronizar. */
const OVERRIDE_PREFIX = overrideKey('');

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const caller = await requireAdmin(context.request, context.env);
  if (caller instanceof Response) {
    return caller;
  }

  const url = new URL(context.request.url);
  const uid = (url.searchParams.get('uid') || '').trim();
  const cursor = url.searchParams.get('cursor') || undefined;
  const prefix = uid ? `user:${uid}:` : 'user:';

  const page = await context.env.SHARES.list<ShareIndexMetadata>({ prefix, cursor, limit: PAGE_SIZE });

  // Los vetos viajan con el censo (una sola pasada por el prefijo `ban:`) en vez de consultarse usuario a
  // usuario: el panel pinta decenas de fichas y preguntar por cada una serían decenas de peticiones para
  // un dato que cabe en una lista de identificadores.
  const bans = await context.env.SHARES.list({ prefix: 'ban:', limit: 1_000 });

  // Los ajustes individuales de cuota viajan igual que los vetos, y por el mismo motivo: el panel precarga los
  // campos de cuota con lo que el usuario tiene AHORA, y sin esto tendría que preguntar ficha a ficha (o mentir
  // enseñando la cuota del rango a quien tiene un ajuste). Son escrituras manuales del administrador: hay un
  // puñado, no una por usuario.
  //
  // El valor se lee de la `metadata` de la clave, que la escribe el POST de `/api/share/quota/:uid`. Los ajustes
  // guardados antes de que la metadata existiera no la traen, y esos —solo esos— se leen con un `get`.
  const overrideKeys = await context.env.SHARES.list<ShareQuotaOverride>({ prefix: OVERRIDE_PREFIX, limit: 1_000 });
  const overrideEntries = await Promise.all(
    overrideKeys.keys.map(async (key) => {
      const uid = key.name.slice(OVERRIDE_PREFIX.length);
      const meta = key.metadata;
      if (meta && (typeof meta.maxActive === 'number' || typeof meta.ttlDays === 'number')) {
        return [uid, { maxActive: meta.maxActive, ttlDays: meta.ttlDays }] as const;
      }
      const stored = (await context.env.SHARES.get(key.name, 'json')) as ShareQuotaOverride | null;
      return [uid, { maxActive: stored?.maxActive, ttlDays: stored?.ttlDays }] as const;
    }),
  );

  const shares = page.keys.map((key) => {
    // `user:{uid}:{token}` — el uid puede contener cualquier cosa menos ':', así que se parte por el ÚLTIMO.
    const rest = key.name.slice('user:'.length);
    const separator = rest.lastIndexOf(':');
    return {
      uid: separator > 0 ? rest.slice(0, separator) : '',
      token: separator > 0 ? rest.slice(separator + 1) : rest,
      ...(key.metadata || {}),
    };
  });

  return json({
    shares: shares.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    bans: bans.keys.map((key) => key.name.slice('ban:'.length)),
    overrides: Object.fromEntries(overrideEntries),
    cursor: page.list_complete ? null : page.cursor,
    complete: page.list_complete,
  });
}
