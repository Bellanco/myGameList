// LECTURAS, ESCRITURAS Y BORRADOS DE FIRESTORE DEL DÍA, leídos de Cloud Monitoring (docs/plan-admin-rediseno.md, F5).
//
// Firestore no da su consumo a un cliente; lo da la API de Monitoring del proyecto, con una cuenta de servicio que
// tenga el rol `roles/monitoring.viewer`. Su JSON va entero en el secreto `GCP_MONITORING_SA` (ver la sección
// «Credenciales» del plan). Sin él, `configured` es `false` y el panel lo dice en vez de inventar un cero.
//
// El día que cuenta es el de la CUOTA: la del plan Spark se reinicia a medianoche de la hora del Pacífico, no en
// UTC ni en la hora de Madrid. Por eso el intervalo se mide desde ahí.
//
// Las métricas de facturación son `document/*_ops_count`; las `document/*_count` son las de siempre y se piden si
// las otras no devuelven nada (proyectos donde aún no existen). Se suma la serie entera del intervalo.

export interface GcpMonitoringEnv {
  GCP_MONITORING_SA?: string;
  FIREBASE_PROJECT_ID?: string;
}

export type FirestoreOp = 'read' | 'write' | 'delete';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/monitoring.read';

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<ServiceAccount>;
    if (typeof data.client_email !== 'string' || typeof data.private_key !== 'string') return null;
    return { client_email: data.client_email, private_key: data.private_key };
  } catch {
    return null;
  }
}

/**
 * Las 00:00 del día de hoy en Los Ángeles, en ms. Se saca el desfase de esa zona en este instante con `Intl`
 * (cubre el cambio de hora sin tablas a mano).
 */
export function pacificMidnight(now: number): number {
  const wall = (at: number) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(at));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
    return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute'), s: get('second') };
  };
  // El desfase de la zona EN UN INSTANTE: la hora de pared leída como si fuera UTC, menos ese instante.
  const offsetAt = (at: number) => {
    const w = wall(at);
    return Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s) - Math.floor(at / 1000) * 1000;
  };
  const today = wall(now);
  const midnightAsUtc = Date.UTC(today.y, today.m - 1, today.d);
  // Primero con el desfase de AHORA y luego con el de la medianoche candidata: los dos días de cambio de hora, el de
  // ahora no es el de las 00:00 y la cuenta se desplazaba una hora.
  const guess = midnightAsUtc - offsetAt(now);
  return midnightAsUtc - offsetAt(guess);
}

function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

/** Token de acceso de la cuenta de servicio (JWT firmado con su clave → intercambio en Google). */
async function accessToken(account: ServiceAccount, now: number, fetcher: typeof fetch): Promise<string> {
  const iat = Math.floor(now / 1000);
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = base64Url(
    new TextEncoder().encode(JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 })),
  );
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  const response = await fetcher(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${base64Url(signature)}`,
    }),
  });
  if (!response.ok) throw new Error(`Google rechazó la cuenta de servicio (${response.status})`);
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('Google no devolvió token');
  return data.access_token;
}

/** Suma todos los puntos de todas las series de una respuesta de `timeSeries.list`. `null` si no hay ninguna. */
export function sumTimeSeries(body: unknown): number | null {
  const series = (body as { timeSeries?: Array<{ points?: Array<{ value?: { int64Value?: string; doubleValue?: number } }> }> })
    ?.timeSeries;
  if (!Array.isArray(series) || series.length === 0) return null;
  let total = 0;
  for (const entry of series) {
    for (const point of entry.points || []) {
      total += Number(point.value?.int64Value ?? point.value?.doubleValue ?? 0) || 0;
    }
  }
  return total;
}

const METRICS: Record<FirestoreOp, readonly string[]> = {
  read: ['firestore.googleapis.com/document/read_ops_count', 'firestore.googleapis.com/document/read_count'],
  write: ['firestore.googleapis.com/document/write_ops_count', 'firestore.googleapis.com/document/write_count'],
  delete: ['firestore.googleapis.com/document/delete_ops_count', 'firestore.googleapis.com/document/delete_count'],
};

async function sumMetric(projectId: string, token: string, metric: string, start: number, end: number, fetcher: typeof fetch): Promise<number | null> {
  const params = new URLSearchParams({
    filter: `metric.type="${metric}"`,
    'interval.startTime': new Date(start).toISOString(),
    'interval.endTime': new Date(end).toISOString(),
    // Un solo punto por serie con la suma del intervalo entero, y todas las series (bases de datos) juntas.
    'aggregation.alignmentPeriod': `${Math.max(60, Math.ceil((end - start) / 1000))}s`,
    'aggregation.perSeriesAligner': 'ALIGN_SUM',
    'aggregation.crossSeriesReducer': 'REDUCE_SUM',
  });
  const response = await fetcher(
    `https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(projectId)}/timeSeries?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error(`Cloud Monitoring respondió ${response.status}`);
  return sumTimeSeries(await response.json());
}

export interface FirestoreUsage {
  configured: boolean;
  /** Desde cuándo se cuenta (medianoche del Pacífico) y cuándo se reinicia. */
  since: number;
  resetsAt: number;
  values: Record<FirestoreOp, number | null>;
  error?: string;
}

export async function readFirestoreUsage(env: GcpMonitoringEnv, now: number, fetcher: typeof fetch = fetch): Promise<FirestoreUsage> {
  const since = pacificMidnight(now);
  const resetsAt = pacificMidnight(since + 36 * 3600_000);
  const empty: Record<FirestoreOp, number | null> = { read: null, write: null, delete: null };
  const account = parseServiceAccount(env.GCP_MONITORING_SA);
  const projectId = String(env.FIREBASE_PROJECT_ID || '').trim();
  if (!account || !projectId) return { configured: false, since, resetsAt, values: empty };
  try {
    const token = await accessToken(account, now, fetcher);
    const values = { ...empty };
    for (const op of ['read', 'write', 'delete'] as const) {
      // Una métrica que el proyecto no tiene responde con error: se prueba la siguiente, y solo si fallan todas se
      // da el dato por perdido.
      let failures = 0;
      let lastError: unknown = null;
      for (const metric of METRICS[op]) {
        try {
          const value = await sumMetric(projectId, token, metric, since, now, fetcher);
          if (value !== null) {
            values[op] = value;
            break;
          }
        } catch (error) {
          failures += 1;
          lastError = error;
        }
      }
      if (failures === METRICS[op].length) throw lastError;
      // Sin serie no hubo operaciones: Monitoring no guarda ceros.
      if (values[op] === null) values[op] = 0;
    }
    return { configured: true, since, resetsAt, values };
  } catch (error) {
    return { configured: true, since, resetsAt, values: empty, error: error instanceof Error ? error.message : String(error) };
  }
}
