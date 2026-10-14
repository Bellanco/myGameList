// GET /api/admin/health — el consumo del día frente a los techos del plan gratuito. Solo el administrador.
//
// Junta en una respuesta lo que hoy había que ir a mirar a tres sitios (docs/plan-admin-rediseno.md, F5):
//
//   - Firestore (Spark): lecturas, escrituras y borrados del día, de Cloud Monitoring (`gcpMonitoring.ts`).
//   - Cloudflare (Free): operaciones de KV por tipo y peticiones a Functions, de la API de analíticas
//     (`cloudflareAnalytics.ts`).
//   - Carátulas: el contador propio del Worker de carátulas (el mismo de `/api/cover-stats`).
//
// Cada fuente puede faltar —sin credenciales, o con su API caída— y entonces su medidor sale con `used: null` y el
// motivo en `status`. El panel no confunde nunca «no se sabe» con «cero».
//
// LO QUE NO HACE: no cambia ningún tope. Es una lectura, y por eso es un GET.
import { requireAdmin } from '../../_lib/context';
import { json } from '../../_lib/http';
import { COVER_DAILY_BUDGET, coverDailyQuotaKey, type Env, type KVNamespace } from '../../_lib/keys';
import { readFirestoreUsage, type GcpMonitoringEnv } from '../../_lib/gcpMonitoring';
import { readCloudflareUsage, type CloudflareAnalyticsEnv } from '../../_lib/cloudflareAnalytics';

interface HealthEnv extends Env, GcpMonitoringEnv, CloudflareAnalyticsEnv {
  COVERS?: KVNamespace;
}

/**
 * LOS TECHOS DIARIOS DE LOS PLANES GRATUITOS (consultados en la documentación de cada uno el 14-10-2026). Si se
 * cambia de plan, se cambian aquí: el panel pinta lo que diga esta tabla.
 */
export const FREE_TIER_LIMITS = {
  firestoreReads: 50_000,
  firestoreWrites: 20_000,
  firestoreDeletes: 20_000,
  kvReads: 100_000,
  kvWrites: 1_000,
  kvDeletes: 1_000,
  kvLists: 1_000,
  functionsRequests: 100_000,
} as const;

export type HealthStatus = 'ok' | 'not-configured' | 'error';

export interface HealthMeterPayload {
  id: string;
  source: 'covers' | 'firestore' | 'cloudflare';
  used: number | null;
  limit: number;
  status: HealthStatus;
  resetsAt: number;
  /** El valor de ayer, cuando la fuente lo guarda (las carátulas: su contador vive 48 h). */
  previous?: number | null;
  error?: string;
}

export async function onRequestGet(context: { request: Request; env: HealthEnv }): Promise<Response> {
  const caller = await requireAdmin(context.request, context.env);
  if (caller instanceof Response) {
    return caller;
  }
  const now = Date.now();
  const covers = context.env.COVERS;
  const [firestore, cloudflare, coversSpent, coversYesterday] = await Promise.all([
    readFirestoreUsage(context.env, now),
    readCloudflareUsage(context.env, now),
    covers ? covers.get(coverDailyQuotaKey(now)).then((value) => Number(value) || 0) : Promise.resolve(null),
    // El contador del día vive 48 h (ver `/cover`): el de ayer aún está, y da con qué comparar.
    covers ? covers.get(coverDailyQuotaKey(now - 86_400_000)).then((value) => Number(value) || 0) : Promise.resolve(null),
  ]);

  const firestoreStatus: HealthStatus = !firestore.configured ? 'not-configured' : firestore.error ? 'error' : 'ok';
  const cloudflareStatus: HealthStatus = !cloudflare.configured ? 'not-configured' : cloudflare.error ? 'error' : 'ok';
  const L = FREE_TIER_LIMITS;
  const meters: HealthMeterPayload[] = [
    { id: 'covers', source: 'covers', used: coversSpent, limit: COVER_DAILY_BUDGET, status: coversSpent === null ? 'not-configured' : 'ok', resetsAt: cloudflare.resetsAt, previous: coversYesterday },
    { id: 'firestore-reads', source: 'firestore', used: firestore.values.read, limit: L.firestoreReads, status: firestoreStatus, resetsAt: firestore.resetsAt, error: firestore.error },
    { id: 'firestore-writes', source: 'firestore', used: firestore.values.write, limit: L.firestoreWrites, status: firestoreStatus, resetsAt: firestore.resetsAt, error: firestore.error },
    { id: 'firestore-deletes', source: 'firestore', used: firestore.values.delete, limit: L.firestoreDeletes, status: firestoreStatus, resetsAt: firestore.resetsAt, error: firestore.error },
    { id: 'kv-reads', source: 'cloudflare', used: cloudflare.kv.read, limit: L.kvReads, status: cloudflareStatus, resetsAt: cloudflare.resetsAt, error: cloudflare.error },
    { id: 'kv-writes', source: 'cloudflare', used: cloudflare.kv.write, limit: L.kvWrites, status: cloudflareStatus, resetsAt: cloudflare.resetsAt, error: cloudflare.error },
    { id: 'kv-deletes', source: 'cloudflare', used: cloudflare.kv.delete, limit: L.kvDeletes, status: cloudflareStatus, resetsAt: cloudflare.resetsAt, error: cloudflare.error },
    { id: 'kv-lists', source: 'cloudflare', used: cloudflare.kv.list, limit: L.kvLists, status: cloudflareStatus, resetsAt: cloudflare.resetsAt, error: cloudflare.error },
    { id: 'functions', source: 'cloudflare', used: cloudflare.functions, limit: L.functionsRequests, status: cloudflareStatus, resetsAt: cloudflare.resetsAt, error: cloudflare.error },
  ];
  return json({ fetchedAt: now, meters });
}
