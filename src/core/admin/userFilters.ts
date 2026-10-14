// FILTROS Y ORDEN DE LA TABLA DE USUARIOS del panel (ver docs/plan-admin-rediseno.md, F2).
//
// VIVEN EN LA URL (`/admin/usuarios?senal=graves&rango=silver`), y por eso este módulo sabe leerlos y escribirlos:
// un filtro que se pierde al recargar o que no se puede enlazar obliga a rehacerlo a mano cada vez, y la pregunta
// del panel —«¿quién más tiene esto?»— es justo la que se quiere poder repetir. La portada enlaza aquí con el filtro
// ya puesto («Señales graves: 3» lleva a esos tres).
//
// Es puro: ni React ni router. La tabla le pasa las filas del censo y lo que no sale del censo (vetos y ajustes de
// cuota, que vienen del Worker de enlaces).
import type { AdminAnomaly } from '../../model/types/firestore';
import { PROFILE_TIERS, type ProfileTier } from '../constants/tiers';

/** Lo que el filtro necesita de cada fila: un subconjunto de `AdminUserRow`, para no atarlo al repositorio. */
export interface FilterableUser {
  id: string;
  uid: string;
  displayName: string;
  knownAs: string;
  friendKnownNames: string[];
  profileId: string;
  socialEnabled: boolean;
  tier: ProfileTier;
  updatedAt: number;
  createdAt: number;
  estimatedFirstSeenAt: number;
  friends: number;
  anomalies: AdminAnomaly[];
}

/**
 * Señales que no son «estado raro» sino un problema con consecuencias hoy: un token en claro que cualquiera puede
 * leer, una foto a la vista que su dueño quiso ocultar, unas reseñas que no llegan al feed, o fechas imposibles.
 * La tabla las destaca y las pone primero, para que no se pierdan entre las informativas (esquema antiguo,
 * inactividad).
 */
export const SEVERE_ANOMALIES: ReadonlySet<AdminAnomaly> = new Set<AdminAnomaly>([
  'legacy-token',
  'gist-drift',
  'future-activity',
  'created-after-activity',
  'stray-photo',
]);

export function isSevereUser(user: Pick<FilterableUser, 'anomalies'>): boolean {
  return user.anomalies.some((code) => SEVERE_ANOMALIES.has(code));
}

export type AdminSignalFilter = 'all' | 'flagged' | 'severe' | AdminAnomaly;
export type AdminActivityFilter = 'any' | 'today' | '7' | '30' | 'inactive';
export const ADMIN_ONLY_FILTERS = ['new', 'no-friends', 'social-off', 'banned', 'quota'] as const;
export type AdminOnlyFilter = (typeof ADMIN_ONLY_FILTERS)[number];
export const ADMIN_SORT_KEYS = ['name', 'friends', 'shares', 'activity', 'created'] as const;
export type AdminSortKey = (typeof ADMIN_SORT_KEYS)[number];

export interface AdminUserFilters {
  text: string;
  signal: AdminSignalFilter;
  tiers: ProfileTier[];
  activity: AdminActivityFilter;
  only: AdminOnlyFilter[];
}

export interface AdminUserSort {
  key: AdminSortKey;
  dir: 'asc' | 'desc';
}

export const DEFAULT_USER_FILTERS: AdminUserFilters = { text: '', signal: 'all', tiers: [], activity: 'any', only: [] };

/**
 * El orden de fábrica: LO GRAVE PRIMERO y, dentro, lo más reciente arriba. Es el único orden que mezcla dos
 * criterios, porque es el que responde a «¿hay algo que mirar?». Al pulsar una columna manda solo esa columna.
 */
export const DEFAULT_USER_SORT: AdminUserSort = { key: 'activity', dir: 'desc' };

