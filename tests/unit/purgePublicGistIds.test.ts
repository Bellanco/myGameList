import { beforeEach, describe, expect, it, vi } from 'vitest';

// Caso real: una cuenta migró su canal a un gist secreto y la migración BORRÓ el público, pero el perfil de
// Firestore siguió anunciando el id borrado. Sus amigos la leían igual (la hidratación fusiona candidatos y tolera
// un 404), pero gastaban una petición muerta por hidratación y el panel la marcaba como deriva para siempre: el
// campo solo se limpiaba al publicar algo, y quien ya migró no vuelve a pasar por la migración.
//
// La purga corre al abrir el espacio social. Lo delicado es lo que NO debe hacer: retirar un id que no esté
// respaldado en `privateConfig`, que es de donde se recupera el canal en otro dispositivo.

const setDocMock = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});
const getDocMock = vi.fn<(...a: unknown[]) => unknown>(async () => ({ exists: () => false, data: () => undefined }));

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ firestore: {} })),
  isPermissionDeniedError: () => false,
}));

vi.mock('../../src/model/repository/firebaseSocialRepository', () => ({
  findSocialProfileByEmail: vi.fn(async () => null),
  getOwnProfileRef: vi.fn(async () => null),
  invalidateOwnProfileCache: vi.fn(),
  invalidateSocialDirectoryCache: vi.fn(),
  peekOwnProfileTier: () => 'bronze',
  saveOwnProfileCache: vi.fn(),
  saveProfileByEmailCache: vi.fn(),
}));

vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  seedProfileIdFromRemote: vi.fn(async (remote: string | null) => remote || 'pid-local'),
  getLocalMeta: vi.fn(async () => null),
  patchLocalMeta: vi.fn(async () => {}),
}));

vi.mock('../../src/model/repository/gistRepository', () => ({
  probeSocialGistEvidence: vi.fn(),
}));

vi.mock('firebase/firestore/lite', () => ({
  doc: (_fs: unknown, collection: string, id: string) => ({ collection, id }),
  getDoc: (...a: unknown[]) => getDocMock(...a),
  setDoc: (...a: unknown[]) => setDocMock(...a),
  deleteField: () => '__del__',
  serverTimestamp: () => '__ts__',
  writeBatch: () => ({ set: vi.fn(), commit: vi.fn(async () => {}) }),
}));

import { purgeOwnPublicGistIds } from '../../src/model/repository/firebaseRepository';

const UID = 'uid-1';
const SOCIAL_VIVO = '27d8056c811e2f9fdb5a86d597195979';
const SOCIAL_MUERTO = 'c70848ccba387ea70e2138df2a1909f3';

/**
 * Encadena las dos lecturas que hace la purga: primero el perfil público, después `privateConfig`.
 * Un `undefined` en `privado` simula que no hay respaldo guardado.
 */
function conDatos(perfilSocial: Record<string, unknown> | null, privado: Record<string, unknown> | null) {
  getDocMock.mockImplementation(async (ref: unknown) => {
    const { collection } = ref as { collection: string };
    if (collection === 'profiles') {
      return perfilSocial === null
        ? { exists: () => false, data: () => undefined }
        : { exists: () => true, data: () => ({ uid: UID, social: perfilSocial }) };
    }
    return privado === null
      ? { exists: () => false, data: () => undefined }
      : { exists: () => true, data: () => privado };
  });
}

function profileWrites() {
  return setDocMock.mock.calls.filter((call) => (call[0] as { collection?: string })?.collection === 'profiles');
}

function privateConfigWrites() {
  return setDocMock.mock.calls.filter((call) => (call[0] as { collection?: string })?.collection === 'privateConfig');
}

beforeEach(() => {
  setDocMock.mockClear();
  getDocMock.mockReset();
});

describe('purgeOwnPublicGistIds', () => {
  it('retira el id muerto que el perfil aún anuncia cuando el respaldo coincide con la sesión', async () => {
    conDatos({ enabled: true, gistId: SOCIAL_MUERTO }, { socialGistId: SOCIAL_VIVO });

    const purgado = await purgeOwnPublicGistIds({ uid: UID, socialGistId: SOCIAL_VIVO, gamesGistId: '' });

    expect(purgado).toBe(true);
    const social = (profileWrites()[0][1] as { social: Record<string, unknown> }).social;
    expect(social.gistId).toBe('__del__');
    // El gist de juegos NO estaba publicado: no se toca.
    expect(social).not.toHaveProperty('gamesGistId');
  });

  it('no escribe nada si el perfil ya no publica ningún id', async () => {
    conDatos({ enabled: true }, { socialGistId: SOCIAL_VIVO });

    expect(await purgeOwnPublicGistIds({ uid: UID, socialGistId: SOCIAL_VIVO, gamesGistId: '' })).toBe(false);
    expect(profileWrites()).toHaveLength(0);
  });

  it('NO retira nada si no hay respaldo en privateConfig: dejaría el canal irrecuperable', async () => {
    conDatos({ enabled: true, gistId: SOCIAL_MUERTO }, null);

    expect(await purgeOwnPublicGistIds({ uid: UID, socialGistId: SOCIAL_VIVO, gamesGistId: '' })).toBe(false);
    expect(profileWrites()).toHaveLength(0);
  });

  it('NO retira el id social si el respaldo apunta a otro canal (otro dispositivo migró)', async () => {
    // `privateConfig` manda y dice otra cosa que la sesión: aquí no se sabe cuál gana, así que no se toca nada.
    conDatos({ enabled: true, gistId: SOCIAL_MUERTO }, { socialGistId: 'canal-de-otro-dispositivo' });

    expect(await purgeOwnPublicGistIds({ uid: UID, socialGistId: SOCIAL_VIVO, gamesGistId: '' })).toBe(false);
    expect(profileWrites()).toHaveLength(0);
  });

  it('NO retira el gist de juegos sin respaldo, aunque sí retire el social', async () => {
    // Dispositivo sin la sincronización principal: `privateConfig` no tiene `gamesGistId`. Purgarlo lo perdería.
    conDatos({ enabled: true, gistId: SOCIAL_MUERTO, gamesGistId: 'games-999' }, { socialGistId: SOCIAL_VIVO });

    expect(await purgeOwnPublicGistIds({ uid: UID, socialGistId: SOCIAL_VIVO, gamesGistId: '' })).toBe(true);
    const social = (profileWrites()[0][1] as { social: Record<string, unknown> }).social;
    expect(social.gistId).toBe('__del__');
    expect(social).not.toHaveProperty('gamesGistId');
  });

  it('nunca escribe en privateConfig: comprueba el respaldo, no lo crea', async () => {
    conDatos({ enabled: true, gistId: SOCIAL_MUERTO }, { socialGistId: SOCIAL_VIVO });

    await purgeOwnPublicGistIds({ uid: UID, socialGistId: SOCIAL_VIVO, gamesGistId: '' });

    expect(privateConfigWrites()).toHaveLength(0);
  });
});
