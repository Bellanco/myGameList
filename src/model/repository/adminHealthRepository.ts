/**
 * EL CONSUMO DEL DÍA frente a los techos del plan gratuito, para la pantalla de Capacidad del panel (ver
 * `functions/api/admin/health.ts`). Módulo aparte por el mismo motivo que `coverStatsRepository`: solo lo usa el
 * panel, que es un chunk perezoso, y no puede viajar en el arranque de todo el mundo.
 */
import { shareAuthHeaders } from './shareRepository';

export type HealthStatus = 'ok' | 'not-configured' | 'error';

export interface HealthMeter {
  id: string;
  source: 'covers' | 'cloudflare';
  used: number | null;
  limit: number;
  status: HealthStatus;
  resetsAt: number;
  /** El valor de ayer, si la fuente lo guarda. */
  previous: number | null;
  error?: string;
}

/**
 * Lo gastado de IsThereAnyDeal (`functions/_lib/itadUso.ts`). Va aparte de los medidores: su límite no es diario,
 * sino de 1.000 llamadas cada 5 minutos. `null` donde no se pudo leer.
 */
export interface ItadUsage {
  status: HealthStatus;
  calls: number | null;
  callsYesterday: number | null;
  /** Peticiones que se quedaron sin precios nuevos por falta de cupo. */
  denied: number | null;
  deniedYesterday: number | null;
  resetsAt: number;
}

export interface AdminHealth {
  fetchedAt: number;
  meters: HealthMeter[];
  /** `null` si el servidor aún no lo manda (un despliegue anterior). */
  itad: ItadUsage | null;
}

const SOURCES = ['covers', 'cloudflare'] as const;
const STATUSES = ['ok', 'not-configured', 'error'] as const;

const countOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null;

function sanitizeItad(raw: unknown): ItadUsage | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  return {
    status: STATUSES.find((value) => value === data.status) || 'error',
    calls: countOf(data.calls),
    callsYesterday: countOf(data.callsYesterday),
    denied: countOf(data.denied),
    deniedYesterday: countOf(data.deniedYesterday),
    resetsAt: Number(data.resetsAt) || 0,
  };
}

/** Lo que venga raro del servidor no se pinta: un medidor sin id o sin techo sobra. */
export function sanitizeHealth(raw: unknown): AdminHealth | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as { fetchedAt?: unknown; meters?: unknown; itad?: unknown };
  if (!Array.isArray(data.meters)) return null;
  const meters = data.meters.flatMap((entry): HealthMeter[] => {
    const meter = entry as Record<string, unknown>;
    const source = SOURCES.find((value) => value === meter.source);
    const status = STATUSES.find((value) => value === meter.status) || 'error';
    const limit = Number(meter.limit);
    if (typeof meter.id !== 'string' || !source || !(limit > 0)) return [];
    const used = meter.used === null || meter.used === undefined ? null : Number(meter.used);
    return [{
      id: meter.id,
      source,
      used: used !== null && Number.isFinite(used) ? Math.max(0, used) : null,
      limit,
      status,
      resetsAt: Number(meter.resetsAt) || 0,
      previous: typeof meter.previous === 'number' && Number.isFinite(meter.previous) ? meter.previous : null,
      error: typeof meter.error === 'string' ? meter.error.slice(0, 300) : undefined,
    }];
  });
  return { fetchedAt: Number(data.fetchedAt) || Date.now(), meters, itad: sanitizeItad(data.itad) };
}

/** `null` si el endpoint no responde (en desarrollo no existe: lo sirve Pages). */
export async function loadAdminHealth(): Promise<AdminHealth | null> {
  try {
    const headers = await shareAuthHeaders(() => new Error('sin sesión'));
    const response = await fetch('/api/admin/health', { headers });
    if (!response.ok) return null;
    return sanitizeHealth(await response.json());
  } catch {
    return null;
  }
}
