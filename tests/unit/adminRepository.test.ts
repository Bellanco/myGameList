import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock de la capa Firestore: el repositorio de administración solo usa initializeFirebaseServices + consultas
// de colección y escrituras por documento.
const getDocsMock = vi.fn<(...a: unknown[]) => unknown>();
const updateDocMock = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});
const deleteDocMock = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ firestore: { __fs: true } })),
  isPermissionDeniedError: (error: unknown) => (error as { code?: string } | null)?.code === 'permission-denied',
}));

vi.mock('../../src/model/repository/firebaseSocialRepository', () => ({
  invalidateOwnProfileCache: vi.fn(),
  invalidateSocialDirectoryCache: vi.fn(),
}));

vi.mock('../../src/model/repository/firebaseFriendshipRepository', () => ({
  invalidateMyFriendshipsCache: vi.fn(),
}));

vi.mock('firebase/firestore/lite', () => ({
  collection: (_fs: unknown, name: string) => ({ collection: name }),
  doc: (_fs: unknown, name: string, id: string) => ({ collection: name, id }),
  // `query` conserva la colección de origen para que el mock de getDocs sepa a quién responde.
  query: (base: { collection: string }, ...constraints: unknown[]) => ({ ...base, constraints }),
  limit: (n: number) => ({ limit: n }),
  where: (field: string, op: string, value: unknown) => ({ where: [field, op, value] }),
  getDocs: (...a: unknown[]) => getDocsMock(...a),
  updateDoc: (...a: unknown[]) => updateDocMock(...a),
  deleteDoc: (...a: unknown[]) => deleteDocMock(...a),
  deleteField: () => '__del__',
}));

import {
  ADMIN_PROFILES_LIMIT,
  FOSSIL_PENDING_MS,
  deleteUserProfile,
  healUserFriendshipIdentity,
  loadAdminCensus,
  purgeFossilFriendshipRequests,
  purgeLegacyProfileFields,
  setUserSocialEnabled,
  setUserTier,
} from '../../src/model/repository/firebaseAdminRepository';

function docOf(id: string, data: Record<string, unknown>) {
  return { id, data: () => data, ref: { collection: 'friendships', id } };
}

function snapshotOf(docs: ReturnType<typeof docOf>[]) {
  return { docs, size: docs.length };
}

/** Responde a `getDocs` según la colección consultada. */
function respondWith(profiles: ReturnType<typeof docOf>[], friendships: ReturnType<typeof docOf>[]) {
  getDocsMock.mockImplementation((target: unknown) => {
    const name = (target as { collection: string }).collection;
    return Promise.resolve(snapshotOf(name === 'profiles' ? profiles : friendships));
  });
}

