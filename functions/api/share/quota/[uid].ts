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
//
// EL AJUSTE NO PUEDE PASAR DEL MÁXIMO DE SU CATEGORÍA. El ajuste individual sirve para RECORTAR lo que alguien
// comparte sin tocarle la frescura de su feed; para darle más está el rango, que es lo que el rango significa. Se
// comprueba aquí y no solo en el panel: un límite que solo vive en la interfaz no es un límite.
import { requireAdmin } from '../../../_lib/context';
import { fail, json, readJson } from '../../../_lib/http';
import { overrideExceedsTier, tryReadProfileFacts } from '../../../_lib/quota';
import { overrideKey, type Env } from '../../../_lib/keys';
import { PROFILE_TIER_LABELS } from '../../../../src/core/constants/tiers';

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

  // El rango del USUARIO AJUSTADO, leído con el token del administrador (las reglas se lo permiten con
  // `isAdmin()`). Cuando no se puede leer —perfil sin crear, red, reglas— no se rechaza nada: se sigue como antes
  // y el techo absoluto de `resolveShareQuota` hace de última red. Confundir un fallo de lectura con un bronce
  // rechazaría el ajuste legítimo de alguien que es oro.
  const target = await tryReadProfileFacts(caller.user, caller.projectId, caller.appCheckToken, uid);
  const excess = target ? overrideExceedsTier(target.tier, { maxActive, ttlDays }) : null;
  if (target && excess) { // `target` se repite para que TypeScript lo sepa vivo dentro del mensaje
    const unidad = excess.field === 'maxActive' ? 'enlaces activos' : 'días de duración';
    return fail(400, `${PROFILE_TIER_LABELS[target.tier]} llega a ${excess.ceiling} ${unidad}: para darle más, súbele el rango`);
  }

  const override = {
    ...(maxActive !== undefined ? { maxActive } : {}),
    ...(ttlDays !== undefined ? { ttlDays } : {}),
    reason: String(body.reason || '').slice(0, REASON_MAX),
    setAt: Date.now(),
    by: caller.user.email || 'admin',
  };
  // Las dos cifras van TAMBIÉN en la metadata de la clave: así el censo de `/api/share/all` las trae con su
  // `list()`, sin una lectura por usuario, y el panel puede precargar los campos de cuota con lo que hay puesto.
  // El valor completo sigue en el cuerpo (motivo, quién y cuándo), que el censo no necesita.
  await context.env.SHARES.put(overrideKey(uid), JSON.stringify(override), {
    metadata: { maxActive, ttlDays },
  });

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
