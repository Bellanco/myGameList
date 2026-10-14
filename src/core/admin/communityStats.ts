// LAS CIFRAS DE LA COMUNIDAD, sacadas del censo que el panel ya se descarga (docs/plan-admin-rediseno.md, F3-F4).
//
// Ninguna cuesta una lectura más: son cuentas sobre las filas de `profiles` y sus amistades. Lo que el censo NO
// puede decir se dice aquí también, para que nadie lo invente en la vista:
//
//   - `updatedAt` es la ÚLTIMA actividad, no un historial. «Activos hoy» es exacto; «activos el martes pasado» no
//     se puede reconstruir. Para la gráfica por días está la FOTO DIARIA (`DailySnapshot`), que guarda estas mismas
//     cifras una vez al día y que solo existe desde que se empezó a tomar.
//   - Sin historial no hay curvas de retención por semana. Lo honesto es «de los que se dieron de alta en ese mes,
//     cuántos han estado activos en los últimos 30 días» (`retentionByMonth`).
//
// Puro: ni React ni Firestore.
import { PROFILE_TIERS, type ProfileTier } from '../constants/tiers';
import { isSevereUser, signupAt } from './userFilters';
import type { AdminAnomaly } from '../../model/types/firestore';

export interface CommunityUser {
  tier: ProfileTier;
  socialEnabled: boolean;
  updatedAt: number;
  createdAt: number;
  estimatedFirstSeenAt: number;
  friends: number;
  anomalies: AdminAnomaly[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfLocalDay(millis: number): number {
  return new Date(millis).setHours(0, 0, 0, 0);
}

/** `AAAA-MM-DD` del día LOCAL: es la clave de la foto diaria y el día que se lee en la pantalla. */
export function localDayKey(millis: number): string {
  const date = new Date(millis);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface CommunityTotals {
  profiles: number;
  socialEnabled: number;
  /** Con actividad desde las 00:00 de hoy (hora local). */
  activeToday: number;
  /** Con actividad en las últimas 24 horas: lo que guarda la foto diaria, que se toma a cualquier hora. */
  active24h: number;
  active7: number;
  active30: number;
  /** Altas (selladas o estimadas) en los últimos 7 y 30 días. */
  new7: number;
  new30: number;
  noFriends: number;
  flagged: number;
  severe: number;
  byTier: Record<ProfileTier, number>;
}

export function communityTotals(users: readonly CommunityUser[], now: number): CommunityTotals {
  const today = startOfLocalDay(now);
  const within = (millis: number, ms: number) => millis > 0 && now - millis <= ms;
  const byTier = Object.fromEntries(PROFILE_TIERS.map((tier) => [tier, 0])) as Record<ProfileTier, number>;
  let socialEnabled = 0, activeToday = 0, active24h = 0, active7 = 0, active30 = 0;
  let new7 = 0, new30 = 0, noFriends = 0, flagged = 0, severe = 0;
  for (const user of users) {
    byTier[user.tier] += 1;
    if (user.socialEnabled) socialEnabled += 1;
    if (user.updatedAt >= today && user.updatedAt <= now + DAY_MS) activeToday += 1;
    if (within(user.updatedAt, DAY_MS)) active24h += 1;
    if (within(user.updatedAt, 7 * DAY_MS)) active7 += 1;
    if (within(user.updatedAt, 30 * DAY_MS)) active30 += 1;
    const signup = signupAt(user);
    if (within(signup, 7 * DAY_MS)) new7 += 1;
    if (within(signup, 30 * DAY_MS)) new30 += 1;
    if (user.friends === 0) noFriends += 1;
    if (user.anomalies.length > 0) flagged += 1;
    if (isSevereUser(user)) severe += 1;
  }
  return { profiles: users.length, socialEnabled, activeToday, active24h, active7, active30, new7, new30, noFriends, flagged, severe, byTier };
}

/**
 * Altas por semana, las `weeks` últimas (la más antigua primero). Cada semana termina en `now` menos un múltiplo
 * de 7 días, así que la última es «los últimos 7 días» y cuadra con `new7`.
 */
export function signupsByWeek(users: readonly CommunityUser[], now: number, weeks = 12): Array<{ end: number; count: number }> {
  const buckets = Array.from({ length: weeks }, (_, index) => ({ end: now - (weeks - 1 - index) * 7 * DAY_MS, count: 0 }));
  for (const user of users) {
    const signup = signupAt(user);
    if (signup <= 0 || signup > now) continue;
    const weeksAgo = Math.floor((now - signup) / (7 * DAY_MS));
    if (weeksAgo < weeks) buckets[weeks - 1 - weeksAgo].count += 1;
  }
  return buckets;
}

/**
 * De los que se dieron de alta cada mes (los `months` últimos, el más antiguo primero), cuántos han estado activos
 * en los últimos 30 días. Es la única «retención» que el censo puede decir sin inventar.
 */
export function retentionByMonth(
  users: readonly CommunityUser[],
  now: number,
  months = 6,
): Array<{ month: string; signups: number; activeNow: number }> {
  const base = new Date(now);
  const rows = Array.from({ length: months }, (_, index) => {
    const date = new Date(base.getFullYear(), base.getMonth() - (months - 1 - index), 1);
    return {
      key: `${date.getFullYear()}-${date.getMonth()}`,
      // A mano y no con `toISOString`: la medianoche local del día 1 es aún el mes anterior en UTC al este de Greenwich.
      month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      signups: 0,
      activeNow: 0,
    };
  });
  const byKey = new Map(rows.map((row) => [row.key, row]));
  for (const user of users) {
    const signup = signupAt(user);
    if (signup <= 0) continue;
    const date = new Date(signup);
    const row = byKey.get(`${date.getFullYear()}-${date.getMonth()}`);
    if (!row) continue;
    row.signups += 1;
    if (user.updatedAt > 0 && now - user.updatedAt <= 30 * DAY_MS) row.activeNow += 1;
  }
  return rows.map(({ month, signups, activeNow }) => ({ month, signups, activeNow }));
}

/** Reparto de amigos por persona, en tramos: 0, 1, 2, 3–5, 6–9, 10 o más. */
export const FRIEND_BUCKETS = [
  { label: '0', min: 0, max: 0 },
  { label: '1', min: 1, max: 1 },
  { label: '2', min: 2, max: 2 },
  { label: '3–5', min: 3, max: 5 },
  { label: '6–9', min: 6, max: 9 },
  { label: '10+', min: 10, max: Infinity },
] as const;

export function friendsDistribution(users: readonly CommunityUser[]): number[] {
  return FRIEND_BUCKETS.map(({ min, max }) => users.filter((user) => user.friends >= min && user.friends <= max).length);
}

/**
 * LA FOTO DIARIA: las cifras del censo de un día, guardadas una vez (la primera vez que el administrador abre el
 * panel ese día). Es lo único que permite pintar «activos por día» y las diferencias con ayer.
 */
export interface DailySnapshot {
  day: string;
  takenAt: number;
  profiles: number;
  active24h: number;
  active7: number;
  active30: number;
  new7: number;
  noFriends: number;
  flagged: number;
  severe: number;
  friendships: number;
  byTier: Record<ProfileTier, number>;
}

export function buildDailySnapshot(totals: CommunityTotals, friendships: number, now: number): DailySnapshot {
  return {
    day: localDayKey(now),
    takenAt: now,
    profiles: totals.profiles,
    active24h: totals.active24h,
    active7: totals.active7,
    active30: totals.active30,
    new7: totals.new7,
    noFriends: totals.noFriends,
    flagged: totals.flagged,
    severe: totals.severe,
    friendships,
    byTier: totals.byTier,
  };
}

/** Lo que venga raro de Firestore no se propaga: o una foto entera, o `null`. */
export function sanitizeDailySnapshot(raw: unknown): DailySnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const day = String(data.day || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const count = (value: unknown) => Math.max(0, Math.floor(Number(value)) || 0);
  const tiers = (data.byTier && typeof data.byTier === 'object' ? data.byTier : {}) as Record<string, unknown>;
  return {
    day,
    takenAt: count(data.takenAt),
    profiles: count(data.profiles),
    active24h: count(data.active24h),
    active7: count(data.active7),
    active30: count(data.active30),
    new7: count(data.new7),
    noFriends: count(data.noFriends),
    flagged: count(data.flagged),
    severe: count(data.severe),
    friendships: count(data.friendships),
    byTier: Object.fromEntries(PROFILE_TIERS.map((tier) => [tier, count(tiers[tier])])) as Record<ProfileTier, number>,
  };
}

/**
 * La serie de un dato por días, de `days` días hasta hoy (el más antiguo primero). Los días sin foto son `null`:
 * la gráfica los deja en blanco en vez de unirlos con una recta que inventaría los valores de en medio.
 */
export function seriesByDay(
  snapshots: readonly DailySnapshot[],
  pick: (snapshot: DailySnapshot) => number,
  now: number,
  days = 90,
): Array<{ day: string; value: number | null }> {
  const byDay = new Map(snapshots.map((snapshot) => [snapshot.day, snapshot]));
  return Array.from({ length: days }, (_, index) => {
    const day = localDayKey(now - (days - 1 - index) * DAY_MS);
    const snapshot = byDay.get(day);
    return { day, value: snapshot ? pick(snapshot) : null };
  });
}

/** La foto de ayer (o la más reciente anterior a hoy), para las diferencias de la portada. */
export function previousSnapshot(snapshots: readonly DailySnapshot[], now: number): DailySnapshot | null {
  const today = localDayKey(now);
  return [...snapshots].filter((snapshot) => snapshot.day < today).sort((a, b) => b.day.localeCompare(a.day))[0] || null;
}