describe('firebaseAdminRepository — censo', () => {
  beforeEach(() => {
    getDocsMock.mockReset();
    updateDocMock.mockClear();
    deleteDocMock.mockClear();
  });

  it('lista también los perfiles con el social DESACTIVADO (que el directorio filtra)', async () => {
    respondWith(
      [
        docOf('uid-on', { uid: 'uid-on', displayName: 'Activo', social: { enabled: true, gistId: 'g1' }, updatedAt: 200 }),
        docOf('uid-off', { uid: 'uid-off', displayName: 'Suspendido', social: { enabled: false }, updatedAt: 100 }),
      ],
      [],
    );

    const census = await loadAdminCensus();

    expect(census.users.map((user) => user.id)).toEqual(['uid-on', 'uid-off']);
    expect(census.totals.profiles).toBe(2);
    expect(census.totals.socialEnabled).toBe(1);
  });

  it('excluye el documento centinela `_placeholder`', async () => {
    respondWith(
      [
        docOf('_placeholder', { uid: '_placeholder' }),
        docOf('uid-a', { uid: 'uid-a', displayName: 'A', social: { enabled: true }, updatedAt: 1 }),
      ],
      [],
    );

    const census = await loadAdminCensus();
    expect(census.users).toHaveLength(1);
    expect(census.users[0].id).toBe('uid-a');
  });

  it('ordena por actividad reciente y NO deja fuera a quien no tiene `updatedAt`', async () => {
    respondWith(
      [
        docOf('sin-fecha', { uid: 'sin-fecha', displayName: 'Sin fecha', social: { enabled: true } }),
        docOf('viejo', { uid: 'viejo', displayName: 'Viejo', social: { enabled: true }, updatedAt: 10 }),
        docOf('nuevo', { uid: 'nuevo', displayName: 'Nuevo', social: { enabled: true }, updatedAt: 999 }),
      ],
      [],
    );

    const census = await loadAdminCensus();
    // El que no trae `updatedAt` cae al final, pero SALE: en un censo una omisión silenciosa sería peor.
    expect(census.users.map((user) => user.id)).toEqual(['nuevo', 'viejo', 'sin-fecha']);
    expect(census.users[2].updatedAt).toBe(0);
  });

  it('acepta `updatedAt` como Timestamp de Firestore además de como número', async () => {
    respondWith([docOf('uid-a', { uid: 'uid-a', social: { enabled: true }, updatedAt: { toMillis: () => 1234 } })], []);
    const census = await loadAdminCensus();
    expect(census.users[0].updatedAt).toBe(1234);
  });

  it('cuenta amistades y pendientes por usuario en una sola lectura', async () => {
    respondWith(
      [
        docOf('a', { uid: 'a', displayName: 'A', social: { enabled: true }, updatedAt: 3 }),
        docOf('b', { uid: 'b', displayName: 'B', social: { enabled: true }, updatedAt: 2 }),
        docOf('c', { uid: 'c', displayName: 'C', social: { enabled: true }, updatedAt: 1 }),
      ],
      [
        docOf('a__b', { users: ['a', 'b'], status: 'accepted' }),
        docOf('a__c', { users: ['a', 'c'], status: 'pending' }),
        docOf('_placeholder', { status: 'accepted' }), // sin `users`: no es una amistad
      ],
    );

    const census = await loadAdminCensus();
    const byId = Object.fromEntries(census.users.map((user) => [user.id, user]));

    expect(byId.a.friends).toBe(1);
    expect(byId.a.pending).toBe(1);
    expect(byId.b.friends).toBe(1);
    expect(byId.c.pending).toBe(1);
    expect(census.totals.friendships).toBe(2);
    expect(census.totals.pending).toBe(1);
  });

  it('recupera de las amistades el nombre de quien tiene el perfil sin `displayName`', async () => {
    respondWith(
      [docOf('a', { uid: 'a', displayName: '', social: { enabled: true } })],
      [
        docOf('a__b', { users: ['a', 'b'], status: 'accepted', requester: 'a', recipient: 'b', requesterName: 'Ada', recipientName: 'Bob' }),
      ],
    );

    const census = await loadAdminCensus();
    // Sin esto la fila sería un uid anónimo imposible de identificar en el panel.
    expect(census.users[0].knownAs).toBe('Ada');
  });

  it('toma el nombre del lado correcto de la amistad (requester vs recipient)', async () => {
    respondWith(
      [
        docOf('a', { uid: 'a', social: { enabled: true }, updatedAt: 2 }),
        docOf('b', { uid: 'b', social: { enabled: true }, updatedAt: 1 }),
      ],
      [docOf('a__b', { users: ['a', 'b'], status: 'accepted', requester: 'a', recipient: 'b', requesterName: 'Ada', recipientName: 'Bob' })],
    );

    const census = await loadAdminCensus();
    expect(census.users.map((entry) => entry.knownAs)).toEqual(['Ada', 'Bob']);
  });

  it('sin amistades no hay nombre de respaldo', async () => {
    respondWith([docOf('a', { uid: 'a', displayName: '', social: { enabled: true } })], []);
    const census = await loadAdminCensus();
    expect(census.users[0].knownAs).toBe('');
  });

  it('marca los restos legacy por PRESENCIA, sin exponer su valor', async () => {
    respondWith(
      [
        docOf('sucio', {
          uid: 'sucio',
          email: 'alguien@example.com',
          social: { enabled: true, gamesGistId: 'gg', githubToken: 'ghp_secreto' },
        }),
        docOf('limpio', { uid: 'limpio', social: { enabled: true, gistId: 'g' } }),
      ],
      [],
    );

    const census = await loadAdminCensus();
    const sucio = census.users.find((user) => user.id === 'sucio');
    const limpio = census.users.find((user) => user.id === 'limpio');

    expect(sucio?.legacy).toEqual({ email: true, gamesGistId: true, token: true });
    expect(limpio?.legacy).toEqual({ email: false, gamesGistId: false, token: false });
    // Ni el email ni el token pueden viajar en la fila: solo su presencia.
    expect(JSON.stringify(census)).not.toContain('alguien@example.com');
    expect(JSON.stringify(census)).not.toContain('ghp_secreto');
    expect(census.totals.legacy).toBe(1);
  });

  it('marca si el documento se identifica por el uid (de eso depende poder purgarle el email)', async () => {
    respondWith(
      [
        docOf('uid-a', { uid: 'uid-a', social: { enabled: true }, updatedAt: 3 }),
        // Perfil legacy: vive bajo otro id, así que su email es su única vía de recuperación.
        docOf('perfil-viejo', { uid: 'uid-b', email: 'x@y.z', social: { enabled: true }, updatedAt: 2 }),
        // Tan viejo que ni tiene campo `uid`: el caso que NO se puede dar por bueno a ciegas.
        docOf('sin-uid', { email: 'z@y.x', social: { enabled: true }, updatedAt: 1 }),
      ],
      [],
    );

    const census = await loadAdminCensus();
    expect(census.users.map((entry) => entry.idMatchesUid)).toEqual([true, false, false]);
  });

  it('avisa cuando se alcanza el tope en vez de fingir que la lista está completa', async () => {
    const many = Array.from({ length: ADMIN_PROFILES_LIMIT }, (_, i) =>
      docOf(`uid-${i}`, { uid: `uid-${i}`, social: { enabled: true }, updatedAt: i }),
    );
    respondWith(many, []);

    const census = await loadAdminCensus();
    expect(census.truncated).toBe(true);
  });

  it('lee el rango y cuenta el reparto; sin campo `tier` el perfil es bronce', async () => {
    respondWith(
      [
        docOf('a', { uid: 'a', tier: 'gold', social: { enabled: true }, updatedAt: 3 }),
        docOf('b', { uid: 'b', social: { enabled: true }, updatedAt: 2 }),
        docOf('c', { uid: 'c', tier: 'mithril', social: { enabled: true }, updatedAt: 1 }),
      ],
      [],
    );

    const census = await loadAdminCensus();
    expect(census.users.map((user) => user.tier)).toEqual(['gold', 'bronze', 'mithril']);
    expect(census.totals.byTier).toEqual({ bronze: 1, silver: 0, gold: 1, mithril: 1 });
  });

  it('un rango desconocido degrada a bronce en vez de romper la tabla', async () => {
    respondWith([docOf('a', { uid: 'a', tier: 'adamantium', social: { enabled: true } })], []);
    const census = await loadAdminCensus();
    expect(census.users[0].tier).toBe('bronze');
  });

  it('lee la fecha de alta sellada y, si no la hay, estima con la amistad más antigua', async () => {
    respondWith(
      [
        docOf('con-alta', { uid: 'con-alta', createdAt: 1_000, social: { enabled: true, gistId: 'g' }, updatedAt: 5_000 }),
        docOf('sin-alta', { uid: 'sin-alta', social: { enabled: true, gistId: 'g' }, updatedAt: 4_000 }),
      ],
      [
        docOf('a1', { users: ['sin-alta', 'x'], status: 'accepted', requester: 'sin-alta', recipient: 'x', createdAt: 900, updatedAt: 2_000 }),
        docOf('a2', { users: ['sin-alta', 'y'], status: 'accepted', requester: 'y', recipient: 'sin-alta', createdAt: 700, updatedAt: 3_000 }),
      ],
    );

    const census = await loadAdminCensus();
    const conAlta = census.users.find((user) => user.id === 'con-alta');
    const sinAlta = census.users.find((user) => user.id === 'sin-alta');

    expect(conAlta?.createdAt).toBe(1_000);
    expect(conAlta?.estimatedFirstSeenAt).toBe(0);
    // La MÁS ANTIGUA de sus amistades (700), no la primera que aparezca.
    expect(sinAlta?.createdAt).toBe(0);
    expect(sinAlta?.estimatedFirstSeenAt).toBe(700);
    expect(sinAlta?.lastFriendshipAt).toBe(3_000);
  });

  it('desglosa las peticiones pendientes por quién dio el paso', async () => {
    respondWith(
      [docOf('a', { uid: 'a', social: { enabled: true, gistId: 'g' }, updatedAt: 1 })],
      [
        docOf('p1', { users: ['a', 'b'], status: 'pending', requester: 'a', recipient: 'b' }),
        docOf('p2', { users: ['a', 'c'], status: 'pending', requester: 'a', recipient: 'c' }),
        docOf('p3', { users: ['a', 'd'], status: 'pending', requester: 'd', recipient: 'a' }),
      ],
    );

    const census = await loadAdminCensus();
    // Muchas enviadas y ninguna aceptada es justo el patrón que interesa ver.
    expect(census.users[0].pendingOut).toBe(2);
    expect(census.users[0].pendingIn).toBe(1);
    expect(census.users[0].friends).toBe(0);
  });

  it('traduce el `permission-denied` de las reglas a un mensaje de administración', async () => {
    getDocsMock.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    await expect(loadAdminCensus()).rejects.toThrow(/Sin permisos de administrador/);
  });
});

