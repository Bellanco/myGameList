import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock de la capa Firestore: getMyFriendships solo necesita initializeFirebaseServices + getDocs.
const getDocsMock = vi.fn();
const deleteDocMock = vi.fn();
const updateDocMock = vi.fn((..._args: unknown[]) => Promise.resolve());
const setDocMock = vi.fn((..._args: unknown[]) => Promise.resolve());
const docMock = vi.fn((...args: unknown[]) => ({ id: String(args[2] ?? ''), collection: String(args[1] ?? '') }));
const getDocMock = vi.fn();
const limitMock = vi.fn((value: number) => ({ limit: value }));

// El saneado escribe en LOTES. El mock registra las operaciones para poder afirmar sobre ellas igual que antes se
// afirmaba sobre `updateDoc`, y `batchCommitMock` permite simular un lote que las reglas rechazan.
const batchUpdateMock = vi.fn((..._args: unknown[]) => undefined);
const batchSetMock = vi.fn((..._args: unknown[]) => undefined);
const batchCommitMock = vi.fn(() => Promise.resolve());
const writeBatchMock = vi.fn(() => ({ update: batchUpdateMock, set: batchSetMock, commit: batchCommitMock }));

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ firestore: {} })),
  isPermissionDeniedError: (error: unknown) =>
    Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'permission-denied'),
}));

// Huella de identidad: vive en IndexedDB. Se simula con un objeto mutable para poder afirmar qué se sella y cuándo.
let localMeta: Record<string, unknown> | null = null;
const patchLocalMetaMock = vi.fn(async (patch: Record<string, unknown>) => {
  localMeta = { ...(localMeta || {}), ...patch };
});
// La copia persistente de mis amistades, también en memoria: sobrevive a `vi.resetModules()`, que es como se simula
// una recarga de la página (el módulo pierde su caché en memoria; IndexedDB no).
const persistedFriendships = new Map<string, { value: unknown; cachedAt: number }>();
vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  getLocalMeta: async () => localMeta,
  patchLocalMeta: (patch: Record<string, unknown>) => patchLocalMetaMock(patch),
  getCachedMyFriendships: async (uid: string) => persistedFriendships.get(uid) ?? null,
  putCachedMyFriendships: async (uid: string, value: unknown, cachedAt: number) => {
    persistedFriendships.set(uid, { value: structuredClone(value), cachedAt });
  },
  invalidateCachedMyFriendships: async (uid: string) => {
    persistedFriendships.delete(uid);
  },
}));

const trackAnalyticsEventMock = vi.fn(async () => undefined);
vi.mock('../../src/model/repository/telemetryRepository', () => ({
  trackAnalyticsEvent: (...args: unknown[]) => trackAnalyticsEventMock(...(args as [])),
}));

vi.mock('firebase/firestore/lite', () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn((...args: unknown[]) => args),
  where: vi.fn((...args: unknown[]) => args),
  limit: (value: number) => limitMock(value),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  doc: (...args: unknown[]) => docMock(...args),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  writeBatch: (...args: unknown[]) => writeBatchMock(...(args as [])),
}));

import {
  acceptFriendRequest,
  claimRequesterKeys,
  deleteFriendship,
  friendshipDocId,
  getMyFriendships,
  haveFriendshipEdgesChanged,
  healOwnFriendshipIdentity,
  invalidateMyFriendshipsCache,
  MY_FRIENDSHIPS_REQUESTS_MAX_AGE_MS,
  sendFriendRequest,
} from '../../src/model/repository/firebaseFriendshipRepository';
import type { FriendshipView } from '../../src/model/types/social';

function snapshot(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return { docs: docs.map((d) => ({ id: d.id, data: () => d.data })) };
}

/** Lo que se escribió con `batch.set`, en la forma `{ collection, docId, data }`. */
function batchedSets(): Array<{ collection: string; docId: string; data: Record<string, unknown> }> {
  return batchSetMock.mock.calls.map((call) => ({
    collection: (call[0] as { collection: string }).collection,
    docId: (call[0] as { id: string }).id,
    data: call[1] as Record<string, unknown>,
  }));
}

/** Operaciones que el saneado envió en lotes, en la forma `{ docId, fields }`. */
function batchedOps(): Array<{ docId: string; fields: Record<string, unknown> }> {
  return batchUpdateMock.mock.calls.map((call) => ({
    docId: (call[0] as { id: string }).id,
    fields: call[1] as Record<string, unknown>,
  }));
}

function resetAll() {
  getDocsMock.mockReset();
  updateDocMock.mockClear();
  setDocMock.mockClear();
  deleteDocMock.mockReset();
  deleteDocMock.mockImplementation(() => Promise.resolve());
  getDocMock.mockReset();
  getDocMock.mockResolvedValue({ exists: () => false, data: () => undefined });
  batchUpdateMock.mockClear();
  batchSetMock.mockClear();
  batchCommitMock.mockClear();
  batchCommitMock.mockImplementation(() => Promise.resolve());
  writeBatchMock.mockClear();
  patchLocalMetaMock.mockClear();
  trackAnalyticsEventMock.mockClear();
  limitMock.mockClear();
  localMeta = null;
  invalidateMyFriendshipsCache();
  persistedFriendships.clear();
}

describe('friendshipDocId', () => {
  it('es canónico (uids ordenados, independiente del orden de entrada)', () => {
    expect(friendshipDocId('a', 'b')).toBe('a__b');
    expect(friendshipDocId('b', 'a')).toBe('a__b');
  });
});

