// LA BANDEJA DE «NECESITA ATENCIÓN» de la portada del panel (docs/plan-admin-rediseno.md, F3).
//
// Responde a la pregunta con la que se abre el panel —«¿hay algo que mirar hoy?»— juntando en una lista lo que
// antes había que ir a buscar a cada pantalla: un token en claro, fotos a la vista, el cupo de carátulas, los retos
// por cerrar o por publicar, pendientes vencidos. Cada entrada dice cuánto y lleva a donde se resuelve.
//
// Puro: recibe lo que haya llegado (cada fuente puede faltar) y devuelve las entradas ordenadas por gravedad. Lo que
// no ha llegado no genera entrada: no se avisa de lo que no se sabe.
import type { AdminAnomaly } from '../../model/types/firestore';

export type AttentionSeverity = 'bad' | 'warn' | 'info';

export type AttentionItem =
  | { code: 'legacy-token'; severity: 'bad'; count: number; firstUserId: string }
  | { code: 'stray-photo'; severity: 'bad'; count: number }
  | { code: 'gist-drift'; severity: 'warn'; count: number }
  | { code: 'covers'; severity: AttentionSeverity; spent: number; cap: number }
  | { code: 'capacity'; severity: AttentionSeverity; metric: string; used: number; limit: number }
  | { code: 'premios-closing'; severity: 'warn'; closesAt: number }
  | { code: 'premios-pending'; severity: 'warn' }
  | { code: 'todos-due'; severity: 'warn'; count: number }
  | { code: 'census-truncated'; severity: 'info'; count: number };

export interface AttentionInput {
  now: number;
  users?: ReadonlyArray<{ id: string; anomalies: AdminAnomaly[] }>;
  truncated?: boolean;
  covers?: { spent: number; cap: number } | null;
  /** Medidores de capacidad con datos (los «sin conectar» no llegan aquí). */
  capacity?: ReadonlyArray<{ metric: string; used: number; limit: number }>;
  premios?: { stage: 'none' | 'open' | 'pending'; closesAt: number | null } | null;
  /** Pendientes sin hacer cuya fecha es hoy o ya pasó. */
  dueTodos?: number;
}

/** A partir de qué parte del techo se avisa (aviso) y se alarma (grave). Se avisa ANTES de llegar: es lo útil. */
export const CAPACITY_WARN = 0.7;
export const CAPACITY_BAD = 0.9;
/** Los retos se anuncian cuando quedan tres días o menos para cerrar. */
const PREMIOS_NOTICE_MS = 3 * 24 * 60 * 60 * 1000;

export function capacitySeverity(used: number, limit: number): AttentionSeverity | null {
  if (!(limit > 0)) return null;
  const ratio = used / limit;
  if (ratio >= CAPACITY_BAD) return 'bad';
  if (ratio >= CAPACITY_WARN) return 'warn';
  return null;
}

const ORDER: Record<AttentionSeverity, number> = { bad: 0, warn: 1, info: 2 };

export function buildAttention(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];
  const users = input.users || [];
  const withSignal = (code: AdminAnomaly) => users.filter((user) => user.anomalies.includes(code));

  const tokens = withSignal('legacy-token');
  if (tokens.length) items.push({ code: 'legacy-token', severity: 'bad', count: tokens.length, firstUserId: tokens[0].id });
  const photos = withSignal('stray-photo');
  if (photos.length) items.push({ code: 'stray-photo', severity: 'bad', count: photos.length });
  const drift = withSignal('gist-drift');
  if (drift.length) items.push({ code: 'gist-drift', severity: 'warn', count: drift.length });

  if (input.covers) {
    const severity = capacitySeverity(input.covers.spent, input.covers.cap);
    if (severity) items.push({ code: 'covers', severity, spent: input.covers.spent, cap: input.covers.cap });
  }
  for (const meter of input.capacity || []) {
    const severity = capacitySeverity(meter.used, meter.limit);
    if (severity) items.push({ code: 'capacity', severity, metric: meter.metric, used: meter.used, limit: meter.limit });
  }

  if (input.premios?.stage === 'open' && input.premios.closesAt && input.premios.closesAt - input.now <= PREMIOS_NOTICE_MS) {
    items.push({ code: 'premios-closing', severity: 'warn', closesAt: input.premios.closesAt });
  }
  if (input.premios?.stage === 'pending') items.push({ code: 'premios-pending', severity: 'warn' });
  if (input.dueTodos) items.push({ code: 'todos-due', severity: 'warn', count: input.dueTodos });
  if (input.truncated) items.push({ code: 'census-truncated', severity: 'info', count: users.length });

  // `sort` es estable: dentro de la misma gravedad se respeta el orden de arriba, que va de lo más a lo menos urgente.
  return items.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}
