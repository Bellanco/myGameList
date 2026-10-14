// La lógica pura del panel rediseñado (docs/plan-admin-rediseno.md): rutas, filtros en la URL, cifras de la
// comunidad, bandeja de atención y saneado de lo que el panel guarda para sí.
import { describe, expect, it } from 'vitest';
import { adminUserPath, matchAdminPath } from '../../src/core/admin/adminRoutes';
import {
  DEFAULT_USER_FILTERS,
  DEFAULT_USER_SORT,
  filterUsers,
  parseUserFilters,
  serializeUserFilters,
  sortUsers,
  type FilterableUser,
  type UserFilterContext,
} from '../../src/core/admin/userFilters';
import {
  communityTotals,
  friendsDistribution,
  localDayKey,
  previousSnapshot,
  retentionByMonth,
  sanitizeDailySnapshot,
  seriesByDay,
  signupsByWeek,
  type DailySnapshot,
} from '../../src/core/admin/communityStats';
import { buildAttention, capacitySeverity } from '../../src/core/admin/attention';
import { sanitizeLogEntry, sanitizeTodos } from '../../src/model/repository/admin/adminPanelStore';
import { sanitizeHealth } from '../../src/model/repository/adminHealthRepository';
import type { AdminAnomaly } from '../../src/model/types/firestore';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 14, 12, 0, 0).getTime();

function person(overrides: Partial<FilterableUser> = {}): FilterableUser {
  return {
    id: 'uid-a',
    uid: 'uid-a',
    displayName: 'Ada',
    knownAs: '',
    friendKnownNames: [],
    profileId: 'p-ada',
    socialEnabled: true,
    tier: 'bronze',
    updatedAt: NOW - 2 * 3600_000,
    createdAt: NOW - 100 * DAY,
    estimatedFirstSeenAt: 0,
    friends: 2,
    anomalies: [],
    ...overrides,
  };
}

const CONTEXT: UserFilterContext = { now: NOW, banned: new Set(), quotaOverrides: new Set(), shareCounts: {} };
const SIGNALS: AdminAnomaly[] = ['inactive', 'gist-drift', 'legacy-token'];

describe('rutas del panel', () => {
  it('reconoce cada pantalla y la ficha de una persona', () => {
    expect(matchAdminPath('/admin')).toEqual({ screen: 'today', userId: '' });
    expect(matchAdminPath('/admin/')).toEqual({ screen: 'today', userId: '' });
    expect(matchAdminPath('/admin/comunidad')).toEqual({ screen: 'community', userId: '' });
    expect(matchAdminPath(adminUserPath('uid con espacio'))).toEqual({ screen: 'users', userId: 'uid con espacio' });
  });

  it('lo que no existe cae en la portada, como el enrutador de dentro', () => {
    expect(matchAdminPath('/admin/no-existe').screen).toBe('today');
  });
});

describe('filtros de la tabla en la URL', () => {
  it('ida y vuelta: lo que se escribe se lee igual', () => {
    const filters = { text: 'ada', signal: 'severe' as const, tiers: ['silver' as const, 'gold' as const], activity: '7' as const, only: ['no-friends' as const, 'banned' as const] };
    const sort = { key: 'friends' as const, dir: 'desc' as const };
    const params = serializeUserFilters(filters, sort);
    expect(params.toString()).toBe('q=ada&senal=graves&rango=silver%2Cgold&activos=7&solo=sin-amigos%2Cvetados&orden=-amigos');
    expect(parseUserFilters(params, SIGNALS)).toEqual({ filters, sort });
  });

  it('lo de fábrica no ensucia la dirección', () => {
    expect(serializeUserFilters(DEFAULT_USER_FILTERS, DEFAULT_USER_SORT).toString()).toBe('');
  });

  it('un valor desconocido se ignora en vez de vaciar la tabla', () => {
    const { filters, sort } = parseUserFilters(new URLSearchParams('senal=inventada&rango=diamante,gold&activos=ayer&solo=raros&orden=nada'), SIGNALS);
    expect(filters).toEqual({ ...DEFAULT_USER_FILTERS, tiers: ['gold'] });
    expect(sort).toEqual(DEFAULT_USER_SORT);
  });

  it('una señal concreta del catálogo sí se acepta', () => {
    expect(parseUserFilters(new URLSearchParams('senal=gist-drift'), SIGNALS).filters.signal).toBe('gist-drift');
  });
});

