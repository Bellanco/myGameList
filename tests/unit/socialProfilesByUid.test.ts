import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INACTIVE_PROFILE_MAX_AGE_MS, PROFILE_INACTIVITY_MS } from '../../src/core/constants/socialActivity';

// EL FEED LEE A TUS AMIGOS, NO A LOS 50 MÁS RECIENTES (docs/plan-directorio-amigos.md, fases 2 y 3).
//
// Antes la consulta de los 50 perfiles más recientes se pagaba en cada caducidad del feed, tuviera uno 3 amigos o
// 40. Ahora el feed lee por uid a sus amigos y a sí mismo, con copia por uid, y «Perfiles» hace su propia consulta
// de recientes, con un corte de actividad que va en la propia consulta para que un perfil dormido no cueste.

const getDocMock = vi.fn();
const getDocsMock = vi.fn();
const whereMock = vi.fn((...args: unknown[]) => ({ kind: 'where', args }));
const persisted = new Map<string, { cachedAt: number; entry: unknown }>();
const persistedQueries = new Map<string, { entries: unknown[]; cachedAt: number }>();

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ firestore: {} })),
  isPermissionDeniedError: (error: unknown) =>
    Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'permission-denied'),
}));

vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  getCachedDirectoryQuery: async (key: string | number) => persistedQueries.get(String(key)) ?? null,
  putCachedDirectoryQuery: async () => {},
  invalidateCachedDirectoryQueries: async () => {},
  getCachedDirectoryProfiles: async () => Object.fromEntries(persisted),
  putCachedDirectoryProfiles: async (rows: Record<string, { cachedAt: number; entry: unknown }>) => {
    for (const [uid, row] of Object.entries(rows)) persisted.set(uid, row);
  },
  invalidateCachedDirectoryProfiles: async (uid?: string) => {
    if (uid) persisted.delete(uid);
    else persisted.clear();
  },
}));

vi.mock('firebase/firestore/lite', () => ({
  collection: vi.fn(() => ({})),
  doc: (_db: unknown, collection: string, id: string) => ({ collection, id }),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => whereMock(...args),
  orderBy: (...args: unknown[]) => ({ kind: 'orderBy', args }),
  limit: (...args: unknown[]) => ({ kind: 'limit', args }),
  Timestamp: { fromMillis: (millis: number) => ({ millis }) },
}));

const repo = await import('../../src/model/repository/firebaseSocialRepository');
const { resetFirestoreQuotaForTests } = await import('../../src/model/repository/firestoreQuota');

const AHORA = Date.parse('2026-10-04T12:00:00.000Z');
const MEDIA_HORA = 30 * 60 * 1000;

/** Perfiles de Firestore por uid. Un uid ausente es un documento que no existe. */
let world: Record<string, Record<string, unknown> | 'denied'> = {};

function perfil(uid: string, updatedAt: number, extra: Record<string, unknown> = {}) {
  return { uid, displayName: uid.toUpperCase(), photoURL: '', tier: 'gold', social: { enabled: true }, updatedAt: { toMillis: () => updatedAt }, ...extra };
}

function leidos(): string[] {
  return getDocMock.mock.calls.map(([ref]) => (ref as { id: string }).id);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);
  persisted.clear();
  persistedQueries.clear();
  world = {};
  getDocMock.mockReset();
  getDocMock.mockImplementation(async (ref: { id: string }) => {
    const data = world[ref.id];
    if (data === 'denied') throw Object.assign(new Error('denied'), { code: 'permission-denied' });
    return { id: ref.id, exists: () => Boolean(data), data: () => data };
  });
  getDocsMock.mockReset();
  whereMock.mockClear();
  repo.invalidateSocialDirectoryCache();
  resetFirestoreQuotaForTests();
  return () => vi.useRealTimers();
});

