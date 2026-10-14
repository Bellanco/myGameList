/**
 * EL CONSUMO DEL DÍA frente a los techos del plan gratuito, para la pantalla de Capacidad del panel (ver
 * `functions/api/admin/health.ts`). Módulo aparte por el mismo motivo que `coverStatsRepository`: solo lo usa el
 * panel, que es un chunk perezoso, y no puede viajar en el arranque de todo el mundo.
 */
import { shareAuthHeaders } from './shareRepository';

export type HealthStatus = 'ok' | 'not-configured' | 'error';

export interface HealthMeter {
  id: string;
  source: 'covers' | 'firestore' | 'cloudflare';
  used: number | null;
  limit: number;
  status: HealthStatus;
  resetsAt: number;
  /** El valor de ayer, si la fuente lo guarda. */
  previous: number | null;
  error?: string;
}

export interface AdminHealth {
  fetchedAt: number;
  meters: HealthMeter[];
}

const SOURCES = ['covers', 'firestore', 'cloudflare'] as const;
const STATUSES = ['ok', 'not-configured', 'error'] as const;

/** Lo que venga raro del servidor no se pinta: un medidor sin id o sin techo sobra. */
export function sanitizeHealth(raw: unknown): AdminHealth | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as { fetchedAt?: unknown; meters?: unknown };
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
  return { fetchedAt: Number(data.fetchedAt) || Date.now(), meters };
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
