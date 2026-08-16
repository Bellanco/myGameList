// GET    /api/share/:token — el artículo, para que lo pinte la página pública. SIN sesión: es el contenido que
//                            el autor ha decidido publicar, y quien abre el enlace no tiene por qué tener cuenta.
// DELETE /api/share/:token — retira el enlace. Solo su dueño o el administrador.
import { requireUser } from '../../_lib/context';
import { fail, isValidToken, json } from '../../_lib/http';
import { shareKey, type Env } from '../../_lib/keys';
import { readOwner, removeShare } from '../../_lib/shares';

/** Respuesta única para caducado, retirado o inexistente: no hay motivo para distinguirlos ante un desconocido. */
const notAvailable = () => fail(404, 'Este enlace ya no está disponible');

export async function onRequestGet(context: { request: Request; env: Env; params: { token: string } }): Promise<Response> {
  const token = String(context.params.token || '');
  if (!isValidToken(token)) {
    return notAvailable();
  }

  const article = (await context.env.SHARES.get(shareKey(token), 'json')) as Record<string, unknown> | null;
  if (!article) {
    return notAvailable();
  }
  // El TTL de KV borra solo, pero no al instante: se comprueba igual para que un enlace caducado no siga vivo
  // unas horas por un detalle de implementación del almacén.
  if (Number(article.expiresAt) > 0 && Number(article.expiresAt) < Date.now()) {
    return notAvailable();
  }

  // Caché corta, igual que el HTML de `/r/*`: el autor puede retirarlo en cualquier momento.
  return json(article, 200, { 'Cache-Control': 'public, max-age=60' });
}

export async function onRequestDelete(context: { request: Request; env: Env; params: { token: string } }): Promise<Response> {
  const caller = await requireUser(context.request, context.env);
  if (caller instanceof Response) {
    return caller;
  }
  const token = String(context.params.token || '');
  if (!isValidToken(token)) {
    return notAvailable();
  }

  const owner = await readOwner(context.env.SHARES, token);
  if (!owner) {
    // Ya no existe: se responde OK. Retirar algo retirado no es un error, y así el cliente puede reintentar sin
    // quedarse con una fila fantasma en pantalla.
    return json({ removed: true });
  }
  if (owner !== caller.user.uid && !caller.isAdmin) {
    return fail(403, 'Este enlace no es tuyo');
  }

  await removeShare(context.env.SHARES, owner, token);
  return json({ removed: true });
}
