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

  // El directorio ya NO exige `socialGistId`. Ese filtro ataba el descubrimiento a que el id se publicara en el
  // perfil, y va a dejar de publicarse: el canal de un amigo se resuelve desde el doc de amistad, y de un no-amigo
  // no se lee gist ninguno. Un perfil sin id entra como index-only (nombre y foto), que es todo lo que se enseña
  // de un desconocido de todas formas.
  it('admite perfiles sin gist social (index-only) y sigue descartando el placeholder', async () => {
    getDocsMock.mockResolvedValueOnce(
      snapshot([
        profileDoc('ada', ts(3_000)),
        { id: 'sin-gist', data: { uid: 'sin-gist', social: { enabled: true }, updatedAt: ts(9_000) } },
        { id: '_placeholder', data: { uid: '_placeholder', social: { gistId: 'x', enabled: true }, updatedAt: ts(9_000) } },
      ]),
    );

    const entries = await listSocialDirectory(50);

    // El orden lo impone el `orderBy` de la consulta, no el cliente: aquí se conserva el del snapshot. Lo que se
    // comprueba es la PERTENENCIA (que `sin-gist` ya no se cae) y que el placeholder nunca entra.
    expect(entries.map((entry) => entry.id)).toEqual(['ada', 'sin-gist']);
    expect(entries.find((entry) => entry.id === 'sin-gist')?.socialGistId).toBe('');
  });

  // DURANTE EL CUTOVER DE IDENTIDAD un mismo uid tiene dos documentos con el social activo: el canónico que crea su
  // navegador y el huérfano legacy, que solo el panel puede retirar. Sin deduplicar, la persona sale dos veces en el
  // directorio y en el descubrimiento hasta que alguien pase por ahí.
  it('un uid con dos documentos sale UNA vez, y gana el canónico (id == uid)', async () => {
    getDocsMock.mockResolvedValueOnce(
      snapshot([
        // El huérfano llega primero (más "reciente" en la consulta) y aun así pierde: el canónico es el bueno.
        { id: 'doc-legacy', data: { uid: 'uid-a', displayName: 'Ada vieja', social: { enabled: true }, updatedAt: ts(9_000) } },
        { id: 'uid-a', data: { uid: 'uid-a', displayName: 'Ada', social: { enabled: true }, updatedAt: ts(1_000) } },
        profileDoc('bob', ts(500)),
      ]),
    );

    const entries = await listSocialDirectory(50);

    expect(entries.map((entry) => entry.id)).toEqual(['uid-a', 'bob']);
    expect(entries[0].displayName).toBe('Ada');
  });

  it('si ninguno de los dos es canónico, gana el más recientemente activo', async () => {
    getDocsMock.mockResolvedValueOnce(
      snapshot([
        { id: 'doc-viejo', data: { uid: 'uid-a', displayName: 'Vieja', social: { enabled: true }, updatedAt: ts(1_000) } },
        { id: 'doc-nuevo', data: { uid: 'uid-a', displayName: 'Nueva', social: { enabled: true }, updatedAt: ts(8_000) } },
      ]),
    );

    const entries = await listSocialDirectory(50);

    expect(entries.map((entry) => entry.id)).toEqual(['doc-nuevo']);
  });

  it('un perfil con el social DESACTIVADO sigue fuera del directorio', async () => {
    getDocsMock.mockResolvedValueOnce(
      snapshot([
        profileDoc('ada', ts(3_000)),
        { id: 'apagado', data: { uid: 'apagado', social: { gistId: 'g', enabled: false }, updatedAt: ts(9_000) } },
      ]),
    );

    const entries = await listSocialDirectory(50);

    expect(entries.map((entry) => entry.id)).toEqual(['ada']);
  });
});

// El rango vive SOLO en Firestore (lo asigna el admin; el dueño no puede escribirlo). Si el directorio no lo
// trajera, las tarjetas del hub pintarían a todo el mundo de bronce, que es justo lo que pasó al principio.
describe('directorio social — rango del perfil', () => {
  beforeEach(() => {
    invalidateSocialDirectoryCache();
    getDocsMock.mockReset();
  });

  it('trae el `tier` de cada perfil', async () => {
    getDocsMock.mockResolvedValueOnce(
      snapshot([
        profileDoc('ada', ts(3_000), { tier: 'gold' }),
        profileDoc('bob', ts(2_000), { tier: 'mithril' }),
        profileDoc('cid', ts(1_000)), // sin campo → bronce
      ]),
    );

    const entries = await listSocialDirectory(50);

    expect(entries.map((entry) => entry.tier)).toEqual(['gold', 'mithril', 'bronze']);
  });

  it('un rango desconocido en el documento se degrada a bronce', async () => {
    getDocsMock.mockResolvedValueOnce(snapshot([profileDoc('ada', ts(1), { tier: 'adamantium' })]));

    const entries = await listSocialDirectory(50);

    expect(entries[0].tier).toBe('bronze');
  });
});

// Contraparte del test de reglas "puede escribir `social.tier`, pero es un campo que nadie lee": el allowlist de
// las reglas solo controla las claves de PRIMER NIVEL, así que dentro de `social` el dueño escribe lo que quiera.
// Que eso no le sirva para falsear su rango depende de que el lector use siempre el campo de primer nivel.
describe('directorio social — el rango no se puede falsear desde el documento', () => {
  beforeEach(() => {
    invalidateSocialDirectoryCache();
    getDocsMock.mockReset();
  });

  it('ignora un `social.tier` inyectado por el dueño', async () => {
    getDocsMock.mockResolvedValueOnce(
      snapshot([
        {
          id: 'ada',
          data: {
            uid: 'ada',
            displayName: 'ADA',
            photoURL: '',
            social: { gistId: 'ada-social', enabled: true, tier: 'mithril' },
            updatedAt: ts(1_000),
          },
        },
      ]),
    );

    const entries = await listSocialDirectory(50);

    expect(entries[0].tier).toBe('bronze');
  });

  it('el rango de primer nivel manda sobre cualquier `social.tier`', async () => {
    getDocsMock.mockResolvedValueOnce(
      snapshot([profileDoc('ada', ts(1_000), { tier: 'silver', social: { gistId: 'ada-social', enabled: true, tier: 'mithril' } })]),
    );

    const entries = await listSocialDirectory(50);

    expect(entries[0].tier).toBe('silver');
  });
});