describe('getSocialProfilesByUid — lo que el feed lee de Firestore', () => {
  it('lee solo los uids pedidos, uno por perfil, con su rango y su vitrina', async () => {
    world = { me: perfil('me', AHORA), ana: perfil('ana', AHORA, { achievements: { list: 'abc' } }), ajeno: perfil('ajeno', AHORA) };

    const entries = await repo.getSocialProfilesByUid(['me', 'ana'], { maxAgeMs: MEDIA_HORA });

    expect(leidos().sort()).toEqual(['ana', 'me']);
    expect(entries.map((entry) => entry.uid)).toEqual(['me', 'ana']);
    expect(entries[1]).toMatchObject({ tier: 'gold', achievementsMirror: 'abc', updatedAt: AHORA });
  });

  it('dentro de la edad pedida, volver a abrir el feed no lee nada', async () => {
    world = { ana: perfil('ana', AHORA) };
    await repo.getSocialProfilesByUid(['ana'], { maxAgeMs: MEDIA_HORA });
    vi.setSystemTime(AHORA + MEDIA_HORA - 1);
    await repo.getSocialProfilesByUid(['ana'], { maxAgeMs: MEDIA_HORA });
    expect(leidos()).toEqual(['ana']);

    vi.setSystemTime(AHORA + MEDIA_HORA + 1);
    await repo.getSocialProfilesByUid(['ana'], { maxAgeMs: MEDIA_HORA });
    expect(leidos()).toEqual(['ana', 'ana']);
  });

  it('un amigo que lleva más de 30 días sin aparecer se relee como mucho una vez al día', async () => {
    world = { dormido: perfil('dormido', AHORA - PROFILE_INACTIVITY_MS - 1) };
    await repo.getSocialProfilesByUid(['dormido'], { maxAgeMs: MEDIA_HORA });

    vi.setSystemTime(AHORA + 6 * MEDIA_HORA);
    await repo.getSocialProfilesByUid(['dormido'], { maxAgeMs: MEDIA_HORA });
    expect(leidos()).toEqual(['dormido']);

    vi.setSystemTime(AHORA + INACTIVE_PROFILE_MAX_AGE_MS + 1);
    await repo.getSocialProfilesByUid(['dormido'], { maxAgeMs: MEDIA_HORA });
    expect(leidos()).toEqual(['dormido', 'dormido']);
  });

  it('un perfil con el espacio social apagado no sale, y tampoco se relee en cada refresco', async () => {
    world = { apagado: 'denied', viejo: perfil('viejo', AHORA, { social: { enabled: false } }) };

    expect(await repo.getSocialProfilesByUid(['apagado', 'viejo'], { maxAgeMs: MEDIA_HORA })).toEqual([]);
    await repo.getSocialProfilesByUid(['apagado', 'viejo'], { maxAgeMs: MEDIA_HORA });

    expect(leidos().sort()).toEqual(['apagado', 'viejo']);
  });

  it('cambiar tu perfil tira SOLO tu copia: tus amigos no se releen', async () => {
    world = { me: perfil('me', AHORA), ana: perfil('ana', AHORA), bruno: perfil('bruno', AHORA) };
    await repo.getSocialProfilesByUid(['me', 'ana', 'bruno'], { maxAgeMs: MEDIA_HORA });

    repo.invalidateSocialDirectoryCache('me');
    await repo.getSocialProfilesByUid(['me', 'ana', 'bruno'], { maxAgeMs: MEDIA_HORA });

    expect(leidos().filter((uid) => uid !== 'me').sort()).toEqual(['ana', 'bruno']);
    expect(leidos().filter((uid) => uid === 'me')).toHaveLength(2);
  });

  it('sin uid (moderación, borrado de cuenta) se olvidan todos', async () => {
    world = { ana: perfil('ana', AHORA), bruno: perfil('bruno', AHORA) };
    await repo.getSocialProfilesByUid(['ana', 'bruno'], { maxAgeMs: MEDIA_HORA });

    repo.invalidateSocialDirectoryCache();
    await repo.getSocialProfilesByUid(['ana', 'bruno'], { maxAgeMs: MEDIA_HORA });

    expect(leidos()).toHaveLength(4);
  });

  it('forzar («Actualizar») relee aunque la copia sirva', async () => {
    world = { ana: perfil('ana', AHORA) };
    await repo.getSocialProfilesByUid(['ana'], { maxAgeMs: MEDIA_HORA });
    await repo.getSocialProfilesByUid(['ana'], { maxAgeMs: MEDIA_HORA, forceRefresh: true });
    expect(leidos()).toEqual(['ana', 'ana']);
  });

  // docs/plan-degradacion-servicios.md, fase 2: un perfil que no se puede leer porque Firestore no atiende sale de
  // su copia guardada, por vieja que sea; antes rechazaba la lectura de TODOS.
  it('con Firestore sin cuota, cada perfil sale de su copia guardada aunque haya caducado', async () => {
    world = { ana: perfil('ana', AHORA), bruno: perfil('bruno', AHORA) };
    await repo.getSocialProfilesByUid(['ana', 'bruno'], { maxAgeMs: MEDIA_HORA });

    vi.setSystemTime(AHORA + INACTIVE_PROFILE_MAX_AGE_MS * 3);
    getDocMock.mockRejectedValue(Object.assign(new Error('Quota exceeded.'), { code: 'resource-exhausted' }));
    const entries = await repo.getSocialProfilesByUid(['ana', 'bruno'], { maxAgeMs: MEDIA_HORA });

    expect(entries.map((entry) => entry.uid)).toEqual(['ana', 'bruno']);
    // Y lo viejo no se vuelve a guardar como nuevo.
    expect(persisted.get('ana')?.cachedAt).toBe(AHORA);
  });

  it('vista la cuota agotada, no vuelve a preguntar hasta el reinicio: va directo a lo guardado', async () => {
    world = { ana: perfil('ana', AHORA) };
    await repo.getSocialProfilesByUid(['ana'], { maxAgeMs: MEDIA_HORA });
    vi.setSystemTime(AHORA + 2 * MEDIA_HORA);
    getDocMock.mockRejectedValueOnce(Object.assign(new Error('Quota exceeded.'), { code: 'resource-exhausted' }));
    await repo.getSocialProfilesByUid(['ana'], { maxAgeMs: MEDIA_HORA });
    const llamadas = getDocMock.mock.calls.length;

    vi.setSystemTime(AHORA + 4 * MEDIA_HORA);
    const entries = await repo.getSocialProfilesByUid(['ana'], { maxAgeMs: MEDIA_HORA });

    expect(getDocMock.mock.calls.length).toBe(llamadas);
    expect(entries.map((entry) => entry.uid)).toEqual(['ana']);
  });

  it('con Firestore sin cuota y sin copia de nadie, se propaga (la hidratación rescata el feed entero)', async () => {
    getDocMock.mockRejectedValue(Object.assign(new Error('Quota exceeded.'), { code: 'resource-exhausted' }));
    await expect(repo.getSocialProfilesByUid(['ana'], { maxAgeMs: MEDIA_HORA })).rejects.toThrow('Quota exceeded.');
  });

  it('un fallo de red se propaga: el feed sabe rescatar su copia, y una lista a medias no', async () => {
    getDocMock.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }));
    await expect(repo.getSocialProfilesByUid(['ana'], { maxAgeMs: MEDIA_HORA })).rejects.toThrow('offline');
  });
});

