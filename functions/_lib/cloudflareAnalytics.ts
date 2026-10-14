// OPERACIONES DE KV Y PETICIONES A FUNCTIONS DEL DÍA, leídas de la API GraphQL de analíticas de Cloudflare
// (docs/plan-admin-rediseno.md, F5).
//
// Hace falta el id de la cuenta (`CF_ACCOUNT_ID`, no es secreto) y un token con permiso «Account Analytics: Read»
// (`CF_ANALYTICS_TOKEN`, secreto). Sin los dos, `configured` es `false` y el panel lo dice.
//
// El día que cuenta es el de los cupos de Workers y KV: se reinician a las 00:00 UTC.
//
// Los cupos son de la CUENTA: estas cifras suman todo lo que hay en ella (carátulas, enlaces, el aviso), que es lo
// que de verdad se compara con el techo. Para saber cuánto de las escrituras de KV son carátulas está su propio
// contador (`/api/cover-stats`).

export interface CloudflareAnalyticsEnv {
  CF_ACCOUNT_ID?: string;
  CF_ANALYTICS_TOKEN?: string;
}

export type KvOp = 'read' | 'write' | 'delete' | 'list';

export interface CloudflareUsage {
  configured: boolean;
  since: number;
  resetsAt: number;
  kv: Record<KvOp, number | null>;
  functions: number | null;
  error?: string;
}

const ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';

const QUERY = `query AdminHealth($account: string!, $date: Date!, $start: Time!, $end: Time!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      kv: kvOperationsAdaptiveGroups(limit: 100, filter: { date_geq: $date, date_leq: $date }) {
        sum { requests }
        dimensions { actionType }
      }
      fn: pagesFunctionsInvocationsAdaptiveGroups(limit: 100, filter: { datetime_geq: $start, datetime_leq: $end }) {
        sum { requests }
      }
    }
  }
}`;

/** Agrupa las filas de KV por tipo de operación. Las acciones que no son de las cuatro con cupo se ignoran. */
export function parseCloudflareUsage(body: unknown): { kv: Record<KvOp, number>; functions: number } {
  const data = body as {
    errors?: Array<{ message?: string }> | null;
    data?: { viewer?: { accounts?: Array<{ kv?: unknown[]; fn?: unknown[] }> } };
  };
  if (data?.errors && data.errors.length) {
    throw new Error(data.errors.map((error) => error.message || '').filter(Boolean).join('; ') || 'Error de la API de analíticas');
  }
  const account = data?.data?.viewer?.accounts?.[0];
  if (!account) throw new Error('La API de analíticas no devolvió la cuenta');
  const kv: Record<KvOp, number> = { read: 0, write: 0, delete: 0, list: 0 };
  for (const row of (account.kv || []) as Array<{ sum?: { requests?: number }; dimensions?: { actionType?: string } }>) {
    const action = String(row.dimensions?.actionType || '').toLowerCase();
    if (action === 'read' || action === 'write' || action === 'delete' || action === 'list') {
      kv[action] += Number(row.sum?.requests) || 0;
    }
  }
  const functions = ((account.fn || []) as Array<{ sum?: { requests?: number } }>).reduce(
    (total, row) => total + (Number(row.sum?.requests) || 0),
    0,
  );
  return { kv, functions };
}

export async function readCloudflareUsage(
  env: CloudflareAnalyticsEnv,
  now: number,
  fetcher: typeof fetch = fetch,
): Promise<CloudflareUsage> {
  const since = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  const resetsAt = since + 86_400_000;
  const empty: CloudflareUsage = { configured: false, since, resetsAt, kv: { read: null, write: null, delete: null, list: null }, functions: null };
  const account = String(env.CF_ACCOUNT_ID || '').trim();
  const token = String(env.CF_ANALYTICS_TOKEN || '').trim();
  if (!account || !token) return empty;
  try {
    const response = await fetcher(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        query: QUERY,
        variables: {
          account,
          date: new Date(since).toISOString().slice(0, 10),
          start: new Date(since).toISOString(),
          end: new Date(now).toISOString(),
        },
      }),
    });
    if (!response.ok) throw new Error(`La API de analíticas respondió ${response.status}`);
    const parsed = parseCloudflareUsage(await response.json());
    return { configured: true, since, resetsAt, kv: parsed.kv, functions: parsed.functions };
  } catch (error) {
    return { ...empty, configured: true, error: error instanceof Error ? error.message : String(error) };
  }
}