describe('filtrar y ordenar usuarios', () => {
  const ada = person();
  const bob = person({ id: 'b', uid: 'b', displayName: 'Bob', tier: 'silver', friends: 0, updatedAt: NOW - 40 * DAY, anomalies: ['inactive'] });
  const cleo = person({ id: 'c', uid: 'c', displayName: 'Cleo', updatedAt: NOW - 3 * DAY, createdAt: NOW - 2 * DAY, anomalies: ['legacy-token'], socialEnabled: false });

  it('combina los filtros', () => {
    const all = [ada, bob, cleo];
    expect(filterUsers(all, { ...DEFAULT_USER_FILTERS, signal: 'flagged' }, CONTEXT)).toEqual([bob, cleo]);
    expect(filterUsers(all, { ...DEFAULT_USER_FILTERS, signal: 'severe' }, CONTEXT)).toEqual([cleo]);
    expect(filterUsers(all, { ...DEFAULT_USER_FILTERS, activity: 'today' }, CONTEXT)).toEqual([ada]);
    expect(filterUsers(all, { ...DEFAULT_USER_FILTERS, activity: 'inactive' }, CONTEXT)).toEqual([bob]);
    expect(filterUsers(all, { ...DEFAULT_USER_FILTERS, only: ['new'] }, CONTEXT)).toEqual([cleo]);
    expect(filterUsers(all, { ...DEFAULT_USER_FILTERS, only: ['no-friends'] }, CONTEXT)).toEqual([bob]);
    expect(filterUsers(all, { ...DEFAULT_USER_FILTERS, only: ['social-off'] }, CONTEXT)).toEqual([cleo]);
    expect(filterUsers(all, { ...DEFAULT_USER_FILTERS, tiers: ['silver'], signal: 'flagged' }, CONTEXT)).toEqual([bob]);
    expect(filterUsers(all, { ...DEFAULT_USER_FILTERS, only: ['banned'] }, { ...CONTEXT, banned: new Set(['b']) })).toEqual([bob]);
  });

  it('busca también por el nombre que le dan sus amigos y por el pseudónimo', () => {
    const sinNick = person({ displayName: '', knownAs: 'Ada la del gist', friendKnownNames: ['Ada la del gist'] });
    expect(filterUsers([sinNick], { ...DEFAULT_USER_FILTERS, text: 'del gist' }, CONTEXT)).toHaveLength(1);
    expect(filterUsers([sinNick], { ...DEFAULT_USER_FILTERS, text: 'P-ADA' }, CONTEXT)).toHaveLength(1);
  });

  it('el orden de fábrica pone lo grave primero y después lo más reciente', () => {
    expect(sortUsers([bob, ada, cleo], DEFAULT_USER_SORT, CONTEXT).map((u) => u.displayName)).toEqual(['Cleo', 'Ada', 'Bob']);
  });

  it('al ordenar por una columna manda solo esa columna', () => {
    expect(sortUsers([bob, ada, cleo], { key: 'name', dir: 'asc' }, CONTEXT).map((u) => u.displayName)).toEqual(['Ada', 'Bob', 'Cleo']);
    const counts = { ...CONTEXT, shareCounts: { b: 3, 'uid-a': 1 } };
    expect(sortUsers([ada, bob, cleo], { key: 'shares', dir: 'desc' }, counts).map((u) => u.displayName)).toEqual(['Bob', 'Ada', 'Cleo']);
  });
});