describe('getMyFriendships', () => {
  beforeEach(resetAll);

  it('categoriza amigos / recibidas / enviadas y extrae el "otro" desde los campos denormalizados', async () => {
    getDocsMock.mockResolvedValueOnce(
      snapshot([
        {
          id: 'me__x',
          data: {
            users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'accepted', updatedAt: 3,
            recipientName: 'X', recipientPhoto: 'px', recipientSocialGistId: 'gsx', recipientGamesGistId: 'ggx',
          },
        },
        {
          id: 'me__y',
          data: { users: ['me', 'y'], requester: 'y', recipient: 'me', status: 'pending', updatedAt: 2, requesterName: 'Y' },
        },
        {
          id: 'me__z',
          data: { users: ['me', 'z'], requester: 'me', recipient: 'z', status: 'pending', updatedAt: 1 },
        },
      ]),
    );

    const result = await getMyFriendships('me');

    expect(result.friends).toHaveLength(1);
    expect(result.friends[0]).toMatchObject({ otherUid: 'x', otherName: 'X', otherSocialGistId: 'gsx', state: 'friends' });
    expect(result.incoming).toHaveLength(1);
    expect(result.incoming[0]).toMatchObject({ otherUid: 'y', otherName: 'Y', state: 'incoming' });
    expect(result.outgoing).toHaveLength(1);
    expect(result.outgoing[0]).toMatchObject({ otherUid: 'z', state: 'outgoing' });
    expect(Object.keys(result.byOtherUid).sort()).toEqual(['x', 'y', 'z']);
  });

  // El saneado de identidad pisa `updatedAt`, así que ordenar la bandeja por ese campo hacía que un amigo que
  // cambiara su nick o su foto le reordenara a uno las peticiones sin haber pasado nada.
  it('ordena las peticiones por la fecha en que se pidieron, no por el sello del documento', async () => {
    getDocsMock.mockResolvedValueOnce(
      snapshot([
        {
          id: 'me__vieja',
          // Petición ANTIGUA cuyo doc se saneó hace nada (updatedAt altísimo).
          data: { users: ['me', 'vieja'], requester: 'vieja', recipient: 'me', status: 'pending', createdAt: 10, updatedAt: 9999 },
        },
        {
          id: 'me__nueva',
          data: { users: ['me', 'nueva'], requester: 'nueva', recipient: 'me', status: 'pending', createdAt: 20, updatedAt: 20 },
        },
      ]),
    );

    const result = await getMyFriendships('me');

    expect(result.incoming.map((view) => view.otherUid)).toEqual(['nueva', 'vieja']);
  });

  it('acota la consulta con un tope duro (sin orderBy, para no exigir índice compuesto)', async () => {
    getDocsMock.mockResolvedValueOnce(snapshot([]));
    await getMyFriendships('me');
    expect(limitMock).toHaveBeenCalledWith(1000);
  });

  it('cachea: una segunda llamada no relee de Firestore hasta invalidar', async () => {
    getDocsMock.mockResolvedValue(snapshot([]));

    await getMyFriendships('me');
    await getMyFriendships('me');
    expect(getDocsMock).toHaveBeenCalledTimes(1);

    invalidateMyFriendshipsCache('me');
    await getMyFriendships('me');
    expect(getDocsMock).toHaveBeenCalledTimes(2);
  });

  it('degrada a vacío si las reglas deniegan la lectura', async () => {
    getDocsMock.mockRejectedValueOnce({ code: 'permission-denied' });
    const result = await getMyFriendships('me');
    expect(result).toEqual({ friends: [], incoming: [], outgoing: [], byOtherUid: {} });
  });
});

/**
 * LA COPIA PERSISTENTE (fase 4 de `docs/plan-capacidad-gratuita.md`). La consulta cuesta una lectura de Firestore
 * por amigo, y antes solo vivía 60 s en memoria: cada recarga con el social abierto la repetía entera.
 */
