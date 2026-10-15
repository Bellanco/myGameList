// DELETE /api/account — la baja de la propia cuenta, COMPLETA, desde el servidor: lo mismo que borra el panel con una
// cuenta caducada (`purgeAccount`), cuenta de Google de Firebase Auth incluida. Ver docs/plan-cuentas-inactivas.md.
//
// Por qué aquí y no en el cliente: hay cosas de la cuenta que el cliente no puede borrar porque las reglas solo dejan
// al administrador (su uid en los registros de los premios, su fila en el archivo de cada edición, lo que apunta el
// registro del panel), y la cuenta de Auth exige desde el cliente haber iniciado sesión hace unos minutos
// (`auth/requires-recent-login`). Aquí basta el ID token verificado: solo se borra el `uid` que viene dentro.
//
// Las respuestas distinguen lo que se arregla esperando de lo que no (el cliente decide con eso si deja la baja en
// «reintentar más tarde»): sin cupo o con Google caído, 503 `unavailable` (lo pone el middleware); sin cuenta de
// servicio, 500 con `configured: false` (el cliente borra entonces lo que puede él); un borrado a medias o una
// cuenta de servicio mal configurada, 500 con lo que falló.
import { purgeAccount } from '../_lib/accounts';
import { requireUser } from '../_lib/context';
import { fail, json, ServiceUnavailableError } from '../_lib/http';
import type { Env } from '../_lib/keys';
import { hasServiceAccount, serviceAccessToken, type ServiceAccountEnv } from '../_lib/serviceAccount';

export async function onRequestDelete(context: { request: Request; env: Env & ServiceAccountEnv }): Promise<Response> {
  const caller = await requireUser(context.request, context.env);
  if (caller instanceof Response) return caller;
  if (!hasServiceAccount(context.env)) return fail(500, 'Falta la cuenta de servicio', { configured: false });

  try {
    const token = await serviceAccessToken(context.env);
    const outcome = await purgeAccount({ token, projectId: caller.projectId }, context.env.SHARES, caller.user.uid);
    if (outcome.authDeleted) return json({ deleted: true });
    console.error('[account] baja a medias:', outcome.failures.join('; '));
    return fail(500, 'La baja no se completó', { failures: outcome.failures });
  } catch (error) {
    if (error instanceof ServiceUnavailableError) throw error;
    const message = error instanceof Error ? error.message : 'error';
    console.error('[account] baja fallida:', message);
    return fail(500, message, { failures: [message] });
  }
}
