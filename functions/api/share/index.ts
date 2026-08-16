// POST /api/share — publica (o renueva) el enlace público de una reseña.
//
// Orden de comprobaciones, y no es intercambiable: sesión → veto → cuota diaria → cuota de enlaces activos. El
// veto va antes que la cuota porque a quien está vetado no se le dice "te quedan 3 enlaces".
//
// La CADUCIDAD la pone el servidor a partir del rango del usuario y su ajuste individual. Si viniera del cliente,
// la cuota dejaría de ser una barrera y sería una sugerencia.
import { requireUser } from '../../_lib/context';
import { fail, json, readJson } from '../../_lib/http';
import type { Env } from '../../_lib/keys';
import { bumpDailyCount, readDailyCount, readShareStatus, shareDailyLimit } from '../../_lib/quota';
import { draftFromBody, publishShare } from '../../_lib/shares';

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const caller = await requireUser(context.request, context.env);
  if (caller instanceof Response) {
    return caller;
  }

  const body = await readJson(context.request);
  if (!body) {
    return fail(400, 'Cuerpo no válido');
  }
  const draft = draftFromBody(body);
  if (!draft) {
    return fail(400, 'Faltan el juego o el texto de la reseña');
  }

  const now = Date.now();
  const status = await readShareStatus(context.env, caller.user, caller.projectId, caller.appCheckToken);

  if (status.ban) {
    return fail(403, 'No puedes compartir reseñas', { banned: true, reason: status.ban.reason || '' });
  }

  // Sin nick no se publica. El nick sale del perfil social, que es también de donde sale el rango: si no está,
  // el artículo saldría firmado por nadie y con la cuota mínima, y es mejor decirlo que publicar algo a medias.
  if (!status.nick) {
    return fail(409, 'Necesitas tener tu espacio social creado para compartir', { needsProfile: true });
  }

  // ¿Ya tenía compartida ESTA reseña? Entonces se renueva sobre el mismo token: ni gasta cuota ni deja muerto el
  // enlace que ya circula por ahí.
  const existing = status.active.find((row) => row.meta?.gameId === draft.gameId) || null;

  if (!existing) {
    // El techo del día es el mismo número que sus enlaces activos (ver `shareDailyLimit`): frena el ciclo de
    // crear y retirar sin castigar a quien simplemente comparte lo que le toca.
    const dailyLimit = shareDailyLimit(status.quota);
    const daily = await readDailyCount(context.env.SHARES, caller.user.uid, now);
    if (daily >= dailyLimit) {
      return fail(429, 'Has compartido demasiadas reseñas hoy. Inténtalo mañana.', { dailyLimit });
    }
    if (status.active.length >= status.quota.maxActive) {
      // El mensaje dice QUÉ HACER, no solo que no. `oldestExpiresAt` deja al cliente calcular "dentro de 2 días".
      const oldestExpiresAt = status.active
        .map((row) => row.meta?.expiresAt || 0)
        .filter((value) => value > 0)
        .sort((a, b) => a - b)[0] || 0;
      return fail(429, 'Has alcanzado tu número de enlaces activos', {
        quota: status.quota,
        active: status.active.length,
        oldestExpiresAt,
      });
    }
  }

  let published;
  try {
    published = await publishShare({
      kv: context.env.SHARES,
      uid: caller.user.uid,
      draft,
      nick: status.nick,
      quota: status.quota,
      now,
      existingToken: existing?.token || null,
    });
  } catch (error) {
    // Aquí acaba lo que rechaza el esquema: un campo privado o de identidad colado en el cuerpo. Es un fallo del
    // cliente, no del usuario, y no se escribe nada.
    return fail(400, error instanceof Error ? error.message : 'Reseña no publicable');
  }

  if (!published.renewed) {
    await bumpDailyCount(context.env.SHARES, caller.user.uid, now);
  }

  return json({
    token: published.token,
    url: new URL(`/r/${published.token}`, context.request.url).toString(),
    expiresAt: published.expiresAt,
    renewed: published.renewed,
    quota: status.quota,
    active: published.renewed ? status.active.length : status.active.length + 1,
  });
}