describe('getMyFriendships · copia en IndexedDB', () => {
  const AHORA = Date.parse('2026-09-30T12:00:00.000Z');
  const amistad = snapshot([
    { id: 'me__x', data: { users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'accepted', recipientName: 'X' } },
  ]);

  /** Una recarga de la página: el módulo vuelve a empezar sin memoria, y lo guardado en IndexedDB sigue ahí. */
  async function recargar() {
    vi.resetModules();
    return import('../../src/model/repository/firebaseFriendshipRepository');
  }

  beforeEach(() => {
    // El reloj ANTES que `resetAll`: su invalidación deja una marca de tiempo, y una lectura anterior a ella no se
    // guarda (ver el último caso).
    vi.useFakeTimers({ now: AHORA, toFake: ['Date'] });
    resetAll();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sobrevive a una recarga: dentro de 15 min no vuelve a Firestore', async () => {
    getDocsMock.mockResolvedValue(amistad);
    await getMyFriendships('me');

    vi.setSystemTime(AHORA + 14 * 60_000);
    const repo = await recargar();
    const result = await repo.getMyFriendships('me');

    expect(getDocsMock).toHaveBeenCalledTimes(1);
    expect(result.friends.map((view) => view.otherUid)).toEqual(['x']);
  });

  it('pasados 15 min vuelve a leer', async () => {
    getDocsMock.mockResolvedValue(amistad);
    await getMyFriendships('me');

    vi.setSystemTime(AHORA + 15 * 60_000);
    const repo = await recargar();
    await repo.getMyFriendships('me');

    expect(getDocsMock).toHaveBeenCalledTimes(2);
  });

  // La pantalla de solicitudes es a donde se va a ver si ha llegado alguna: ahí no vale una copia de hace un rato.
  it('la pantalla de solicitudes no acepta una copia de más de 60 s, y el resto sí', async () => {
    getDocsMock.mockResolvedValue(amistad);
    await getMyFriendships('me');

    vi.setSystemTime(AHORA + 61_000);
    await getMyFriendships('me');
    expect(getDocsMock).toHaveBeenCalledTimes(1);

    await getMyFriendships('me', { maxAgeMs: MY_FRIENDSHIPS_REQUESTS_MAX_AGE_MS });
    expect(getDocsMock).toHaveBeenCalledTimes(2);
  });

  it('invalidar borra también la copia persistente', async () => {
    getDocsMock.mockResolvedValue(amistad);
    await getMyFriendships('me');
    expect(persistedFriendships.has('me')).toBe(true);

    invalidateMyFriendshipsCache('me');
    expect(persistedFriendships.has('me')).toBe(false);
  });

  // Sin salida a la red, lo mismo que hace el directorio: mejor la última copia que un feed sin amigos.
  it('si Firestore falla, sirve la última copia aunque haya caducado', async () => {
    getDocsMock.mockResolvedValueOnce(amistad);
    await getMyFriendships('me');

    vi.setSystemTime(AHORA + 60 * 60_000);
    const repo = await recargar();
    getDocsMock.mockRejectedValueOnce(new Error('sin red'));
    const result = await repo.getMyFriendships('me');

    expect(result.friends.map((view) => view.otherUid)).toEqual(['x']);
  });

  // Una lectura que salió ANTES de aceptar una petición puede no traer la aceptación: no puede quedarse 15 min.
  it('no guarda una lectura que empezó antes de una invalidación', async () => {
    let responder: (value: unknown) => void = () => undefined;
    getDocsMock.mockReturnValueOnce(new Promise((resolve) => { responder = resolve; }));
    const enVuelo = getMyFriendships('me');
    // Hasta que la consulta no ha salido de verdad no hay «lectura en vuelo»: antes se miran las copias.
    await vi.waitFor(() => expect(getDocsMock).toHaveBeenCalledTimes(1));

    // Relativo a «ahora» y no a `AHORA`: `vi.waitFor` adelanta el reloj falso mientras espera.
    vi.setSystemTime(Date.now() + 1);
    invalidateMyFriendshipsCache('me');
    responder(amistad);
    await enVuelo;

    expect(persistedFriendships.has('me')).toBe(false);
    getDocsMock.mockResolvedValueOnce(amistad);
    await getMyFriendships('me');
    expect(getDocsMock).toHaveBeenCalledTimes(2);
  });
});

describe('deleteFriendship', () => {
  beforeEach(resetAll);

  it('trata un doc ya borrado (permission-denied) como éxito idempotente', async () => {
    deleteDocMock.mockRejectedValueOnce({ code: 'permission-denied' });
    await expect(deleteFriendship({ myUid: 'me', docId: 'me__x' })).resolves.toBeUndefined();
  });

  it('propaga errores reales (no permission-denied)', async () => {
    deleteDocMock.mockRejectedValueOnce(new Error('network'));
    await expect(deleteFriendship({ myUid: 'me', docId: 'me__x' })).rejects.toThrow('network');
  });

  it('borra también el depósito de ids, y que no esté no es un error', async () => {
    deleteDocMock
      .mockImplementationOnce(() => Promise.resolve())
      .mockImplementationOnce(() => Promise.reject({ code: 'permission-denied' }));
    await expect(deleteFriendship({ myUid: 'me', docId: 'me__x' })).resolves.toBeUndefined();
    const borrados = deleteDocMock.mock.calls.map((call) => call[0] as { collection: string; id: string });
    expect(borrados).toEqual([
      { collection: 'friendships', id: 'me__x' },
      { collection: 'friendshipKeys', id: 'me__x' },
    ]);
  });
});

// Una arista NUEVA nace con lo que se supiera EN ESE INSTANTE, y varios llamantes pasan `gamesGistId: '' ` sobre
// una configuración que aún se está hidratando. Si la huella siguiera sellada, el saneado no volvería a correr y
// ese amigo se quedaría sin ver mi lista de juegos para siempre.
describe('huella tras crear o aceptar una amistad', () => {
  beforeEach(resetAll);

  it('enviar una petición olvida la huella', async () => {
    localMeta = { friendshipIdentityFingerprint: 'sellada' };
    await sendFriendRequest({ myUid: 'me', otherUid: 'x', self: { name: 'N', photo: 'p', socialGistId: 'gs', gamesGistId: '' } });
    expect(localMeta).toMatchObject({ friendshipIdentityFingerprint: '' });
  });

  it('aceptar una petición olvida la huella', async () => {
    localMeta = { friendshipIdentityFingerprint: 'sellada' };
    await acceptFriendRequest({ myUid: 'me', docId: 'me__x', self: { name: 'N', photo: 'p', socialGistId: 'gs', gamesGistId: '' } });
    expect(localMeta).toMatchObject({ friendshipIdentityFingerprint: '' });
  });
});

