// POST /api/share/year — publica o actualiza el enlace público del RESUMEN DEL AÑO (docs/plan-resumen-del-ano.md).
//
// Orden: sesión → ventana → veto → perfil (nick y rango) → ¿ya hay enlace ese año? Si lo hay, se actualiza sobre
// el mismo token, y solo si ha pasado la espera de su rango (`PROFILE_TIER_YEAR_SHARE_UPDATE_DAYS`). La ventana va
// primero porque fuera de ella no hay nada que comprobar y no se gasta ni una lectura.
//
// El resumen lo calcula el cliente con sus propios datos (los Functions no leen gists): lo que aquí se garantiza
// es que solo publica lo que deja el esquema —sin cita, sin día, sin «contigo»—, firmado con el nick del perfil.
import { requireUser } from '../../_lib/context';
import { fail, json, readJson } from '../../_lib/http';
import { shareKey, type Env } from '../../_lib/keys';
import { readShareStatus } from '../../_lib/quota';
import { InvalidShareError, publishYearShare } from '../../_lib/shares';
import { PROFILE_TIER_YEAR_SHARE_UPDATE_DAYS } from '../../../src/core/constants/tiers';
import { nextYearShareUpdateAt, yearShareWindow } from '../../../src/core/social/yearShareWindow';

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const caller = await requireUser(context.request, context.env);
  if (caller instanceof Response) {
    return caller;
  }

  const body = await readJson(context.request);
  if (!body || !body.summary || typeof body.summary !== 'object') {
    return fail(400, 'Cuerpo no válido');
  }
  const now = Date.now();
  const window = yearShareWindow(now);
  if (!window || Number(body.year) !== window.year) {
    return fail(409, 'El resumen del año solo se comparte del 15 de diciembre al 15 de enero', { closed: true });
  }

  const status = await readShareStatus(context.env, caller.user, caller.projectId, caller.appCheckToken);
  if (status.ban) {
    return fail(403, 'No puedes compartir', { banned: true, reason: status.ban.reason || '' });
  }
  if (!status.nick) {
    return fail(409, 'Necesitas tener tu espacio social creado para compartir', { needsProfile: true });
  }

  const waitDays = PROFILE_TIER_YEAR_SHARE_UPDATE_DAYS[status.tier];
  const row = status.yearShares.find((entry) => entry.meta?.year === window.year) || null;
  let existing: { token: string; createdAt: number; indexed: boolean } | null = null;
  if (row) {
    // El artículo dice cuándo se actualizó por última vez; el índice no, porque actualizar no lo reescribe. Si el
    // artículo ya no está (caducó antes que el índice), se vuelve a escribir entero con el mismo token.
    const article = (await context.env.SHARES.get(shareKey(row.token), 'json')) as { updatedAt?: unknown } | null;
    const updatedAt = Number(article?.updatedAt) || 0;
    const nextUpdateAt = nextYearShareUpdateAt(updatedAt, waitDays);
    if (article && now < nextUpdateAt) {
      return fail(429, 'Todavía no puedes actualizar este enlace', { nextUpdateAt, token: row.token });
    }
    existing = { token: row.token, createdAt: row.meta?.createdAt || now, indexed: Boolean(article) };
  }

  let published;
  try {
    published = await publishYearShare({
      kv: context.env.SHARES,
      uid: caller.user.uid,
      year: window.year,
      summary: body.summary,
      nick: status.nick,
      now,
      expiresAt: window.closesAt,
      existing,
    });
  } catch (error) {
    // Lo que rechaza el esquema es un fallo del cliente y no se escribe nada; lo demás (KV sin cupo) sigue hacia
    // arriba y el middleware lo convierte en «no disponible ahora».
    if (error instanceof InvalidShareError) {
      return fail(400, error.message);
    }
    throw error;
  }

  return json({
    ...published,
    year: window.year,
    url: new URL(`/r/${published.token}`, context.request.url).toString(),
    nextUpdateAt: nextYearShareUpdateAt(published.updatedAt, waitDays),
  });
}
