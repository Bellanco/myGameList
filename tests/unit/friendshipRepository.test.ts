import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock de la capa Firestore: getMyFriendships solo necesita initializeFirebaseServices + getDocs.
const getDocsMock = vi.fn();
const deleteDocMock = vi.fn();
const updateDocMock = vi.fn((..._args: unknown[]) => Promise.resolve());
const setDocMock = vi.fn((..._args: unknown[]) => Promise.resolve());
const docMock = vi.fn((...args: unknown[]) => ({ id: String(args[2] ?? '') }));
const limitMock = vi.fn((value: number) => ({ limit: value }));

// El saneado escribe en LOTES. El mock registra las operaciones para poder afirmar sobre ellas igual que antes se
// afirmaba sobre `updateDoc`, y `batchCommitMock` permite simular un lote que las reglas rechazan.
const batchUpdateMock = vi.fn((..._args: unknown[]) => undefined);
const batchCommitMock = vi.fn(() => Promise.resolve());
const writeBatchMock = vi.fn(() => ({ update: batchUpdateMock, commit: batchCommitMock }));

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
  getDoc: vi.fn(),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  writeBatch: (...args: unknown[]) => writeBatchMock(...(args as [])),
}));

import {
  acceptFriendRequest,
  deleteFriendship,
  friendshipDocId,
  getMyFriendships,
  healOwnFriendshipIdentity,
  invalidateMyFriendshipsCache,
  MY_FRIENDSHIPS_REQUESTS_MAX_AGE_MS,
  sendFriendRequest,
} from '../../src/model/repository/firebaseFriendshipRepository';

function snapshot(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return { docs: docs.map((d) => ({ id: d.id, data: () => d.data })) };
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
  batchUpdateMock.mockClear();
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