// MIS IDS DE GIST NO VIAJAN EN UNA PETICIÓN (09-10-2026). Son la llave de mi biblioteca, y el destinatario lee la
// petición aunque me rechace. Se escriben cuando la amistad está aceptada.
describe('ids de gist en una petición de amistad', () => {
  beforeEach(resetAll);

  it('la petición sale SIN mis ids de gist, y los ids van al depósito en el mismo lote', async () => {
    await sendFriendRequest({ myUid: 'me', otherUid: 'x', self: { name: 'N', photo: 'p', socialGistId: 'gs', gamesGistId: 'gg' } });
    const [peticion, deposito] = batchedSets();
    expect(peticion.collection).toBe('friendships');
    expect(peticion.data).toMatchObject({ requester: 'me', status: 'pending', requesterName: 'N' });
    expect(peticion.data).not.toHaveProperty('requesterSocialGistId');
    expect(peticion.data).not.toHaveProperty('requesterGamesGistId');
    expect(deposito).toMatchObject({
      collection: 'friendshipKeys',
      docId: 'me__x',
      data: { requester: 'me', socialGistId: 'gs', gamesGistId: 'gg' },
    });
    expect(batchCommitMock).toHaveBeenCalledTimes(1);
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('sin la regla del depósito desplegada, la petición sale sola', async () => {
    batchCommitMock.mockImplementationOnce(() => Promise.reject({ code: 'permission-denied' }));
    await sendFriendRequest({ myUid: 'me', otherUid: 'x', self: { name: 'N', photo: 'p', socialGistId: 'gs', gamesGistId: 'gg' } });
    expect(setDocMock).toHaveBeenCalledTimes(1);
    expect(setDocMock.mock.calls[0][1]).not.toHaveProperty('requesterSocialGistId');
  });

  it('un fallo que no es de permisos no se disfraza: llega a quien llama', async () => {
    batchCommitMock.mockImplementationOnce(() => Promise.reject(new Error('network')));
    await expect(
      sendFriendRequest({ myUid: 'me', otherUid: 'x', self: { name: 'N', photo: 'p', socialGistId: 'gs', gamesGistId: 'gg' } }),
    ).rejects.toThrow('network');
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('sin gist social en ese instante no hay depósito que dejar', async () => {
    await sendFriendRequest({ myUid: 'me', otherUid: 'x', self: { name: 'N', photo: 'p', socialGistId: '', gamesGistId: '' } });
    expect(batchSetMock).not.toHaveBeenCalled();
    expect(setDocMock).toHaveBeenCalledTimes(1);
  });

  it('el saneado deja vacíos mis ids en una petición mía pendiente, y limpia los que llevara de antes', async () => {
    getDocsMock.mockResolvedValueOnce(snapshot([{
      id: 'me__x',
      data: {
        users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'pending',
        requesterName: 'N', requesterPhoto: 'p', requesterSocialGistId: 'gs', requesterGamesGistId: 'gg',
      },
    }]));

    await healOwnFriendshipIdentity('me', { name: 'N', photo: 'p', socialGistId: 'gs', gamesGistId: 'gg' }, { force: true });

    expect(batchedOps()).toHaveLength(1);
    expect(batchedOps()[0].fields).toMatchObject({ requesterSocialGistId: '', requesterGamesGistId: '' });
  });

  it('una petición mía pendiente y ya sin ids no se reescribe', async () => {
    getDocsMock.mockResolvedValueOnce(snapshot([{
      id: 'me__x',
      data: { users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'pending', requesterName: 'N', requesterPhoto: 'p' },
    }]));

    await healOwnFriendshipIdentity('me', { name: 'N', photo: 'p', socialGistId: 'gs', gamesGistId: 'gg' }, { force: true });

    expect(batchUpdateMock).not.toHaveBeenCalled();
  });

  it('el saneado deja el depósito de mis peticiones pendientes (las de la 1.6.7 salieron sin él)', async () => {
    getDocsMock.mockResolvedValueOnce(snapshot([
      { id: 'me__x', data: { users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'pending', requesterName: 'N', requesterPhoto: 'p' } },
      { id: 'me__y', data: { users: ['me', 'y'], requester: 'me', recipient: 'y', status: 'accepted', requesterName: 'N', requesterPhoto: 'p', requesterSocialGistId: 'gs', requesterGamesGistId: 'gg' } },
      { id: 'me__z', data: { users: ['me', 'z'], requester: 'z', recipient: 'me', status: 'pending' } },
    ]));

    await healOwnFriendshipIdentity('me', { name: 'N', photo: 'p', socialGistId: 'gs', gamesGistId: 'gg' }, { force: true });

    // Solo la pendiente MÍA: la aceptada ya lleva los ids, y la que me pidieron a mí no es mía.
    expect(batchedSets()).toEqual([{
      collection: 'friendshipKeys',
      docId: 'me__x',
      data: expect.objectContaining({ requester: 'me', socialGistId: 'gs', gamesGistId: 'gg' }),
    }]);
  });

  it('sin gist social conocido, el saneado no pisa el depósito con vacío', async () => {
    getDocsMock.mockResolvedValueOnce(snapshot([
      { id: 'me__x', data: { users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'pending', requesterName: 'N', requesterPhoto: 'p' } },
    ]));

    await healOwnFriendshipIdentity('me', { name: 'N', photo: 'p', socialGistId: '', gamesGistId: '' }, { force: true });

    expect(batchSetMock).not.toHaveBeenCalled();
  });

  it('un depósito rechazado no impide sellar el saneado', async () => {
    getDocsMock.mockResolvedValueOnce(snapshot([
      { id: 'me__x', data: { users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'pending', requesterName: 'N', requesterPhoto: 'p' } },
    ]));
    // El de la amistad no se envía (no diverge); el único lote es el del depósito, y las reglas lo rechazan.
    batchCommitMock.mockImplementationOnce(() => Promise.reject({ code: 'permission-denied' }));

    await healOwnFriendshipIdentity('me', { name: 'N', photo: 'p', socialGistId: 'gs', gamesGistId: 'gg' }, { force: true });

    expect(localMeta).toMatchObject({ friendshipIdentityFingerprint: expect.stringContaining('gs') });
  });

  it('aceptada, el saneado sí escribe mis ids', async () => {
    getDocsMock.mockResolvedValueOnce(snapshot([{
      id: 'me__x',
      data: { users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'accepted', requesterName: 'N', requesterPhoto: 'p' },
    }]));

    await healOwnFriendshipIdentity('me', { name: 'N', photo: 'p', socialGistId: 'gs', gamesGistId: 'gg' }, { force: true });

    expect(batchedOps()[0].fields).toMatchObject({ requesterSocialGistId: 'gs', requesterGamesGistId: 'gg' });
  });

  it('la vista marca la amistad aceptada que pedí yo y aún no lleva mis ids', async () => {
    getDocsMock.mockResolvedValueOnce(snapshot([
      { id: 'me__x', data: { users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'accepted' } },
      { id: 'me__y', data: { users: ['me', 'y'], requester: 'me', recipient: 'y', status: 'accepted', requesterSocialGistId: 'gs' } },
      { id: 'me__z', data: { users: ['me', 'z'], requester: 'z', recipient: 'me', status: 'accepted' } },
    ]));

    const mias = await getMyFriendships('me');

    expect(mias.byOtherUid.x.ownGistIdsMissing).toBe(true);
    expect(mias.byOtherUid.y.ownGistIdsMissing).toBeUndefined();
    // Si la pidió el otro, mis ids los escribí yo al aceptar: no falta nada mío.
    expect(mias.byOtherUid.z.ownGistIdsMissing).toBeUndefined();
  });

  it('y la gemela: la amistad que acepté yo sin los ids de quien me la pidió', async () => {
    getDocsMock.mockResolvedValueOnce(snapshot([
      { id: 'me__x', data: { users: ['me', 'x'], requester: 'x', recipient: 'me', status: 'accepted' } },
      { id: 'me__y', data: { users: ['me', 'y'], requester: 'y', recipient: 'me', status: 'accepted', requesterSocialGistId: 'gsY' } },
      { id: 'me__z', data: { users: ['me', 'z'], requester: 'z', recipient: 'me', status: 'pending' } },
    ]));

    const mias = await getMyFriendships('me');

    expect(mias.byOtherUid.x.otherGistIdsMissing).toBe(true);
    expect(mias.byOtherUid.y.otherGistIdsMissing).toBeUndefined();
    // Pendiente: no le faltan, es que todavía no le tocan.
    expect(mias.byOtherUid.z.otherGistIdsMissing).toBeUndefined();
  });
});

// Fase 0 de docs/plan-historial-amigo-nuevo.md: quien acepta recoge del depósito los ids de quien pidió, así ve su
// historial al momento en vez de esperar a que la otra parte vuelva a entrar.
describe('recogida del depósito al aceptar', () => {
  beforeEach(resetAll);

  const deposito = (data: Record<string, unknown>) => ({ exists: () => true, data: () => data });

  it('aceptar copia a la amistad los ids depositados y borra el depósito', async () => {
    getDocMock.mockResolvedValueOnce(deposito({ requester: 'x', socialGistId: 'gsX', gamesGistId: 'ggX', updatedAt: 1 }));

    await acceptFriendRequest({ myUid: 'me', docId: 'me__x', self: { name: 'N', photo: 'p', socialGistId: 'gs', gamesGistId: 'gg' } });

    const [aceptar, copiar] = updateDocMock.mock.calls;
    expect(aceptar[1]).toMatchObject({ status: 'accepted', recipientSocialGistId: 'gs' });
    expect(copiar[0]).toMatchObject({ collection: 'friendships', id: 'me__x' });
    expect(copiar[1]).toMatchObject({ requesterSocialGistId: 'gsX', requesterGamesGistId: 'ggX' });
    expect(deleteDocMock).toHaveBeenCalledWith({ collection: 'friendshipKeys', id: 'me__x' });
  });

  it('sin depósito legible (petición de la 1.6.7), aceptar sigue funcionando y no copia nada', async () => {
    getDocMock.mockRejectedValueOnce({ code: 'permission-denied' });

    await expect(
      acceptFriendRequest({ myUid: 'me', docId: 'me__x', self: { name: 'N', photo: 'p', socialGistId: 'gs', gamesGistId: 'gg' } }),
    ).resolves.toBeUndefined();

    expect(updateDocMock).toHaveBeenCalledTimes(1); // solo la aceptación
    expect(deleteDocMock).not.toHaveBeenCalled();
  });

  it('un fallo al copiar no tumba la aceptación: lo reintenta la tarea de arranque', async () => {
    getDocMock.mockResolvedValueOnce(deposito({ requester: 'x', socialGistId: 'gsX', gamesGistId: 'ggX', updatedAt: 1 }));
    updateDocMock
      .mockImplementationOnce(() => Promise.resolve())
      .mockImplementationOnce(() => Promise.reject(new Error('network')));

    await expect(
      acceptFriendRequest({ myUid: 'me', docId: 'me__x', self: { name: 'N', photo: 'p', socialGistId: 'gs', gamesGistId: 'gg' } }),
    ).resolves.toBeUndefined();
    // El depósito se conserva para el reintento.
    expect(deleteDocMock).not.toHaveBeenCalled();
  });

  it('claimRequesterKeys cuenta solo las amistades completadas', async () => {
    getDocMock
      .mockResolvedValueOnce(deposito({ requester: 'x', socialGistId: 'gsX', gamesGistId: '', updatedAt: 1 }))
      .mockResolvedValueOnce({ exists: () => false, data: () => undefined })
      .mockResolvedValueOnce(deposito({ requester: 'z', socialGistId: '', gamesGistId: '', updatedAt: 1 }));

    const recogidas = await claimRequesterKeys({ myUid: 'me', docIds: ['me__x', 'me__y', 'me__z'] });

    expect(recogidas).toBe(1);
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    expect(updateDocMock.mock.calls[0][1]).toMatchObject({ requesterSocialGistId: 'gsX', requesterGamesGistId: '' });
  });

  it('propaga un error que no es de permisos', async () => {
    getDocMock.mockRejectedValueOnce(new Error('network'));
    await expect(claimRequesterKeys({ myUid: 'me', docIds: ['me__x'] })).rejects.toThrow('network');
  });
});

describe('healOwnFriendshipIdentity', () => {
  beforeEach(resetAll);

  it('actualiza SOLO mis campos (requester* si soy requester, recipient* si soy recipient)', async () => {
    getDocsMock.mockResolvedValueOnce(
      snapshot([
        { id: 'me__x', data: { users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'accepted' } },
        { id: 'y__me', data: { users: ['me', 'y'], requester: 'y', recipient: 'me', status: 'pending' } },
      ]),
    );

    await healOwnFriendshipIdentity('me', { name: 'MiNick', photo: 'p', socialGistId: 'gs', gamesGistId: 'gg' });

    const ops = batchedOps();
    expect(ops).toHaveLength(2);
    const fieldsFor = (docId: string) => ops.find((op) => op.docId === docId)?.fields ?? {};
    const requesterUpdate = fieldsFor('me__x');
    expect(requesterUpdate).toMatchObject({ requesterName: 'MiNick', requesterSocialGistId: 'gs' });
    expect(Object.keys(requesterUpdate)).not.toContain('recipientName');
    const recipientUpdate = fieldsFor('y__me');
    expect(recipientUpdate).toMatchObject({ recipientName: 'MiNick' });
    expect(Object.keys(recipientUpdate)).not.toContain('requesterName');
  });

  // El gran ahorro: con la identidad sin cambios no se lee NADA. Antes la guarda `diverges` evitaba la escritura
  // pero se pagaba igual la lectura de todos los documentos en cada apertura del hub.
  it('con la huella ya sellada no lee ni escribe nada', async () => {
    getDocsMock.mockResolvedValueOnce(
      snapshot([{ id: 'me__x', data: { users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'accepted' } }]),
    );
    const self = { name: 'MiNick', photo: 'p', socialGistId: 'gs', gamesGistId: 'gg' };

    await healOwnFriendshipIdentity('me', self);
    expect(getDocsMock).toHaveBeenCalledTimes(1);

    await healOwnFriendshipIdentity('me', self);
    expect(getDocsMock).toHaveBeenCalledTimes(1); // ni una lectura más
    expect(batchUpdateMock).toHaveBeenCalledTimes(1);
  });

  // La revisión semanal suele encontrarlo todo al día. Tirar entonces la copia de las amistades costaba otras N
  // lecturas al volver al social, para releer exactamente lo mismo.
  it('si no hay nada que escribir, no tira la copia de las amistades', async () => {
    const alDia = {
      users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'accepted',
      requesterName: 'MiNick', requesterPhoto: 'p', requesterSocialGistId: 'gs', requesterGamesGistId: 'gg',
    };
    getDocsMock.mockResolvedValue(snapshot([{ id: 'me__x', data: alDia }]));
    await getMyFriendships('me');
    expect(getDocsMock).toHaveBeenCalledTimes(1);

    await healOwnFriendshipIdentity('me', { name: 'MiNick', photo: 'p', socialGistId: 'gs', gamesGistId: 'gg' });
    expect(batchUpdateMock).not.toHaveBeenCalled();
    await getMyFriendships('me');

    // La del saneado, y ninguna más: la copia sigue sirviendo.
    expect(getDocsMock).toHaveBeenCalledTimes(2);
  });

  it('y si ha escrito, sí: la siguiente lectura trae lo escrito', async () => {
    getDocsMock.mockResolvedValue(
      snapshot([{ id: 'me__x', data: { users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'accepted' } }]),
    );
    await getMyFriendships('me');
    await healOwnFriendshipIdentity('me', { name: 'MiNick', photo: 'p', socialGistId: 'gs', gamesGistId: 'gg' });
    expect(batchUpdateMock).toHaveBeenCalled();
    await getMyFriendships('me');

    expect(getDocsMock).toHaveBeenCalledTimes(3);
  });

  it('un cambio de nick invalida la huella y vuelve a propagar', async () => {
    const stored = { users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'accepted', requesterName: 'MiNick' };
    getDocsMock.mockResolvedValue(snapshot([{ id: 'me__x', data: stored }]));

    await healOwnFriendshipIdentity('me', { name: 'MiNick', photo: 'p', socialGistId: 'gs', gamesGistId: 'gg' });
    await healOwnFriendshipIdentity('me', { name: 'OtroNick', photo: 'p', socialGistId: 'gs', gamesGistId: 'gg' });

    expect(getDocsMock).toHaveBeenCalledTimes(2);
    expect(batchedOps().at(-1)?.fields).toMatchObject({ requesterName: 'OtroNick' });
  });

  /**
   * EL AGUJERO QUE DEJABA LA HUELLA SOLA. Responde a «¿ha cambiado mi identidad?», y con eso se daba por
   * respondida otra pregunta distinta: «¿están mis amistades al día?». Una amistad creada DESPUÉS del sellado
   * guarda lo que hubiera al aceptarla —un `gamesGistId` aún sin hidratar, por ejemplo— y la huella sigue
   * coincidiendo, así que el saneado salía en su primera línea para siempre: sus amigos le veían con el nick
   * viejo y le leían las listas de un gist abandonado mientras él abría la aplicación a diario.
   */
  it('pasada la ventana de revisión vuelve a comprobar aunque la huella coincida', async () => {
    getDocsMock.mockResolvedValue(
      snapshot([{ id: 'me__x', data: { users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'accepted' } }]),
    );
    const self = { name: 'MiNick', photo: 'p', socialGistId: 'gs', gamesGistId: 'gg' };

    await healOwnFriendshipIdentity('me', self);
    expect(getDocsMock).toHaveBeenCalledTimes(1);

    // Recién sellada: sigue sin costar ni una lectura.
    await healOwnFriendshipIdentity('me', self);
    expect(getDocsMock).toHaveBeenCalledTimes(1);

    // Ocho días después, la misma identidad vuelve a revisarse.
    localMeta = { ...(localMeta || {}), friendshipIdentityHealedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 };
    await healOwnFriendshipIdentity('me', self);
    expect(getDocsMock).toHaveBeenCalledTimes(2);
  });

  // ...y esa revisión no escribe nada si de verdad no hay desacuerdo: `diverges` sigue mandando sobre la escritura.
  it('la revisión periódica no escribe cuando las amistades ya están de acuerdo', async () => {
    const alDia = {
      users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'accepted',
      requesterName: 'MiNick', requesterPhoto: 'p', requesterSocialGistId: 'gs', requesterGamesGistId: 'gg',
    };
    getDocsMock.mockResolvedValue(snapshot([{ id: 'me__x', data: alDia }]));
    const self = { name: 'MiNick', photo: 'p', socialGistId: 'gs', gamesGistId: 'gg' };

    await healOwnFriendshipIdentity('me', self);
    localMeta = { ...(localMeta || {}), friendshipIdentityHealedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 };
    await healOwnFriendshipIdentity('me', self);

    expect(getDocsMock).toHaveBeenCalledTimes(2);
    expect(batchUpdateMock).not.toHaveBeenCalled();
  });

  it('`force` sanea aunque la huella coincida (migración de canal: el gist viejo se va a borrar)', async () => {
    getDocsMock.mockResolvedValue(
      snapshot([{ id: 'me__x', data: { users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'accepted' } }]),
    );
    const self = { name: 'MiNick', photo: 'p', socialGistId: 'gs', gamesGistId: 'gg' };

    await healOwnFriendshipIdentity('me', self);
    await healOwnFriendshipIdentity('me', self, { force: true });

    expect(getDocsMock).toHaveBeenCalledTimes(2);
  });

  // Sellar una huella que no llegó a escribirse daría por propagado lo que no lo está, y el próximo disparo ya no
  // lo reintentaría.
  it('no sella la huella si alguna escritura falló', async () => {
    getDocsMock.mockResolvedValue(
      snapshot([{ id: 'me__x', data: { users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'accepted' } }]),
    );
    batchCommitMock.mockRejectedValueOnce(new Error('rules'));
    updateDocMock.mockRejectedValueOnce(new Error('rules'));

    await healOwnFriendshipIdentity('me', { name: 'MiNick', photo: 'p', socialGistId: 'gs', gamesGistId: 'gg' });

    expect(localMeta?.friendshipIdentityFingerprint).toBeUndefined();

    // Y por tanto el siguiente disparo vuelve a intentarlo.
    await healOwnFriendshipIdentity('me', { name: 'MiNick', photo: 'p', socialGistId: 'gs', gamesGistId: 'gg' });
    expect(getDocsMock).toHaveBeenCalledTimes(2);
  });

  // Un `writeBatch` es atómico: un solo doc legacy que las reglas rechacen tumbaría el lote entero. Antes, con
  // escrituras sueltas, ese doc solo se perdía a sí mismo; el reintento doc a doc conserva esa tolerancia.
  it('si el lote falla, reintenta doc a doc para salvar los sanos', async () => {
    getDocsMock.mockResolvedValueOnce(
      snapshot([
        { id: 'me__x', data: { users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'accepted' } },
        { id: 'me__y', data: { users: ['me', 'y'], requester: 'me', recipient: 'y', status: 'accepted' } },
      ]),
    );
    batchCommitMock.mockRejectedValueOnce(new Error('un doc envenenado'));
    updateDocMock.mockRejectedValueOnce(new Error('ese doc')); // el primero sigue fallando…
    updateDocMock.mockResolvedValueOnce(undefined); // …pero el segundo se salva.

    await healOwnFriendshipIdentity('me', { name: 'MiNick', photo: 'p', socialGistId: 'gs', gamesGistId: 'gg' });

    expect(updateDocMock).toHaveBeenCalledTimes(2);
    expect(localMeta?.friendshipIdentityFingerprint).toBeUndefined(); // no todo se escribió → sin sellar
  });

  // Varios llamantes pasan `gamesGistId: mainSyncConfig?.gistId || ''`, y esa configuración se hidrata de forma
  // asíncrona: un `''` significa "aquí y ahora no lo sé", nunca "este usuario ya no tiene gist". Y estos campos
  // son de donde los AMIGOS sacan la lista de juegos, así que escribir el vacío se la dejaba en blanco a todos.
  it('un id vacío CONSERVA el que ya consta en el doc (no lo borra)', async () => {
    getDocsMock.mockResolvedValueOnce(
      snapshot([
        {
          id: 'me__x',
          data: {
            users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'accepted',
            requesterName: 'MiNick', requesterPhoto: 'p', requesterSocialGistId: 'gs', requesterGamesGistId: 'gg',
          },
        },
      ]),
    );

    // Mismo nick y foto que ya constan: lo único "nuevo" es el vacío. Al conservarse, nada diverge y no se escribe.
    await healOwnFriendshipIdentity('me', { name: 'MiNick', photo: 'p', socialGistId: '', gamesGistId: '' });

    expect(batchUpdateMock).not.toHaveBeenCalled();
  });

  it('un id vacío no impide propagar el resto (nick nuevo) y sigue conservando el id', async () => {
    getDocsMock.mockResolvedValueOnce(
      snapshot([
        {
          id: 'me__x',
          data: {
            users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'accepted',
            requesterName: 'NickViejo', requesterPhoto: 'p', requesterSocialGistId: 'gs', requesterGamesGistId: 'gg',
          },
        },
      ]),
    );

    await healOwnFriendshipIdentity('me', { name: 'NickNuevo', photo: 'p', socialGistId: 'gs', gamesGistId: '' });

    expect(batchedOps()).toHaveLength(1);
    expect(batchedOps()[0].fields).toMatchObject({
      requesterName: 'NickNuevo',
      requesterGamesGistId: 'gg',
    });
  });

  // El caso que sí debe escribir: un id NUEVO reemplaza al anterior (migración de canal, gist recreado).
  it('un id nuevo sí reemplaza al anterior', async () => {
    getDocsMock.mockResolvedValueOnce(
      snapshot([
        {
          id: 'me__x',
          data: {
            users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'accepted',
            requesterName: 'MiNick', requesterPhoto: 'p', requesterSocialGistId: 'gs', requesterGamesGistId: 'gg',
          },
        },
      ]),
    );

    await healOwnFriendshipIdentity('me', { name: 'MiNick', photo: 'p', socialGistId: 'gs2', gamesGistId: 'gg2' });

    expect(batchedOps()).toHaveLength(1);
    expect(batchedOps()[0].fields).toMatchObject({
      requesterSocialGistId: 'gs2',
      requesterGamesGistId: 'gg2',
    });
  });
});

// Fase 2 de docs/plan-historial-amigo-nuevo.md: mirar una a una las aristas en las que se espera algo del otro.
describe('haveFriendshipEdgesChanged', () => {
  beforeEach(resetAll);

  const enviada: FriendshipView = {
    docId: 'me__x', otherUid: 'x', otherName: 'X', otherPhoto: '', otherSocialGistId: '', otherGamesGistId: '',
    state: 'outgoing', createdAt: 1, updatedAt: 1,
  };
  const leido = (data: Record<string, unknown>) => ({ id: 'me__x', exists: () => true, data: () => data });

  it('sigue pendiente: sin cambios, y 1 lectura por arista (no la consulta entera)', async () => {
    getDocMock.mockResolvedValueOnce(leido({ users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'pending' }));
    await expect(haveFriendshipEdgesChanged('me', [enviada])).resolves.toBe(false);
    expect(getDocMock).toHaveBeenCalledTimes(1);
    expect(getDocsMock).not.toHaveBeenCalled();
  });

  it('aceptada: cambio', async () => {
    getDocMock.mockResolvedValueOnce(leido({
      users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'accepted', recipientSocialGistId: 'gsX',
    }));
    await expect(haveFriendshipEdgesChanged('me', [enviada])).resolves.toBe(true);
  });

  it('rechazada (ya no se deja leer): cambio', async () => {
    getDocMock.mockRejectedValueOnce({ code: 'permission-denied' });
    await expect(haveFriendshipEdgesChanged('me', [enviada])).resolves.toBe(true);
  });

  it('un amigo al que le llegan los ids: cambio', async () => {
    const amigo: FriendshipView = { ...enviada, state: 'friends' };
    getDocMock.mockResolvedValueOnce(leido({
      users: ['me', 'x'], requester: 'x', recipient: 'me', status: 'accepted', requesterSocialGistId: 'gsX',
    }));
    await expect(haveFriendshipEdgesChanged('me', [amigo])).resolves.toBe(true);
  });

  it('sin aristas no lee nada', async () => {
    await expect(haveFriendshipEdgesChanged('me', [])).resolves.toBe(false);
    expect(getDocMock).not.toHaveBeenCalled();
  });
});