describe('cifras de la comunidad', () => {
  const users = [
    { tier: 'bronze' as const, socialEnabled: true, updatedAt: NOW - 3600_000, createdAt: NOW - 3 * DAY, estimatedFirstSeenAt: 0, friends: 0, anomalies: [] as AdminAnomaly[] },
    { tier: 'silver' as const, socialEnabled: true, updatedAt: NOW - 5 * DAY, createdAt: NOW - 40 * DAY, estimatedFirstSeenAt: 0, friends: 4, anomalies: ['gist-drift'] as AdminAnomaly[] },
    { tier: 'bronze' as const, socialEnabled: false, updatedAt: NOW - 60 * DAY, createdAt: 0, estimatedFirstSeenAt: NOW - 200 * DAY, friends: 12, anomalies: ['inactive'] as AdminAnomaly[] },
  ];

  it('cuenta activos, altas, gente sin amigos y señales', () => {
    const totals = communityTotals(users, NOW);
    expect(totals).toMatchObject({ profiles: 3, socialEnabled: 2, activeToday: 1, active24h: 1, active7: 2, active30: 2, new7: 1, new30: 1, noFriends: 1, flagged: 2, severe: 1 });
    expect(totals.byTier).toEqual({ bronze: 2, silver: 1, gold: 0, mithril: 0 });
  });

  it('las altas por semana cuadran con «altas 7 días» en la última barra', () => {
    const weeks = signupsByWeek(users, NOW, 12);
    expect(weeks).toHaveLength(12);
    expect(weeks[11].count).toBe(1);
    expect(weeks.reduce((sum, week) => sum + week.count, 0)).toBe(2); // la de hace 200 días queda fuera
  });

  it('retención: de los de cada mes, cuántos han estado activos en 30 días', () => {
    const rows = retentionByMonth(users, NOW, 3);
    expect(rows.map((row) => row.month)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(rows[1]).toEqual({ month: '2026-09', signups: 1, activeNow: 1 });
    expect(rows[2]).toEqual({ month: '2026-10', signups: 1, activeNow: 1 });
  });

  it('reparte los amigos por tramos', () => {
    expect(friendsDistribution(users)).toEqual([1, 0, 0, 1, 0, 1]);
  });

  it('la serie por días deja huecos donde no hubo foto, y la de ayer es la última anterior a hoy', () => {
    const snap = (day: string, active24h: number) => sanitizeDailySnapshot({ day, active24h }) as DailySnapshot;
    const snapshots = [snap(localDayKey(NOW - 2 * DAY), 4), snap(localDayKey(NOW), 7)];
    expect(seriesByDay(snapshots, (s) => s.active24h, NOW, 3).map((p) => p.value)).toEqual([4, null, 7]);
    expect(previousSnapshot(snapshots, NOW)?.active24h).toBe(4);
  });

  it('una foto mal formada no se propaga', () => {
    expect(sanitizeDailySnapshot({ day: 'ayer' })).toBeNull();
    expect(sanitizeDailySnapshot({ day: '2026-10-14', profiles: -3, byTier: { gold: '2' } })).toMatchObject({ profiles: 0, byTier: { gold: 2, bronze: 0 } });
  });
});

describe('bandeja de atención', () => {
  it('ordena por gravedad y no avisa de lo que no sabe', () => {
    const items = buildAttention({
      now: NOW,
      users: [{ id: 'x', anomalies: ['gist-drift'] }, { id: 'y', anomalies: ['legacy-token'] }],
      covers: { spent: 650, cap: 700 },
      premios: { stage: 'open', closesAt: NOW + 2 * DAY },
      dueTodos: 1,
    });
    expect(items.map((item) => item.code)).toEqual(['legacy-token', 'covers', 'gist-drift', 'premios-closing', 'todos-due']);
    expect(buildAttention({ now: NOW })).toEqual([]);
  });

  it('avisa antes de llegar al techo, no al llegar', () => {
    expect(capacitySeverity(600, 1000)).toBeNull();
    expect(capacitySeverity(700, 1000)).toBe('warn');
    expect(capacitySeverity(900, 1000)).toBe('bad');
    expect(capacitySeverity(5, 0)).toBeNull();
  });

  it('los retos lejos del cierre no se anuncian', () => {
    expect(buildAttention({ now: NOW, premios: { stage: 'open', closesAt: NOW + 10 * DAY } })).toEqual([]);
  });
});

describe('lo que el panel guarda para sí', () => {
  it('los pendientes se sanean y se acotan', () => {
    const items = sanitizeTodos({ items: [{ id: 'a', text: '  Revisar  ', due: '2026-10-28' }, { id: 'b', text: '' }, { id: 'c', text: 'x', due: 'mañana' }] });
    expect(items).toEqual([
      { id: 'a', text: 'Revisar', due: '2026-10-28', done: false, createdAt: 0 },
      { id: 'c', text: 'x', due: '', done: false, createdAt: 0 },
    ]);
  });

  it('una entrada del registro solo deshace lo que sabe deshacer', () => {
    expect(sanitizeLogEntry('e1', { kind: 'tier', text: 'Rango', at: 5, undo: { action: 'tier', profileDocId: 'p', tier: 'gold' } })?.undo).toEqual({
      action: 'tier', profileDocId: 'p', tier: 'gold',
    });
    expect(sanitizeLogEntry('e2', { kind: 'delete', text: 'Borrado', undo: { action: 'resucitar', profileDocId: 'p' } })?.undo).toBeNull();
    expect(sanitizeLogEntry('e3', { kind: 'inventado', text: 'x' })).toBeNull();
  });

  it('la respuesta de capacidad descarta medidores sin id o sin techo y no confunde «no se sabe» con cero', () => {
    const health = sanitizeHealth({
      fetchedAt: 1,
      meters: [
        { id: 'kv-writes', source: 'cloudflare', used: 412, limit: 1000, status: 'ok' },
        { id: 'firestore-reads', source: 'firestore', used: null, limit: 50000, status: 'not-configured' },
        { id: 'roto', source: 'cloudflare', used: 1, limit: 0, status: 'ok' },
      ],
    });
    expect(health?.meters.map((meter) => [meter.id, meter.used])).toEqual([['kv-writes', 412], ['firestore-reads', null]]);
  });
});
