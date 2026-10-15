// /api/admin/accounts — las cuentas de Firebase Auth cruzadas con Firestore, y el borrado de las caducadas. Solo el
// administrador. Ver docs/plan-cuentas-inactivas.md.
//
//   GET   el censo de cuentas (`AccountCensus`): con perfil o sin él, último uso, premios. Sin cuenta de servicio
//         configurada responde `{ configured: false }` y el panel lo dice en vez de enseñar una lista vacía.
//   POST  `{ uids: string[] }` borra esas cuentas, pero SOLO las que el servidor da por caducadas en ese momento: la
//         lista del panel puede tener horas, y alguien puede haber vuelto entretanto. Lo que no esté caducado se
//         salta y se dice.
//
// El borrado no tiene vuelta atrás; por eso lo lanza una persona desde el panel, con confirmación, y no una tarea
// programada (decisión del usuario, 15-10-2026).
import { requireAdmin } from '../../_lib/context';
import { judgeRow, purgeAccount, readAccountCensus } from '../../_lib/accounts';
import { fail, json, readJson, ServiceUnavailableError } from '../../_lib/http';
import type { Env } from '../../_lib/keys';
import { hasServiceAccount, serviceAccessToken, type ServiceAccountEnv } from '../../_lib/serviceAccount';

type AccountsEnv = Env & ServiceAccountEnv;

/**
 * Cuántas cuentas se borran en una petición, como mucho. Lo fija el tope de Workers Free, 50 subpeticiones por
 * petición: el censo son cinco (token y cuatro listados) y cada cuenta hasta catorce (`purgeAccount`): 5 + 3 × 14 =
 * 47. El panel trocea.
 */
export const PURGE_BATCH_MAX = 3;

export type PurgeResult =
  | { uid: string; outcome: 'deleted' }
  | { uid: string; outcome: 'skipped'; reason: 'not-found' | 'not-expired' }
  | { uid: string; outcome: 'failed'; failures: string[] }
  | { uid: string; outcome: 'pending' };

/**
 * Lo que no sea «el servicio no atiende» es un fallo de CONFIGURACIÓN (clave revocada, rol que falta): se responde 502
 * con el motivo —solo el estado de Google, sin cuerpo ni ids— para que el panel no lo confunda con «inténtalo luego».
 */
function configurationError(error: unknown): Response {
  if (error instanceof ServiceUnavailableError) throw error;
  const message = error instanceof Error ? error.message : 'error';
  console.error('[admin/accounts]', message);
  return fail(502, message, { google: true });
}

export async function onRequestGet(context: { request: Request; env: AccountsEnv }): Promise<Response> {
  const caller = await requireAdmin(context.request, context.env);
  if (caller instanceof Response) return caller;
  if (!hasServiceAccount(context.env)) return json({ configured: false });

  try {
    const token = await serviceAccessToken(context.env);
    const census = await readAccountCensus({ token, projectId: caller.projectId });
    return json({ configured: true, fetchedAt: Date.now(), ...census });
  } catch (error) {
    return configurationError(error);
  }
}

/** Los uids pedidos, sin repetidos y solo con la forma de un uid de Firebase. */
export function parsePurgeUids(body: Record<string, unknown> | null): string[] {
  if (!Array.isArray(body?.uids)) return [];
  return [...new Set(body.uids.filter((uid): uid is string => typeof uid === 'string' && /^[A-Za-z0-9]{1,128}$/.test(uid)))];
}

export async function onRequestPost(context: { request: Request; env: AccountsEnv }): Promise<Response> {
  const caller = await requireAdmin(context.request, context.env);
  if (caller instanceof Response) return caller;
  if (!hasServiceAccount(context.env)) return fail(503, 'Falta la cuenta de servicio', { configured: false });

  const uids = parsePurgeUids(await readJson(context.request, 10_000));
  if (uids.length === 0) return fail(400, 'Faltan las cuentas que borrar');
  if (uids.length > PURGE_BATCH_MAX) return fail(400, `Como mucho ${PURGE_BATCH_MAX} cuentas por vez`);

  let api: { token: string; projectId: string };
  let census: Awaited<ReturnType<typeof readAccountCensus>>;
  try {
    api = { token: await serviceAccessToken(context.env), projectId: caller.projectId };
    census = await readAccountCensus(api);
  } catch (error) {
    return configurationError(error);
  }
  const byUid = new Map(census.accounts.map((row) => [row.uid, row]));
  const now = Date.now();

  const results: PurgeResult[] = [];
  let stopped = false;
  for (const uid of uids) {
    if (stopped) {
      results.push({ uid, outcome: 'pending' });
      continue;
    }
    const row = byUid.get(uid);
    if (!row) {
      results.push({ uid, outcome: 'skipped', reason: 'not-found' });
      continue;
    }
    // La comprobación que cuenta es esta, no la del panel: el administrador nunca caduca, quien ha vuelto a entrar
    // desde que se cargó la lista ya no está caducado, y la cuenta de quien llama no se borra desde aquí nunca.
    if (uid === caller.user.uid || judgeRow(row, now).state !== 'expired') {
      results.push({ uid, outcome: 'skipped', reason: 'not-expired' });
      continue;
    }
    try {
      const outcome = await purgeAccount(api, context.env.SHARES, uid);
      if (!outcome.authDeleted) console.error('[admin/accounts] borrado a medias:', outcome.failures.join('; '));
      results.push(outcome.authDeleted ? { uid, outcome: 'deleted' } : { uid, outcome: 'failed', failures: outcome.failures });
    } catch (error) {
      if (!(error instanceof ServiceUnavailableError)) throw error;
      // Sin cupo o con Google caído: se para aquí y se dice qué quedó a medias, en vez de un 503 que escondería lo
      // que SÍ se borró antes.
      results.push({ uid, outcome: 'failed', failures: ['servicio no disponible'] });
      stopped = true;
    }
  }
  return json({ results });
}
