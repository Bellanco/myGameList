// POST   /api/share/quota/:uid — ajuste individual de cuota (enlaces activos y/o días).
// DELETE /api/share/quota/:uid — vuelve a la cuota del rango.
//
// Solo el administrador. Existe porque el rango es un instrumento romo: moverlo para tocar lo que alguien
// comparte le cambiaría también la frescura de su feed (`PROFILE_TIER_FEED_TTL_MS`), que es otro asunto. Y entre
// "normal" y "vetado" no había ningún escalón intermedio.
//
// Los dos campos son opcionales e independientes: se puede recortar el número de enlaces sin tocar su duración.
// Los valores son ABSOLUTOS y mandan sobre el rango mientras existan; el recorte al techo lo hace
// `resolveShareQuota`, que es la única que resuelve cuota en todo el sistema.
import { requireAdmin } from '../../../_lib/context';
import { fail, json, readJson } from '../../../_lib/http';
import { overrideKey, type Env } from '../../../_lib/keys';

const REASON_MAX = 500;

/** Un campo del ajuste: número positivo, o ausente. Cualquier otra cosa se descarta (cae al valor del rango). */
function optionalCount(value: unknown): number | undefined {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export async function onRequestPost(context: { request: Request; env: Env; params: { uid: string } }): Promise<Response> {
  const caller = await requireAdmin(context.request, context.env);
  if (caller instanceof Response) {
    return caller;
  }
  const uid = String(context.params.uid || '').trim();
  if (!uid) {
    return fail(400, 'Falta el usuario');
  }

  const body = (await readJson(context.request)) || {};
  const maxActive = optionalCount(body.maxActive);
  const ttlDays = optionalCount(body.ttlDays);
  if (maxActive === undefined && ttlDays === undefined) {
    // Un ajuste vacío no es "quitar el ajuste": para eso está el DELETE. Guardarlo dejaría una clave que no
    // hace nada y que confundiría al leer el panel.
    return fail(400, 'Indica al menos un valor, o borra el ajuste');
  }

  const override = {
    ...(maxActive !== undefined ? { maxActive } : {}),
    ...(ttlDays !== undefined ? { ttlDays } : {}),
    reason: String(body.reason || '').slice(0, REASON_MAX),
    setAt: Date.now(),
    by: caller.user.email || 'admin',
  };
  await context.env.SHARES.put(overrideKey(uid), JSON.stringify(override));

  return json({ override });
}

export async function onRequestDelete(context: { request: Request; env: Env; params: { uid: string } }): Promise<Response> {
  const caller = await requireAdmin(context.request, context.env);
  if (caller instanceof Response) {
    return caller;
  }
  const uid = String(context.params.uid || '').trim();
  if (!uid) {
    return fail(400, 'Falta el usuario');
  }

  await context.env.SHARES.delete(overrideKey(uid));
  return json({ override: null });
}