/** Lo que no sale del censo de Firestore sino del Worker de enlaces. Vacío si su respuesta no llegó. */
export interface UserFilterContext {
  now: number;
  banned: ReadonlySet<string>;
  /** Uids con ajuste individual de cuota. */
  quotaOverrides: ReadonlySet<string>;
  /** Enlaces activos por uid. */
  shareCounts: Readonly<Record<string, number>>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** «Altas de esta semana». */
const NEW_WINDOW_MS = 7 * DAY_MS;
/** Inactivo: la misma ventana con la que el feed corta la actividad (señal `inactive`). */
const INACTIVE_MS = 30 * DAY_MS;

/** Alta conocida o estimada, en ms. 0 si no hay ninguna de las dos. */
export function signupAt(user: Pick<FilterableUser, 'createdAt' | 'estimatedFirstSeenAt'>): number {
  return user.createdAt > 0 ? user.createdAt : user.estimatedFirstSeenAt;
}

function startOfDay(millis: number): number {
  return new Date(millis).setHours(0, 0, 0, 0);
}

function matchesText(user: FilterableUser, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  // Por TODO lo que identifica una fila, no solo por el nick del perfil: a quien lo tiene vacío se le reconoce por
  // el nombre que le dan sus amigos, y el pseudónimo es lo que aparece en el gist y en las entradas del feed.
  return (
    user.displayName.toLowerCase().includes(needle) ||
    user.knownAs.toLowerCase().includes(needle) ||
    user.friendKnownNames.some((known) => known.toLowerCase().includes(needle)) ||
    user.profileId.toLowerCase().includes(needle) ||
    user.uid.toLowerCase().includes(needle) ||
    user.id.toLowerCase().includes(needle)
  );
}

function matchesSignal(user: FilterableUser, signal: AdminSignalFilter): boolean {
  if (signal === 'all') return true;
  if (signal === 'flagged') return user.anomalies.length > 0;
  if (signal === 'severe') return isSevereUser(user);
  return user.anomalies.includes(signal);
}

function matchesActivity(user: FilterableUser, activity: AdminActivityFilter, now: number): boolean {
  if (activity === 'any') return true;
  if (activity === 'inactive') return user.updatedAt <= 0 || now - user.updatedAt > INACTIVE_MS;
  if (user.updatedAt <= 0) return false;
  if (activity === 'today') return user.updatedAt >= startOfDay(now);
  const days = activity === '7' ? 7 : 30;
  return now - user.updatedAt <= days * DAY_MS;
}

function matchesOnly(user: FilterableUser, only: AdminOnlyFilter, context: UserFilterContext): boolean {
  switch (only) {
    case 'new': {
      const at = signupAt(user);
      return at > 0 && context.now - at <= NEW_WINDOW_MS;
    }
    case 'no-friends':
      return user.friends === 0;
    case 'social-off':
      return !user.socialEnabled;
    case 'banned':
      return context.banned.has(user.uid);
    case 'quota':
      return context.quotaOverrides.has(user.uid);
  }
}

export function filterUsers<T extends FilterableUser>(
  users: readonly T[],
  filters: AdminUserFilters,
  context: UserFilterContext,
): T[] {
  return users.filter(
    (user) =>
      matchesText(user, filters.text) &&
      matchesSignal(user, filters.signal) &&
      (filters.tiers.length === 0 || filters.tiers.includes(user.tier)) &&
      matchesActivity(user, filters.activity, context.now) &&
      filters.only.every((only) => matchesOnly(user, only, context)),
  );
}

/** El nombre con el que se identifica una fila (el del perfil o, a falta de él, el de sus amistades). */
export function userLabel(user: Pick<FilterableUser, 'displayName' | 'knownAs'>): string {
  return user.displayName.trim() || user.knownAs.trim();
}

const COLLATOR = new Intl.Collator('es', { sensitivity: 'base' });

export function sortUsers<T extends FilterableUser>(users: readonly T[], sort: AdminUserSort, context: UserFilterContext): T[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  const byKey = (a: T, b: T): number => {
    switch (sort.key) {
      case 'name':
        return COLLATOR.compare(userLabel(a), userLabel(b));
      case 'friends':
        return a.friends - b.friends;
      case 'shares':
        return (context.shareCounts[a.uid] || 0) - (context.shareCounts[b.uid] || 0);
      case 'created':
        return signupAt(a) - signupAt(b);
      case 'activity':
        return a.updatedAt - b.updatedAt;
    }
  };
  const isDefault = sort.key === DEFAULT_USER_SORT.key && sort.dir === DEFAULT_USER_SORT.dir;
  // `sort` es estable: con el mismo valor se respeta el orden del censo.
  return [...users].sort((a, b) => {
    if (isDefault) {
      const severity = Number(isSevereUser(b)) - Number(isSevereUser(a));
      if (severity) return severity;
    }
    return byKey(a, b) * sign;
  });
}

// ─── URL ──────────────────────────────────────────────────────────────────────────────────────────────────────
// Nombres cortos y en castellano, que son los que se leen en la barra de direcciones. Lo que no se reconoce se
// ignora: un enlace viejo o tecleado a mano abre la tabla con menos filtros, nunca rota.

const PARAM = { text: 'q', signal: 'senal', tiers: 'rango', activity: 'activos', only: 'solo', sort: 'orden' } as const;
const SIGNAL_ALIASES: Record<string, AdminSignalFilter> = { con: 'flagged', graves: 'severe' };
const SIGNAL_NAMES: Partial<Record<AdminSignalFilter, string>> = { flagged: 'con', severe: 'graves' };
const ACTIVITY_VALUES: readonly AdminActivityFilter[] = ['today', '7', '30', 'inactive'];
const ACTIVITY_ALIASES: Record<string, AdminActivityFilter> = { hoy: 'today', '7': '7', '30': '30', inactivos: 'inactive' };
const ACTIVITY_NAMES: Record<AdminActivityFilter, string> = { any: '', today: 'hoy', '7': '7', '30': '30', inactive: 'inactivos' };
const ONLY_ALIASES: Record<string, AdminOnlyFilter> = {
  nuevos: 'new',
  'sin-amigos': 'no-friends',
  suspendidos: 'social-off',
  vetados: 'banned',
  cuota: 'quota',
};
const ONLY_NAMES = Object.fromEntries(Object.entries(ONLY_ALIASES).map(([alias, value]) => [value, alias])) as Record<
  AdminOnlyFilter,
  string
>;
const SORT_ALIASES: Record<string, AdminSortKey> = {
  nombre: 'name',
  amigos: 'friends',
  enlaces: 'shares',
  actividad: 'activity',
  alta: 'created',
};
const SORT_NAMES = Object.fromEntries(Object.entries(SORT_ALIASES).map(([alias, value]) => [value, alias])) as Record<
  AdminSortKey,
  string
>;

function list(value: string | null): string[] {
  return (value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

/**
 * Lee los filtros de la dirección. `knownSignals` son los códigos de señal que existen (las claves del catálogo de
 * textos): una señal desconocida no filtra por nada en vez de vaciar la tabla.
 */
export function parseUserFilters(
  params: URLSearchParams,
  knownSignals: readonly AdminAnomaly[],
): { filters: AdminUserFilters; sort: AdminUserSort } {
  const rawSignal = params.get(PARAM.signal) || '';
  const signal: AdminSignalFilter =
    SIGNAL_ALIASES[rawSignal] || (knownSignals.includes(rawSignal as AdminAnomaly) ? (rawSignal as AdminAnomaly) : 'all');
  const tiers = list(params.get(PARAM.tiers)).filter((tier): tier is ProfileTier =>
    (PROFILE_TIERS as readonly string[]).includes(tier),
  );
  const activity = ACTIVITY_ALIASES[params.get(PARAM.activity) || ''] || 'any';
  const only = [...new Set(list(params.get(PARAM.only)).map((item) => ONLY_ALIASES[item]).filter(Boolean))];

  const rawSort = params.get(PARAM.sort) || '';
  const desc = rawSort.startsWith('-');
  const key = SORT_ALIASES[desc ? rawSort.slice(1) : rawSort];
  const sort: AdminUserSort = key ? { key, dir: desc ? 'desc' : 'asc' } : DEFAULT_USER_SORT;

  return {
    filters: { text: params.get(PARAM.text) || '', signal, tiers, activity: ACTIVITY_VALUES.includes(activity) ? activity : 'any', only },
    sort,
  };
}

/** Escribe los filtros en la dirección. Lo que está en su valor de fábrica no se escribe: la URL limpia es la normal. */
export function serializeUserFilters(filters: AdminUserFilters, sort: AdminUserSort): URLSearchParams {
  const params = new URLSearchParams();
  // Se escribe TAL CUAL, sin recortar: la caja de búsqueda lee de aquí, y recortarlo se comía el espacio en cuanto
  // se tecleaba («Juan » volvía como «Juan» y no había forma de escribir «Juan Carlos»). Vacío o en blanco, fuera.
  if (filters.text.trim()) params.set(PARAM.text, filters.text);
  if (filters.signal !== 'all') params.set(PARAM.signal, SIGNAL_NAMES[filters.signal] || filters.signal);
  if (filters.tiers.length) params.set(PARAM.tiers, filters.tiers.join(','));
  if (filters.activity !== 'any') params.set(PARAM.activity, ACTIVITY_NAMES[filters.activity]);
  if (filters.only.length) params.set(PARAM.only, filters.only.map((only) => ONLY_NAMES[only]).join(','));
  if (sort.key !== DEFAULT_USER_SORT.key || sort.dir !== DEFAULT_USER_SORT.dir) {
    params.set(PARAM.sort, `${sort.dir === 'desc' ? '-' : ''}${SORT_NAMES[sort.key]}`);
  }
  return params;
}

/** Hay algún filtro puesto (sin contar el orden). */
export function hasActiveFilters(filters: AdminUserFilters): boolean {
  return (
    Boolean(filters.text.trim()) ||
    filters.signal !== 'all' ||
    filters.tiers.length > 0 ||
    filters.activity !== 'any' ||
    filters.only.length > 0
  );
}
