// GET /api/share/mine — mis enlaces activos, mi cuota ya resuelta y mi veto si lo hubiera.
//
// Con esto el cliente pinta el contador ("3 de 5 enlaces activos") y decide si el botón de compartir va activo,
// sin tener que adivinar el rango ni replicar la resolución de cuota.
//
// Ruta estática: en Pages gana sobre `[token].ts`, así que `/api/share/mine` nunca se confunde con un token.
import { requireUser } from '../../_lib/context';
import { json } from '../../_lib/http';
import type { Env } from '../../_lib/keys';
import { listActiveShares, readShareStatus } from '../../_lib/quota';
import { removeShare } from '../../_lib/shares';

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const caller = await requireUser(context.request, context.env);
  if (caller instanceof Response) {
    return caller;
  }

  const status = await readShareStatus(context.env, caller.user, caller.projectId, caller.appCheckToken);

  return json({
    shares: status.active
      .filter((row) => row.meta)
      .map((row) => ({ token: row.token, ...row.meta }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    quota: status.quota,
    ban: status.ban,
    // El rango se envía para poder decir "esto es lo que da tu rango" en la pantalla de gestión, no para que el
    // cliente calcule nada: la cuota ya viene resuelta.
    tier: status.tier,
  });
}

/**
 * DELETE /api/share/mine — retira TODOS mis enlaces de una vez. Lo llama el borrado de cuenta.
 *
 * Sin esto, el derecho de supresión quedaría incompleto: alguien podría borrar su cuenta y sus reseñas seguirían
 * publicadas hasta caducar.
 *
 * OJO CON LO QUE **NO** BORRA: ni el veto (`ban:{uid}`) ni el ajuste de cuota. Es deliberado — si los borrase,
 * cualquiera podría quitarse un veto llamando a este endpoint, sin borrar nada. Quedan como residuo de un uid
 * que ya no existe y el administrador puede limpiarlos desde `/admin`.
 */
export async function onRequestDelete(context: { request: Request; env: Env }): Promise<Response> {
  const caller = await requireUser(context.request, context.env);
  if (caller instanceof Response) {
    return caller;
  }

  const rows = await listActiveShares(context.env.SHARES, caller.user.uid);
  await Promise.all(rows.map((row) => removeShare(context.env.SHARES, caller.user.uid, row.token)));

  return json({ removed: rows.length });
}
