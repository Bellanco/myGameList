import { beforeEach, describe, expect, it, vi } from 'vitest';

// El directorio social se ordenaba de hecho por id de documento: `where(documentId(), '!=', '_placeholder')` es
// una desigualdad, y Firestore obliga a ordenar PRIMERO por el campo de la desigualdad. Con `limit(N)` eso daba
// "los N perfiles con uid alfabéticamente menor", así que al pasar de N perfiles los nuevos quedaban fuera de
// forma arbitraria y permanente. Ahora se ordena por `updatedAt` (uso reciente).

const getDocsMock = vi.fn();
const queryMock = vi.fn((...args: unknown[]) => args);
const whereMock = vi.fn((...args: unknown[]) => ({ kind: 'where', args }));
const orderByMock = vi.fn((...args: unknown[]) => ({ kind: 'orderBy', args }));
const limitMock = vi.fn((...args: unknown[]) => ({ kind: 'limit', args }));
const documentIdMock = vi.fn(() => '__name__');

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ firestore: {} })),
  isPermissionDeniedError: (error: unknown) =>
    Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'permission-denied'),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  query: (...args: unknown[]) => queryMock(...args),
  where: (...args: unknown[]) => whereMock(...args),
  orderBy: (...args: unknown[]) => orderByMock(...args),
  limit: (...args: unknown[]) => limitMock(...args),
  documentId: () => documentIdMock(),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
}));

import { invalidateSocialDirectoryCache, listSocialDirectory } from '../../src/model/repository/firebaseSocialRepository';

function snapshot(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return { docs: docs.map((entry) => ({ id: entry.id, data: () => entry.data })) };
}

function profileDoc(id: string, updatedAt: unknown, extra: Record<string, unknown> = {}) {
  return {
    id,
    data: {
      uid: id,
      email: `${id}@x.com`,
      displayName: id.toUpperCase(),
      photoURL: '',
      social: { gistId: `${id}-social`, gamesGistId: `${id}-games`, enabled: true },
      updatedAt,
      ...extra,
    },
  };
}

/** Timestamp de Firestore (tiene `toMillis`), que es como llega el campo en producción. */
function ts(millis: number) {
  return { toMillis: () => millis };
}

beforeEach(() => {
  getDocsMock.mockReset();
  queryMock.mockClear();
  whereMock.mockClear();
  orderByMock.mockClear();
  documentIdMock.mockClear();
  invalidateSocialDirectoryCache();
});

describe('listSocialDirectory — orden por uso reciente', () => {
  it('consulta ordenando por updatedAt desc y sin desigualdad sobre documentId', async () => {
    getDocsMock.mockResolvedValueOnce(snapshot([profileDoc('ada', ts(2_000))]));

    await listSocialDirectory(50);

    expect(orderByMock).toHaveBeenCalledWith('updatedAt', 'desc');
    expect(limitMock).toHaveBeenCalledWith(50);
    // La igualdad sobre social.enabled ya excluye al placeholder (no tiene el campo): no hace falta la
    // desigualdad sobre el id, que era la que forzaba el orden por `__name__`.
    expect(whereMock).toHaveBeenCalledWith('social.enabled', '==', true);
    expect(documentIdMock).not.toHaveBeenCalled();
  });

  it('expone updatedAt en ms, tanto si viene como Timestamp como si viene numérico', async () => {
    getDocsMock.mockResolvedValueOnce(
      snapshot([profileDoc('ada', ts(5_000)), profileDoc('bob', 4_000), profileDoc('cid', undefined)]),
    );

    const entries = await listSocialDirectory(50);

    expect(entries.map((entry) => [entry.id, entry.updatedAt])).toEqual([
      ['ada', 5_000],
      ['bob', 4_000],
      ['cid', 0], // sin marca → 0 (recencia desconocida: el feed no corta por ignorancia)
    ]);
  });

  it('si falta el índice compuesto, degrada a la consulta sin orden en vez de dejar el hub sin directorio', async () => {
    const missingIndex = Object.assign(new Error('The query requires an index.'), { code: 'failed-precondition' });
    getDocsMock.mockRejectedValueOnce(missingIndex);
    getDocsMock.mockResolvedValueOnce(snapshot([profileDoc('ada', ts(1_000))]));

    const entries = await listSocialDirectory(50);

    expect(entries.map((entry) => entry.id)).toEqual(['ada']);
    expect(getDocsMock).toHaveBeenCalledTimes(2);
  });

  it('descarta perfiles sin gist social y el placeholder', async () => {
    getDocsMock.mockResolvedValueOnce(
      snapshot([
        profileDoc('ada', ts(3_000)),
        { id: 'sin-gist', data: { uid: 'sin-gist', social: { enabled: true }, updatedAt: ts(9_000) } },
        { id: '_placeholder', data: { uid: '_placeholder', social: { gistId: 'x', enabled: true }, updatedAt: ts(9_000) } },
      ]),
    );

    const entries = await listSocialDirectory(50);

    expect(entries.map((entry) => entry.id)).toEqual(['ada']);
  });
});
