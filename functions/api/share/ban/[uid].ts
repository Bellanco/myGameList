// POST   /api/share/ban/:uid — veta a un usuario. Con `{ purge: true }` retira además sus enlaces activos.
// DELETE /api/share/ban/:uid — levanta el veto.
//
// Solo el administrador. VETAR Y RETIRAR SON DECISIONES DISTINTAS: el veto impide publicar de nuevo, y lo ya
// publicado solo desaparece si se pide expresamente. Quien modera decide si el problema es la persona, el
// contenido o ambos.
//
// El veto vive en KV y no como campo del perfil a propósito: es una regla del SERVICIO, igual que las cuotas, y
// meterlo en `profiles` obligaría a tocar la allowlist de escrituras y a añadir una regla que impidiera al dueño
// quitárselo, con sus pruebas. Aquí no hay nada que el usuario pueda escribir.
import { requireAdmin } from '../../../_lib/context';
import { fail, json, readJson } from '../../../_lib/http';
import { banKey, type Env } from '../../../_lib/keys';
import { listActiveShares, readBan } from '../../../_lib/quota';
import { removeShare } from '../../../_lib/shares';

const REASON_MAX = 500;

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
  const reason = String(body.reason || '').slice(0, REASON_MAX);
  const purge = body.purge === true;

  await context.env.SHARES.put(
    banKey(uid),
    JSON.stringify({ reason, bannedAt: Date.now(), by: caller.user.email || 'admin' }),
  );

  let purged = 0;
  if (purge) {
    const rows = await listActiveShares(context.env.SHARES, uid);
    await Promise.all(rows.map((row) => removeShare(context.env.SHARES, uid, row.token)));
    purged = rows.length;
  }

  return json({ banned: true, purged });
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

  await context.env.SHARES.delete(banKey(uid));
  return json({ banned: false });
}

/** GET para que el panel pueda consultar el estado sin tener que deducirlo de una lista. */
export async function onRequestGet(context: { request: Request; env: Env; params: { uid: string } }): Promise<Response> {
  const caller = await requireAdmin(context.request, context.env);
  if (caller instanceof Response) {
    return caller;
  }
  const uid = String(context.params.uid || '').trim();
  return json({ ban: uid ? await readBan(context.env.SHARES, uid) : null });
}