describe('firebaseAdminRepository — moderación', () => {
  beforeEach(() => {
    getDocsMock.mockReset();
    updateDocMock.mockClear();
    deleteDocMock.mockClear();
  });

  it('desactiva el social sin tocar `updatedAt` (el latido de "última vez visto" no se falsea)', async () => {
    await setUserSocialEnabled('uid-a', false);
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const payload = updateDocMock.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toEqual({ 'social.enabled': false });
  });

  it('no deja tocar el placeholder ni un id vacío', async () => {
    await expect(setUserSocialEnabled('_placeholder', false)).rejects.toThrow();
    await expect(setUserSocialEnabled('', false)).rejects.toThrow();
    await expect(purgeLegacyProfileFields('_placeholder', ['token'])).rejects.toThrow();
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it('asignar un rango escribe el valor; volver a bronce BORRA el campo', async () => {
    await setUserTier('uid-a', 'gold');
    expect(updateDocMock.mock.calls[0][1]).toEqual({ tier: 'gold' });

    await setUserTier('uid-a', 'bronze');
    // Bronce es la ausencia de rango: un perfil degradado queda igual que uno que nunca tuvo tier.
    expect(updateDocMock.mock.calls[1][1]).toEqual({ tier: '__del__' });
  });

  it('purga SOLO los campos indicados, cada uno en su ruta', async () => {
    await purgeLegacyProfileFields('uid-a', ['token']);
    expect(updateDocMock.mock.calls[0][1]).toEqual({ 'social.githubToken': '__del__' });

    await purgeLegacyProfileFields('uid-a', ['email', 'gamesGistId']);
    expect(updateDocMock.mock.calls[1][1]).toEqual({ email: '__del__', 'social.gamesGistId': '__del__' });
  });

  it('sin campos que purgar no escribe nada', async () => {
    await expect(purgeLegacyProfileFields('uid-a', [])).rejects.toThrow();
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it('borrar un usuario elimina sus amistades en ambos sentidos y luego su perfil', async () => {
    respondWith([], [docOf('a__b', { users: ['a', 'b'] }), docOf('a__c', { users: ['a', 'c'] })]);

    const result = await deleteUserProfile('a', 'a');

    expect(result.ok).toBe(true);
    // 2 amistades + el propio perfil.
    expect(deleteDocMock).toHaveBeenCalledTimes(3);
    const lastCall = deleteDocMock.mock.calls[deleteDocMock.mock.calls.length - 1];
    expect(lastCall[0]).toEqual({ collection: 'profiles', id: 'a' });
  });

  it('si falla el borrado de una amistad, sigue con el perfil y lo reporta', async () => {
    respondWith([], [docOf('a__b', { users: ['a', 'b'] })]);
    deleteDocMock.mockRejectedValueOnce(new Error('offline'));

    const result = await deleteUserProfile('a', 'a');

    expect(result.ok).toBe(false);
    expect(result.failures[0]).toMatch(/amistades/);
    // El perfil se intenta igualmente: abortar dejaría al usuario a medio borrar.
    expect(deleteDocMock).toHaveBeenCalledTimes(2);
  });
});

// Señales de algo fuera de lugar. Es el criterio con el que el panel decide dónde hay que mirar, así que se
// prueba aquí (en el repositorio) y no en la vista: mismo juicio para cualquiera que las pinte.
describe('firebaseAdminRepository — señales', () => {
  beforeEach(() => {
    getDocsMock.mockReset();
    updateDocMock.mockClear();
    deleteDocMock.mockClear();
  });

  /** Perfil "sano": con nombre, pseudónimo, gist, esquema vigente y actividad reciente. */
  function healthy(extra: Record<string, unknown> = {}, socialExtra: Record<string, unknown> = {}) {
    return docOf('a', {
      uid: 'a',
      profileId: 'p-a',
      schemaVersion: 1,
      displayName: 'Ada',
      updatedAt: Date.now() - 1000,
      social: { enabled: true, gistId: 'gs-a', ...socialExtra },
      ...extra,
    });
  }

  async function anomaliesOf(profile: ReturnType<typeof docOf>, friendships: ReturnType<typeof docOf>[] = []) {
    respondWith([profile], friendships);
    const census = await loadAdminCensus();
    return census.users[0].anomalies;
  }

  it('un perfil sano no levanta ninguna señal', async () => {
    expect(await anomaliesOf(healthy())).toEqual([]);
  });

  // La señal `enabled-without-gist` se retiró del todo (ya no está ni en el tipo) al dejar de publicarse el id del
  // canal en el perfil: estaría vacío para todo el mundo y se dispararía con cualquiera. Mirar sus amistades
  // tampoco valía — alguien recién llegado no tiene ninguna y su canal está perfectamente.
  it('un perfil sin gist en el documento no levanta NINGUNA señal: es lo normal desde que el id no se publica', async () => {
    expect(await anomaliesOf(healthy({}, { gistId: '' }))).toEqual([]);
  });

  it('detecta perfiles a medio crear (sin nombre, sin pseudónimo, esquema viejo)', async () => {
    expect(await anomaliesOf(healthy({ displayName: '' }))).toContain('no-display-name');
    expect(await anomaliesOf(healthy({ profileId: '' }))).toContain('no-profile-id');
    expect(await anomaliesOf(healthy({ schemaVersion: 0 }))).toContain('stale-schema');
  });

  it('detecta el token en claro aparte del resto de restos legacy, por su gravedad', async () => {
    const soloToken = await anomaliesOf(healthy({}, { githubToken: 'ghp_x' }));
    expect(soloToken).toContain('legacy-token');
    expect(soloToken).not.toContain('legacy-fields');

    expect(await anomaliesOf(healthy({ email: 'x@y.z' }))).toContain('legacy-fields');
  });

  it('detecta fechas imposibles: actividad futura y alta posterior a la actividad', async () => {
    const futuro = Date.now() + 60 * 60 * 1000;
    expect(await anomaliesOf(healthy({ updatedAt: futuro }))).toContain('future-activity');
    expect(await anomaliesOf(healthy({ createdAt: Date.now(), updatedAt: Date.now() - 60_000 })))
      .toContain('created-after-activity');
  });

  it('distingue sin actividad de inactivo, y no marca inactivo a quien acaba de entrar', async () => {
    expect(await anomaliesOf(healthy({ updatedAt: 0 }))).toContain('never-active');

    const hace40dias = Date.now() - 40 * 24 * 60 * 60 * 1000;
    expect(await anomaliesOf(healthy({ updatedAt: hace40dias }))).toContain('inactive');
    expect(await anomaliesOf(healthy())).not.toContain('inactive');
  });

  it('detecta la deriva del gist social: sus amistades apuntan a otro id que el directorio', async () => {
    const conDeriva = await anomaliesOf(healthy(), [
      docOf('a__b', { users: ['a', 'b'], status: 'accepted', requester: 'a', recipient: 'b', requesterSocialGistId: 'gs-VIEJO' }),
    ]);
    // Es el fallo por el que las reseñas de alguien no llegan al feed de sus amigos.
    expect(conDeriva).toContain('gist-drift');

    const sinDeriva = await anomaliesOf(healthy(), [
      docOf('a__b', { users: ['a', 'b'], status: 'accepted', requester: 'a', recipient: 'b', requesterSocialGistId: 'gs-a' }),
    ]);
    expect(sinDeriva).not.toContain('gist-drift');
  });

  // El caso que la comprobación original NO veía y que es el único observable hoy: el perfil ya no publica su id
  // (se purga), así que la deriva solo se nota en que sus amistades no se ponen de acuerdo entre ellas. Quien tenga
  // el canal abandonado no ve sus reseñas.
  it('detecta la deriva aunque el perfil no publique ningún gist: basta que sus amistades discrepen', async () => {
    const conDeriva = await anomaliesOf(healthy({}, { gistId: '' }), [
      docOf('a__b', { users: ['a', 'b'], status: 'accepted', requester: 'a', recipient: 'b', requesterSocialGistId: 'gs-NUEVO' }),
      docOf('a__c', { users: ['a', 'c'], status: 'accepted', requester: 'a', recipient: 'c', requesterSocialGistId: 'gs-VIEJO' }),
    ]);
    expect(conDeriva).toContain('gist-drift');
  });

  it('varias amistades de acuerdo en el mismo gist no son deriva', async () => {
    const sinDeriva = await anomaliesOf(healthy({}, { gistId: '' }), [
      docOf('a__b', { users: ['a', 'b'], status: 'accepted', requester: 'a', recipient: 'b', requesterSocialGistId: 'gs-a' }),
      docOf('a__c', { users: ['a', 'c'], status: 'accepted', requester: 'a', recipient: 'c', requesterSocialGistId: 'gs-a' }),
    ]);
    expect(sinDeriva).toEqual([]);
  });

  it('sin amistades no se inventa deriva de gist', async () => {
    expect(await anomaliesOf(healthy())).not.toContain('gist-drift');
  });

  // DESACUERDO de nombre, sin decidir quién lo tiene rancio: puede ser el doc de amistad (que guarda el nombre del
  // momento de la petición) o el PERFIL (si el guardado escribió el gist y falló al replicar en Firestore, y el
  // saneado de amistades propagó luego el nick del gist). El panel no puede distinguirlo: el nick vive en el gist.
  it('detecta que sus amistades le guardan un nombre distinto del que publica', async () => {
    const conNombreViejo = await anomaliesOf(healthy(), [
      docOf('a__b', {
        users: ['a', 'b'], status: 'accepted', requester: 'a', recipient: 'b',
        requesterName: 'Ada Vieja', requesterSocialGistId: 'gs-a',
      }),
    ]);
    expect(conNombreViejo).toContain('friend-name-mismatch');
  });

  it('el mismo nombre en sus amistades no se señala, y sin nick publicado tampoco', async () => {
    const alDia = await anomaliesOf(healthy(), [
      docOf('a__b', {
        users: ['a', 'b'], status: 'accepted', requester: 'a', recipient: 'b',
        requesterName: 'Ada', requesterSocialGistId: 'gs-a',
      }),
    ]);
    expect(alDia).not.toContain('friend-name-mismatch');

    // Sin `displayName` no hay con qué comparar: de eso avisa `no-display-name`, no esta señal.
    const sinNick = await anomaliesOf(healthy({ displayName: '' }), [
      docOf('a__b', {
        users: ['a', 'b'], status: 'accepted', requester: 'a', recipient: 'b',
        requesterName: 'Ada Vieja', requesterSocialGistId: 'gs-a',
      }),
    ]);
    expect(sinNick).not.toContain('friend-name-mismatch');
  });

  it('recoge todos los nombres que sus amistades le guardan, no solo el primero', async () => {
    respondWith([healthy()], [
      docOf('a__b', {
        users: ['a', 'b'], status: 'accepted', requester: 'a', recipient: 'b',
        requesterName: 'Ada Vieja', requesterSocialGistId: 'gs-a',
      }),
      docOf('a__c', {
        users: ['a', 'c'], status: 'accepted', requester: 'a', recipient: 'c',
        requesterName: 'Ada', requesterSocialGistId: 'gs-a',
      }),
    ]);

    const census = await loadAdminCensus();
    expect([...census.users[0].friendKnownNames].sort()).toEqual(['Ada', 'Ada Vieja']);
  });

  it('el total de perfiles con señales cuenta perfiles, no señales', async () => {
    respondWith(
      [
        healthy(),
        docOf('b', { uid: 'b', displayName: '', social: { enabled: true }, updatedAt: 0 }), // varias señales
      ],
      [],
    );

    const census = await loadAdminCensus();
    expect(census.totals.flagged).toBe(1);
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;

describe('firebaseAdminRepository — canal de listas y solicitudes fosilizadas', () => {
  beforeEach(() => {
    getDocsMock.mockReset();
    updateDocMock.mockClear();
    deleteDocMock.mockClear();
  });

  function profile(extra: Record<string, unknown> = {}) {
    return docOf('a', {
      uid: 'a', profileId: 'p-a', schemaVersion: 1, displayName: 'Ada',
      updatedAt: Date.now() - 1000, social: { enabled: true }, ...extra,
    });
  }

  /** Amistad aceptada de `a` con otro, con los campos denormalizados que se quieran. */
  function friendship(id: string, other: string, extra: Record<string, unknown> = {}) {
    return docOf(id, {
      users: ['a', other], status: 'accepted', requester: 'a', recipient: other,
      requesterName: 'Ada', ...extra,
    });
  }

  it('recoge el gist de JUEGOS que sus amistades tienen denormalizado', async () => {
    respondWith([profile()], [friendship('a__b', 'b', { requesterGamesGistId: 'gj-1' })]);

    const census = await loadAdminCensus();
    expect(census.users[0].friendGamesGistIds).toEqual(['gj-1']);
  });

  // Es la avería por la que sus amigos no pueden abrir sus listas compartidas, y es independiente del canal social.
  it('señala la deriva del gist de juegos cuando sus amistades no coinciden', async () => {
    respondWith([profile()], [
      friendship('a__b', 'b', { requesterGamesGistId: 'gj-1' }),
      friendship('a__c', 'c', { requesterGamesGistId: 'gj-VIEJO' }),
    ]);

    const census = await loadAdminCensus();
    expect(census.users[0].anomalies).toContain('games-gist-drift');
  });

  it('no tener gist de juegos NO es señal: es lo normal sin sincronización de listas', async () => {
    respondWith([profile()], [friendship('a__b', 'b'), friendship('a__c', 'c')]);

    const census = await loadAdminCensus();
    expect(census.users[0].anomalies).not.toContain('games-gist-drift');
    expect(census.users[0].friendGamesGistIds).toEqual([]);
  });

  it('cuenta las solicitudes enviadas que llevan mucho esperando, con el corte de purga aparte', async () => {
    const now = Date.now();
    respondWith([profile()], [
      // pendiente reciente: no cuenta para ninguno de los dos umbrales
      docOf('a__b', { users: ['a', 'b'], status: 'pending', requester: 'a', recipient: 'b', createdAt: now - 10 * DAY_MS }),
      // +90 días: cuenta como rancia, todavía no purgable
      docOf('a__c', { users: ['a', 'c'], status: 'pending', requester: 'a', recipient: 'c', createdAt: now - 100 * DAY_MS }),
      // +180 días: rancia Y purgable
      docOf('a__d', { users: ['a', 'd'], status: 'pending', requester: 'a', recipient: 'd', createdAt: now - 200 * DAY_MS }),
      // recibida y antigua: no es suya, no se le cuenta
      docOf('e__a', { users: ['a', 'e'], status: 'pending', requester: 'e', recipient: 'a', createdAt: now - 300 * DAY_MS }),
    ]);

    const census = await loadAdminCensus();
    expect(census.users[0].stalePendingOut).toBe(2);
    expect(census.users[0].fossilPendingOut).toBe(1);
    expect(census.users[0].anomalies).toContain('stale-pending-out');
  });

  it('una solicitud sin fecha no se cuenta como antigua: no hay antigüedad que demostrar', async () => {
    respondWith([profile()], [
      docOf('a__b', { users: ['a', 'b'], status: 'pending', requester: 'a', recipient: 'b' }),
    ]);

    const census = await loadAdminCensus();
    expect(census.users[0].stalePendingOut).toBe(0);
    expect(census.users[0].anomalies).not.toContain('stale-pending-out');
  });

  it('avisa de si el cutover fusionará o moverá, según exista ya el documento canónico', async () => {
    // Huérfano cuyo dueño YA tiene su documento canónico: el cutover fusionará.
    respondWith([
      docOf('legacy-1', { uid: 'a', displayName: 'Ada', social: { enabled: true }, updatedAt: 2 }),
      docOf('a', { uid: 'a', displayName: 'Ada', social: { enabled: true }, updatedAt: 1 }),
    ], []);
    let census = await loadAdminCensus();
    expect(census.users.find((row) => row.id === 'legacy-1')?.canonicalTwinFound).toBe(true);
    // El canónico no es gemelo de sí mismo.
    expect(census.users.find((row) => row.id === 'a')?.canonicalTwinFound).toBe(false);

    // Huérfano sin canónico: se moverá entero.
    respondWith([docOf('legacy-2', { uid: 'z', displayName: 'Zoe', social: { enabled: true }, updatedAt: 1 })], []);
    census = await loadAdminCensus();
    expect(census.users[0].canonicalTwinFound).toBe(false);
  });
});

describe('healUserFriendshipIdentity', () => {
  beforeEach(() => {
    getDocsMock.mockReset();
    updateDocMock.mockClear();
    deleteDocMock.mockClear();
  });

  it('propaga el nombre y la foto al lado correcto de cada amistad', async () => {
    getDocsMock.mockResolvedValue(snapshotOf([
      docOf('a__b', { users: ['a', 'b'], requester: 'a', recipient: 'b', requesterName: 'Ada Vieja', requesterPhoto: '' }),
      docOf('c__a', { users: ['a', 'c'], requester: 'c', recipient: 'a', recipientName: 'Ada Vieja', recipientPhoto: '' }),
    ]));

    const result = await healUserFriendshipIdentity('a', { name: 'Ada', photoURL: 'https://f/a.png' });

    expect(result.ok).toBe(true);
    expect(result.touched).toBe(2);
    // Como requester escribe SUS campos; como recipient, los suyos. Nunca los del otro lado.
    const written = updateDocMock.mock.calls.map(([, fields]) => fields as Record<string, unknown>);
    expect(written[0]).toMatchObject({ requesterName: 'Ada', requesterPhoto: 'https://f/a.png' });
    expect(written[1]).toMatchObject({ recipientName: 'Ada', recipientPhoto: 'https://f/a.png' });
    expect(written.some((fields) => 'recipientName' in fields && 'requesterName' in fields)).toBe(false);
  });

  it('no escribe lo que ya está al día (una pulsación no gasta una escritura por amistad)', async () => {
    getDocsMock.mockResolvedValue(snapshotOf([
      docOf('a__b', { users: ['a', 'b'], requester: 'a', recipient: 'b', requesterName: 'Ada', requesterPhoto: 'https://f/a.png' }),
    ]));

    const result = await healUserFriendshipIdentity('a', { name: 'Ada', photoURL: 'https://f/a.png' });

    expect(updateDocMock).not.toHaveBeenCalled();
    expect(result.touched).toBe(0);
    expect(result.ok).toBe(true);
  });

  // Los ids de gist se quedan fuera a propósito: para saber cuál de los que circulan es el bueno hay que leer los
  // gists, y eso exige el token de su dueño.
  it('NO toca los ids de gist', async () => {
    getDocsMock.mockResolvedValue(snapshotOf([
      docOf('a__b', {
        users: ['a', 'b'], requester: 'a', recipient: 'b', requesterName: 'Ada Vieja',
        requesterSocialGistId: 'gs-1', requesterGamesGistId: 'gj-1',
      }),
    ]));

    await healUserFriendshipIdentity('a', { name: 'Ada', photoURL: '' });

    const [, fields] = updateDocMock.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(Object.keys(fields).sort()).toEqual(['requesterName', 'requesterPhoto', 'updatedAt']);
  });

  it('un fallo por documento no aborta el resto y se reporta', async () => {
    getDocsMock.mockResolvedValue(snapshotOf([
      docOf('a__b', { users: ['a', 'b'], requester: 'a', recipient: 'b', requesterName: 'X' }),
      docOf('a__c', { users: ['a', 'c'], requester: 'a', recipient: 'c', requesterName: 'X' }),
    ]));
    updateDocMock.mockRejectedValueOnce(new Error('offline'));

    const result = await healUserFriendshipIdentity('a', { name: 'Ada', photoURL: '' });

    expect(result.ok).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.touched).toBe(1);
  });

  it('sin uid no hace nada', async () => {
    const result = await healUserFriendshipIdentity('', { name: 'Ada', photoURL: '' });
    expect(result.ok).toBe(false);
    expect(getDocsMock).not.toHaveBeenCalled();
  });
});

describe('purgeFossilFriendshipRequests', () => {
  beforeEach(() => {
    getDocsMock.mockReset();
    updateDocMock.mockClear();
    deleteDocMock.mockClear();
  });

  const NOW = 1_800_000_000_000;

  it('borra solo las que ÉL envió, siguen pendientes y pasan de 180 días', async () => {
    getDocsMock.mockResolvedValue(snapshotOf([
      docOf('vieja-suya', { users: ['a', 'b'], status: 'pending', requester: 'a', createdAt: NOW - FOSSIL_PENDING_MS - 1 }),
      docOf('reciente-suya', { users: ['a', 'c'], status: 'pending', requester: 'a', createdAt: NOW - 10 * DAY_MS }),
      docOf('vieja-recibida', { users: ['a', 'd'], status: 'pending', requester: 'd', createdAt: NOW - 400 * DAY_MS }),
      docOf('amistad-vieja', { users: ['a', 'e'], status: 'accepted', requester: 'a', createdAt: NOW - 400 * DAY_MS }),
      docOf('sin-fecha', { users: ['a', 'f'], status: 'pending', requester: 'a' }),
    ]));

    const result = await purgeFossilFriendshipRequests('a', NOW);

    expect(result.ok).toBe(true);
    expect(result.touched).toBe(1);
    expect(deleteDocMock).toHaveBeenCalledTimes(1);
    expect((deleteDocMock.mock.calls[0][0] as { id: string }).id).toBe('vieja-suya');
  });

  it('justo en el umbral no se borra: hace falta PASAR de los 180 días', async () => {
    getDocsMock.mockResolvedValue(snapshotOf([
      docOf('en-el-limite', { users: ['a', 'b'], status: 'pending', requester: 'a', createdAt: NOW - FOSSIL_PENDING_MS }),
    ]));

    const result = await purgeFossilFriendshipRequests('a', NOW);

    expect(deleteDocMock).not.toHaveBeenCalled();
    expect(result.touched).toBe(0);
  });

  it('un fallo de borrado se reporta sin dar la purga por buena', async () => {
    getDocsMock.mockResolvedValue(snapshotOf([
      docOf('vieja', { users: ['a', 'b'], status: 'pending', requester: 'a', createdAt: NOW - 400 * DAY_MS }),
    ]));
    deleteDocMock.mockRejectedValueOnce(new Error('offline'));

    const result = await purgeFossilFriendshipRequests('a', NOW);

    expect(result.ok).toBe(false);
    expect(result.touched).toBe(0);
  });
});
