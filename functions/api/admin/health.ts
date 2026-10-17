// GET /api/admin/health — el consumo del día frente a los techos del plan gratuito. Solo el administrador.
//
// Junta en una respuesta lo que hoy había que ir a mirar a dos sitios (docs/plan-admin-rediseno.md, F5):
//
//   - Cloudflare (Free): operaciones de KV por tipo y peticiones a Functions, de la API de analíticas
//     (`cloudflareAnalytics.ts`).
//   - Carátulas: el contador propio del Worker de carátulas (el mismo de `/api/cover-stats`).
//   - IsThereAnyDeal: los contadores que apunta `/api/precios` (`itadUso.ts`), aparte de los medidores porque su
//     límite no es diario sino de 1.000 llamadas cada 5 minutos.
//
// Cada fuente puede faltar —sin credenciales, o con su API caída— y entonces su medidor sale con `used: null` y el
// motivo en `status`. El panel no confunde nunca «no se sabe» con «cero».
//
// LO QUE NO HACE: no cambia ningún tope. Es una lectura, y por eso es un GET. Tampoco mide Firestore: su consumo
// solo lo da Cloud Monitoring, y su API exige facturación activa en el proyecto (en Spark responde «requires billing
// to be enabled»). Se probó el 14-10-2026 y se retiró.
import { requireAdmin } from '../../_lib/context';
import { json } from '../../_lib/http';
import { COVER_DAILY_BUDGET, coverDailyQuotaKey, type Env, type KVNamespace } from '../../_lib/keys';
import { readCloudflareUsage, type CloudflareAnalyticsEnv } from '../../_lib/cloudflareAnalytics';
import { itadLlamadasKey, itadSinCupoKey } from '../../_lib/itadUso';

interface HealthEnv extends Env, CloudflareAnalyticsEnv {
  COVERS?: KVNamespace;
  ITAD_API_KEY?: string;
}

/**
 * LOS TECHOS DIARIOS DE LOS PLANES GRATUITOS (consultados en la documentación de cada uno el 14-10-2026). Si se
 * cambia de plan, se cambian aquí: el panel pinta lo que diga esta tabla.
 */
export const FREE_TIER_LIMITS = {
  kvReads: 100_000,
  kvWrites: 1_000,
  kvDeletes: 1_000,
  kvLists: 1_000,
  functionsRequests: 100_000,
} as const;

export type HealthStatus = 'ok' | 'not-configured' | 'error';

export interface HealthMeterPayload {
  id: string;
  source: 'covers' | 'cloudflare';
  used: number | null;
  limit: number;
  status: HealthStatus;
  resetsAt: number;
  /** El valor de ayer, cuando la fuente lo guarda (las carátulas: su contador vive 48 h). */
  previous?: number | null;
  error?: string;
}

/** Lo gastado de IsThereAnyDeal hoy y ayer. `null` donde no se pudo leer. */
export interface ItadUsagePayload {
  status: HealthStatus;
  calls: number | null;
  callsYesterday: number | null;
  denied: number | null;
  deniedYesterday: number | null;
  resetsAt: number;
}

export async function onRequestGet(context: { request: Request; env: HealthEnv }): Promise<Response> {
  const caller = await requireAdmin(context.request, context.env);
  if (caller instanceof Response) {
    return caller;
  }
  const now = Date.now();
  const covers = context.env.COVERS;
  // Cada lectura de KV, por su cuenta: si KV no responde (sin cupo de lecturas, justo el día que más interesa mirar
  // esto), se pierde el medidor de carátulas y no la respuesta entera.
  const readKv = (kv: KVNamespace | undefined, key: string) =>
    kv ? kv.get(key).then((value) => Number(value) || 0, () => null) : Promise.resolve(null);
  const readCounter = (at: number) => readKv(covers, coverDailyQuotaKey(at));
  const yesterday = now - 86_400_000;
  const itadConfigured = Boolean(String(context.env.ITAD_API_KEY || '').trim());
  const readItad = (key: string) => (itadConfigured ? readKv(context.env.SHARES, key) : Promise.resolve(null));
  const [cloudflare, coversSpent, coversYesterday, itadCalls, itadCallsYesterday, itadDenied, itadDeniedYesterday] = await Promise.all([
    readCloudflareUsage(context.env, now),
    readCounter(now),
    // El contador del día vive 48 h (ver `/cover`): el de ayer aún está, y da con qué comparar.
    readCounter(yesterday),
    readItad(itadLlamadasKey(now)),
    readItad(itadLlamadasKey(yesterday)),
    readItad(itadSinCupoKey(now)),
    readItad(itadSinCupoKey(yesterday)),
  ]);

  const cloudflareStatus: HealthStatus = !cloudflare.configured ? 'not-configured' : cloudflare.error ? 'error' : 'ok';
  const L = FREE_TIER_LIMITS;
  const meters: HealthMeterPayload[] = [
    { id: 'covers', source: 'covers', used: coversSpent, limit: COVER_DAILY_BUDGET, status: !covers ? 'not-configured' : coversSpent === null ? 'error' : 'ok', resetsAt: cloudflare.resetsAt, previous: coversYesterday },
    { id: 'kv-reads', source: 'cloudflare', used: cloudflare.kv.read, limit: L.kvReads, status: cloudflareStatus, resetsAt: cloudflare.resetsAt, error: cloudflare.error },
    { id: 'kv-writes', source: 'cloudflare', used: cloudflare.kv.write, limit: L.kvWrites, status: cloudflareStatus, resetsAt: cloudflare.resetsAt, error: cloudflare.error },
    { id: 'kv-deletes', source: 'cloudflare', used: cloudflare.kv.delete, limit: L.kvDeletes, status: cloudflareStatus, resetsAt: cloudflare.resetsAt, error: cloudflare.error },
    { id: 'kv-lists', source: 'cloudflare', used: cloudflare.kv.list, limit: L.kvLists, status: cloudflareStatus, resetsAt: cloudflare.resetsAt, error: cloudflare.error },
    { id: 'functions', source: 'cloudflare', used: cloudflare.functions, limit: L.functionsRequests, status: cloudflareStatus, resetsAt: cloudflare.resetsAt, error: cloudflare.error },
  ];
  const itad: ItadUsagePayload = {
    status: !itadConfigured ? 'not-configured' : itadCalls === null || itadDenied === null ? 'error' : 'ok',
    calls: itadCalls,
    callsYesterday: itadCallsYesterday,
    denied: itadDenied,
    deniedYesterday: itadDeniedYesterday,
    resetsAt: cloudflare.resetsAt,
  };
  return json({ fetchedAt: now, meters, itad });
}
