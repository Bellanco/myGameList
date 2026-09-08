import { beforeEach, describe, expect, it, vi } from 'vitest';

// L1 — El perfil PROPIO se resolvía consultando la colección `profiles` por `email`, lo que obligaba a publicar
// el correo en un documento que cualquier usuario autenticado puede leer. Ahora se lee por id de documento
// (`profiles/{uid}`), y la búsqueda por correo queda SOLO como fallback para perfiles legacy cuyo id no es el uid:
// sin ese fallback se les crearía un perfil duplicado.

const getDocMock = vi.fn();
const getDocsMock = vi.fn();

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ firestore: {} })),
  isPermissionDeniedError: (error: unknown) =>
    Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'permission-denied'),
}));

vi.mock('firebase/firestore/lite', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, path: string, id: string) => ({ path, id })),
  query: vi.fn((...args: unknown[]) => args),
  where: vi.fn((...args: unknown[]) => args),
  orderBy: vi.fn((...args: unknown[]) => args),
  limit: vi.fn((...args: unknown[]) => args),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
}));

import {
  findSocialProfileByEmail,
  getOwnProfileRef,
  invalidateOwnProfileCache,
} from '../../src/model/repository/firebaseSocialRepository';

const PROFILE_DATA = {
  uid: 'uid-1',
  profileId: 'pid-1',
  email: 'yo@example.com',
  displayName: 'Nick',
  photoURL: 'https://x/y.png',
  social: { gistId: 'social-1', gamesGistId: 'games-1', enabled: true },
};

function docSnapshot(id: string, data: Record<string, unknown> | null) {
  return { id, exists: () => data !== null, data: () => data };
}

beforeEach(() => {
  getDocMock.mockReset();
  getDocsMock.mockReset();
  invalidateOwnProfileCache();
});

describe('getOwnProfileRef — perfil propio por uid', () => {
  it('lee `profiles/{uid}` directamente, sin consultar la colección', async () => {
    getDocMock.mockResolvedValueOnce(docSnapshot('uid-1', PROFILE_DATA));

    const profile = await getOwnProfileRef('uid-1');

    expect(profile).toMatchObject({
      id: 'uid-1',
      profileId: 'pid-1',
      displayName: 'Nick',
      socialGistId: 'social-1',
      socialEnabled: true,
    });
    // Lo importante: NINGUNA consulta por email (que es lo que obligaba a publicarlo).
    expect(getDocsMock).not.toHaveBeenCalled();
  });

  /**
   * LA FECHA DE ALTA, que es lo que hace VERIFICABLES «De la vieja escuela» y «Otro año más»: la sella el
   * servidor al crear el perfil y las reglas la declaran inmutable, así que no se puede adelantar desde el
   * cliente. No se mapeaba, y por eso esos dos logros —13 escalones— estaban a cero para todo el mundo mientras
   * seguían contando en el denominador de la cabecera.
   *
   * Se admiten las DOS formas por el mismo motivo que las reglas: las escrituras actuales usan
   * `serverTimestamp()` (que se lee como `Timestamp`) y los documentos anteriores llevan milisegundos.
   */
  it('mapea `createdAt` venga como Timestamp o como número', async () => {
    getDocMock.mockResolvedValueOnce(docSnapshot('uid-1', {
      ...PROFILE_DATA,
      createdAt: { toMillis: () => 1735689600000 },
    }));
    expect((await getOwnProfileRef('uid-1'))?.createdAt).toBe(1735689600000);

    invalidateOwnProfileCache();
    getDocMock.mockResolvedValueOnce(docSnapshot('uid-1', { ...PROFILE_DATA, createdAt: 1700000000000 }));
    expect((await getOwnProfileRef('uid-1'))?.createdAt).toBe(1700000000000);
  });

  /**
   * SIN FECHA, CERO Y NO UNA INVENTADA. Un perfil anterior a que existiera la marca no tiene antigüedad que
   * demostrar, y el cero deja los dos logros SIN conceder — que es el lado correcto de equivocarse.
   */
  it('sin `createdAt` legible se queda en 0, en vez de improvisar una antigüedad', async () => {
    for (const raw of [undefined, null, 'ayer', 0, -1, {}]) {
      invalidateOwnProfileCache();
      getDocMock.mockResolvedValueOnce(docSnapshot('uid-1', { ...PROFILE_DATA, createdAt: raw }));
      expect((await getOwnProfileRef('uid-1'))?.createdAt, String(raw)).toBe(0);
    }
  });

  it('cachea el resultado: dos lecturas seguidas hacen UNA sola lectura de red', async () => {
    getDocMock.mockResolvedValueOnce(docSnapshot('uid-1', PROFILE_DATA));

    await getOwnProfileRef('uid-1');
    await getOwnProfileRef('uid-1');

    expect(getDocMock).toHaveBeenCalledTimes(1);
  });

  it('sin documento devuelve null (dispositivo nuevo sin perfil)', async () => {
    getDocMock.mockResolvedValueOnce(docSnapshot('uid-1', null));

    expect(await getOwnProfileRef('uid-1')).toBeNull();
  });

  it('si las reglas deniegan la lectura, degrada a null en vez de propagar', async () => {
    getDocMock.mockRejectedValueOnce(Object.assign(new Error('denegado'), { code: 'permission-denied' }));

    expect(await getOwnProfileRef('uid-1')).toBeNull();
  });

  it('sigue leyendo los campos legacy del doc propio para poder purgarlos después', async () => {
    getDocMock.mockResolvedValueOnce(docSnapshot('uid-1', PROFILE_DATA));

    const profile = await getOwnProfileRef('uid-1');

    // `email`/`gamesGistId` ya no se ESCRIBEN, pero se leen del doc propio: es lo que permite detectar un perfil
    // sin purgar y borrárselos en el siguiente guardado.
    expect(profile?.email).toBe('yo@example.com');
    expect(profile?.gamesGistId).toBe('games-1');
  });
});

describe('findSocialProfileByEmail — fallback legacy', () => {
  it('encuentra el perfil de un doc cuyo id NO es el uid', async () => {
    getDocsMock.mockResolvedValueOnce({
      empty: false,
      docs: [{ id: 'doc-legacy', data: () => PROFILE_DATA }],
    });

    const profile = await findSocialProfileByEmail('YO@example.com ');

    expect(profile?.id).toBe('doc-legacy');
    expect(profile?.socialGistId).toBe('social-1');
  });

  it('sin resultados devuelve null', async () => {
    getDocsMock.mockResolvedValueOnce({ empty: true, docs: [] });

    expect(await findSocialProfileByEmail('nadie@example.com')).toBeNull();
  });

  // EL FILTRO QUE NO SE PUEDE QUITAR: en una consulta, las reglas exigen que lo que se pida sea legible de
  // antemano, y `profiles` solo lo es para un autenticado cuando `social.enabled == true`. Sin este `where` la
  // consulta se deniega ENTERA (lo verifica tests/integration/firestore.rules.test.ts) y el fallback legacy queda
  // muerto en silencio: `permission-denied` se traduce a "no hay perfil".
  it('consulta filtrando también por `social.enabled`, sin lo cual las reglas la denegarían', async () => {
    const { where } = await import('firebase/firestore/lite');
    (where as unknown as { mock: { calls: unknown[][] } }).mock.calls.length = 0;
    getDocsMock.mockResolvedValueOnce({ empty: true, docs: [] });

    await findSocialProfileByEmail('otro@example.com');

    expect(where).toHaveBeenCalledWith('email', '==', 'otro@example.com');
    expect(where).toHaveBeenCalledWith('social.enabled', '==', true);
  });
});
