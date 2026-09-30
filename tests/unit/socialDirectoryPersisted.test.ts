import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROFILE_TIER_DIRECTORY_TTL_MS,
  PROFILE_TIER_FEED_TTL_MS,
  PROFILE_TIER_PREMIOS_PROFILES_TTL_MS,
  PROFILE_TIERS,
} from '../../src/core/constants/tiers';

/**
 * LA COPIA PERSISTENTE DE LA CONSULTA DEL DIRECTORIO. Firestore cobra una lectura por perfil devuelto (hasta 50, o
 * 60 en premios), y esa consulta se repetía cada vez que caducaba el feed o en cada visita a la clasificación
 * (ver `docs/plan-capacidad-gratuita.md`).
 */
const getDocsMock = vi.fn();

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ firestore: {} })),
  isPermissionDeniedError: () => false,
}));

vi.mock('firebase/firestore/lite', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  query: vi.fn((...args: unknown[]) => args),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
}));

// IndexedDB en memoria: sobrevive a `vi.resetModules()`, que es como se simula una recarga de la página.
const persisted = new Map<number, { entries: unknown[]; cachedAt: number }>();
vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  getCachedDirectoryQuery: async (limit: number) => persisted.get(limit) ?? null,
  putCachedDirectoryQuery: async (limit: number, entries: unknown[], cachedAt: number) => {
    persisted.set(limit, { entries: structuredClone(entries), cachedAt });
  },
  invalidateCachedDirectoryQueries: async () => {
    persisted.clear();
  },
}));

const AHORA = Date.parse('2026-09-30T12:00:00.000Z');
const DOS_HORAS = PROFILE_TIER_DIRECTORY_TTL_MS.bronze;

const perfiles = {
  docs: [
    {
      id: 'ana',
      data: () => ({ uid: 'ana', displayName: 'Ana', social: { enabled: true, gistId: 'g' }, updatedAt: AHORA - 1000 }),
    },
  ],
};

async function recargar() {
  vi.resetModules();
  return import('../../src/model/repository/firebaseSocialRepository');
}

beforeEach(() => {
  vi.useFakeTimers({ now: AHORA, toFake: ['Date'] });
  getDocsMock.mockReset();
  getDocsMock.mockResolvedValue(perfiles);
  persisted.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('directorio social · copia en IndexedDB', () => {
  it('tras una recarga, dentro de la edad que se pide, no vuelve a Firestore', async () => {
    let repo = await recargar();
    await repo.listSocialDirectory(50, { maxAgeMs: DOS_HORAS });

    vi.setSystemTime(AHORA + DOS_HORAS - 60_000);
    repo = await recargar();
    const entries = await repo.listSocialDirectory(50, { maxAgeMs: DOS_HORAS });

    expect(getDocsMock).toHaveBeenCalledTimes(1);
    expect(entries.map((entry) => entry.uid)).toEqual(['ana']);
  });

  it('pasada esa edad vuelve a leer', async () => {
    let repo = await recargar();
    await repo.listSocialDirectory(50, { maxAgeMs: DOS_HORAS });

    vi.setSystemTime(AHORA + DOS_HORAS);
    repo = await recargar();
    await repo.listSocialDirectory(50, { maxAgeMs: DOS_HORAS });

    expect(getDocsMock).toHaveBeenCalledTimes(2);
  });

  // Quien no pasa edad se queda como antes: solo la caché de 30 s en memoria.
  it('sin `maxAgeMs` no usa la copia persistente', async () => {
    let repo = await recargar();
    await repo.listSocialDirectory(50, { maxAgeMs: DOS_HORAS });

    repo = await recargar();
    await repo.listSocialDirectory(50);

    expect(getDocsMock).toHaveBeenCalledTimes(2);
  });

  it('`forceRefresh` se la salta', async () => {
    const repo = await recargar();
    await repo.listSocialDirectory(50, { maxAgeMs: DOS_HORAS });
    await repo.listSocialDirectory(50, { maxAgeMs: DOS_HORAS, forceRefresh: true });

    expect(getDocsMock).toHaveBeenCalledTimes(2);
  });

  // Lo tuyo se ve al momento: cada escritura de tu perfil invalida, y la copia vieja deja de valer también tras
  // recargar, porque se borra de IndexedDB.
  it('invalidar tira también la copia persistente', async () => {
    let repo = await recargar();
    await repo.listSocialDirectory(50, { maxAgeMs: DOS_HORAS });

    vi.setSystemTime(AHORA + 1000);
    repo.invalidateSocialDirectoryCache();
    expect(persisted.size).toBe(0);

    repo = await recargar();
    await repo.listSocialDirectory(50, { maxAgeMs: DOS_HORAS });
    expect(getDocsMock).toHaveBeenCalledTimes(2);
  });

  it('cada tamaño de consulta tiene su copia (el feed pide 50; premios, 60)', async () => {
    const repo = await recargar();
    await repo.listSocialDirectory(50, { maxAgeMs: DOS_HORAS });
    await repo.listSocialDirectory(60, { maxAgeMs: DOS_HORAS });

    expect(getDocsMock).toHaveBeenCalledTimes(2);
    expect([...persisted.keys()].sort()).toEqual([50, 60]);
  });
});

describe('edades por rango (decisión del 30-09-2026)', () => {
  it('directorio: 2 h bronce, 1 h 30 plata, 1 h oro, 30 min mithril', () => {
    expect(PROFILE_TIER_DIRECTORY_TTL_MS).toEqual({
      bronze: 2 * 3_600_000,
      silver: 90 * 60_000,
      gold: 3_600_000,
      mithril: 30 * 60_000,
    });
  });

  it('premios: 6 h bronce, 4 h plata, 2 h oro, 30 min mithril', () => {
    expect(PROFILE_TIER_PREMIOS_PROFILES_TTL_MS).toEqual({
      bronze: 6 * 3_600_000,
      silver: 4 * 3_600_000,
      gold: 2 * 3_600_000,
      mithril: 30 * 60_000,
    });
  });

  // Un rango más alto nunca ve datos más viejos que uno más bajo, y el directorio nunca refresca más a menudo que
  // el feed (entonces no ahorraría nada).
  it('van de más a menos con el rango, y nunca por debajo del feed', () => {
    for (const tabla of [PROFILE_TIER_DIRECTORY_TTL_MS, PROFILE_TIER_PREMIOS_PROFILES_TTL_MS]) {
      const edades = PROFILE_TIERS.map((tier) => tabla[tier]);
      expect([...edades].sort((a, b) => b - a)).toEqual(edades);
    }
    for (const tier of PROFILE_TIERS) {
      expect(PROFILE_TIER_DIRECTORY_TTL_MS[tier]).toBeGreaterThanOrEqual(PROFILE_TIER_FEED_TTL_MS[tier]);
    }
  });
});
