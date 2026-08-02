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

vi.mock('firebase/firestore', () => ({
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
  deleteUserProfile,
  loadAdminCensus,
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

  // `enabled-without-gist` se retiró al dejar de publicarse el id del canal en el perfil: estaría vacío para
  // todo el mundo y la señal se dispararía con cualquiera. Mirar sus amistades tampoco vale — alguien recién
  // llegado no tiene ninguna y su canal está perfectamente.
  it('un perfil sin gist en el documento ya NO se señala: es lo normal desde que el id no se publica', async () => {
    expect(await anomaliesOf(healthy({}, { gistId: '' }))).not.toContain('enabled-without-gist');
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

  it('sin amistades no se inventa deriva de gist', async () => {
    expect(await anomaliesOf(healthy())).not.toContain('gist-drift');
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