describe('listSocialDirectory — los recientes de «Perfiles»', () => {
  function docs(...entries: Array<[string, number]>) {
    return { docs: entries.map(([uid, updatedAt]) => ({ id: uid, data: () => perfil(uid, updatedAt) })) };
  }

  it('el corte de actividad va en la consulta: un perfil dormido no cuesta su lectura', async () => {
    getDocsMock.mockResolvedValueOnce(docs(['ana', AHORA]));

    await repo.listSocialDirectory(34, { activeWithinMs: PROFILE_INACTIVITY_MS });

    const rango = whereMock.mock.calls.find(([field, op]) => field === 'updatedAt' && op === '>=');
    expect(rango?.[2]).toEqual({ millis: AHORA - PROFILE_INACTIVITY_MS });
  });

  it('sin corte, la consulta es la de siempre (premios)', async () => {
    getDocsMock.mockResolvedValueOnce(docs(['ana', AHORA]));
    await repo.listSocialDirectory(60);
    expect(whereMock.mock.calls.some(([field]) => field === 'updatedAt')).toBe(false);
  });

  it('una copia de hace un rato no sirve a quien ha cruzado el corte desde entonces', async () => {
    getDocsMock.mockResolvedValueOnce(docs(['ana', AHORA], ['justo', AHORA - PROFILE_INACTIVITY_MS + 1_000]));
    const opciones = { activeWithinMs: PROFILE_INACTIVITY_MS, maxAgeMs: MEDIA_HORA };
    expect((await repo.listSocialDirectory(34, opciones)).map((entry) => entry.uid)).toEqual(['ana', 'justo']);

    vi.setSystemTime(AHORA + 2_000);
    expect((await repo.listSocialDirectory(34, opciones)).map((entry) => entry.uid)).toEqual(['ana']);
    expect(getDocsMock).toHaveBeenCalledTimes(1);
  });

  it('con Firestore sin cuota, «Perfiles» enseña la última copia en vez de una lista vacía', async () => {
    getDocsMock.mockResolvedValueOnce(docs(['ana', AHORA]));
    await repo.listSocialDirectory(34, { activeWithinMs: PROFILE_INACTIVITY_MS });
    persistedQueries.set('34@' + PROFILE_INACTIVITY_MS, { entries: [{ uid: 'ana', updatedAt: AHORA }], cachedAt: AHORA - 10 * MEDIA_HORA });
    repo.invalidateSocialDirectoryCache();
    getDocsMock.mockRejectedValueOnce(Object.assign(new Error('Quota exceeded.'), { code: 'resource-exhausted' }));

    const entries = await repo.listSocialDirectory(34, { activeWithinMs: PROFILE_INACTIVITY_MS });

    expect(entries.map((entry) => entry.uid)).toEqual(['ana']);
  });

  it('la copia con corte y la de premios son distintas aunque el tope coincidiera', async () => {
    getDocsMock.mockResolvedValue(docs(['ana', AHORA]));
    await repo.listSocialDirectory(34, { activeWithinMs: PROFILE_INACTIVITY_MS });
    await repo.listSocialDirectory(34);
    expect(getDocsMock).toHaveBeenCalledTimes(2);
  });
});
