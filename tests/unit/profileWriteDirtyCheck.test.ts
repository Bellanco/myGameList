import { beforeEach, describe, expect, it, vi } from 'vitest';

// `ensureProfileByEmail` corre en CADA publicación de reseña, y su chequeo de cambios existe para no reescribir el
// documento público cuando no hay nada que cambiar. Al dejar de publicarse `social.gistId`, ese chequeo comparaba un
// campo ya purgado (vacío en el doc) contra el id real de la sesión: daba SIEMPRE distinto y la escritura de ahorro
// dejó de ahorrar nada. Aquí se fija que un perfil sin cambios no se reescribe, y que uno con restos legacy sí.

const setDocMock = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});
const getOwnProfileRefMock = vi.fn<(...a: unknown[]) => unknown>(async () => null);

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ firestore: {} })),
  isPermissionDeniedError: () => false,
}));

vi.mock('../../src/model/repository/firebaseSocialRepository', () => ({
  findSocialProfileByEmail: vi.fn(async () => null),
  getOwnProfileRef: (...a: unknown[]) => getOwnProfileRefMock(...a),
  invalidateOwnProfileCache: vi.fn(),
  invalidateSocialDirectoryCache: vi.fn(),
  peekOwnProfileCache: () => null,
  saveOwnProfileCache: vi.fn(),
  saveProfileByEmailCache: vi.fn(),
}));

const getLocalMetaMock = vi.fn<(...a: unknown[]) => unknown>(async () => null);
const patchLocalMetaMock = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});

vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  seedProfileIdFromRemote: vi.fn(async (remote: string | null) => remote || 'pid-local'),
  getLocalMeta: (...a: unknown[]) => getLocalMetaMock(...a),
  patchLocalMeta: (...a: unknown[]) => patchLocalMetaMock(...a),
}));

vi.mock('../../src/model/repository/gistRepository', () => ({
  probeSocialGistEvidence: vi.fn(),
}));

vi.mock('firebase/firestore/lite', () => ({
  doc: (_fs: unknown, collection: string, id: string) => ({ collection, id }),
  // El latido de recencia comprueba que el doc exista antes de tocarlo.
  getDoc: vi.fn(async () => ({ exists: () => true, data: () => ({}) })),
  setDoc: (...a: unknown[]) => setDocMock(...a),
  deleteField: () => '__del__',
  serverTimestamp: () => '__ts__',
  writeBatch: () => ({ set: vi.fn(), commit: vi.fn(async () => {}) }),
}));

import { ensureProfileByEmail, forgetOwnAccountMemo } from '../../src/model/repository/firebaseRepository';

const UID = 'uid-1';
const SOCIAL_GIST = 'social-222';

/** Perfil ya migrado: sin email ni ids de gist publicados, con el nick, la foto y la fecha de alta al día. */
function perfilAlDia(overrides: Record<string, unknown> = {}) {
  return {
    id: UID,
    profileId: 'pid-1',
    createdAt: 1_700_000_000_000,
    email: '',
    displayName: 'Nick',
    photoURL: 'https://x/foto.png',
    socialGistId: '',
    gamesGistId: '',
    githubToken: '',
    socialEnabled: true,
    tier: 'bronze',
    ...overrides,
  };
}

/**
 * El latido de recencia también escribe en `profiles`, pero con una forma inconfundible: uid + updatedAt, y de paso el
 * borrado del ETag que guardaban los perfiles antiguos (`social.etag`).
 */
function esLatido(payload: Record<string, unknown>): boolean {
  if (!payload || !('uid' in payload) || !('updatedAt' in payload)) return false;
  const social = payload.social as Record<string, unknown> | undefined;
  const extra = Object.keys(payload).filter((key) => key !== 'uid' && key !== 'updatedAt');
  return extra.length === 0 || (extra.length === 1 && Boolean(social) && Object.keys(social!).join() === 'etag');
}

/** Guardados COMPLETOS del perfil (los que el chequeo de cambios debe evitar), sin contar el latido. */
function profileWrites() {
  return setDocMock.mock.calls.filter(
    (call) => (call[0] as { collection?: string })?.collection === 'profiles' && !esLatido(call[1] as Record<string, unknown>),
  );
}

function touchWrites() {
  return setDocMock.mock.calls.filter(
    (call) => (call[0] as { collection?: string })?.collection === 'profiles' && esLatido(call[1] as Record<string, unknown>),
  );
}

async function guardar() {
  await ensureProfileByEmail({
    user: { uid: UID, email: 'yo@example.com', displayName: 'Yo', photoURL: 'https://x/foto.png' },
    socialGistId: SOCIAL_GIST,
    gamesGistId: 'games-111',
    preferredName: 'Nick',
  });
}

beforeEach(() => {
  forgetOwnAccountMemo();
  setDocMock.mockClear();
  getOwnProfileRefMock.mockReset();
  getLocalMetaMock.mockReset();
  getLocalMetaMock.mockResolvedValue(null); // sin latido previo: toca refrescar
  patchLocalMetaMock.mockClear();
});

describe('ensureProfileByEmail — chequeo de cambios del perfil público', () => {
  it('NO reescribe el perfil cuando nada ha cambiado (ya migrado)', async () => {
    getOwnProfileRefMock.mockResolvedValue(perfilAlDia());

    await guardar();

    expect(profileWrites()).toHaveLength(0);
  });

  // Hasta la 1.6.9 la foto, la vitrina y el resumen del año podían crear el perfil antes del alta, y el alta, al
  // encontrarlo hecho, no sellaba la fecha nunca (docs/plan-firestore-sin-sobrantes.md, Fase 3).
  it('sella la fecha de alta que falta, en una escritura aparte y una sola vez por carga', async () => {
    getOwnProfileRefMock.mockResolvedValue(perfilAlDia({ createdAt: 0 }));

    await guardar();
    await guardar();

    const sellos = profileWrites().filter((call) => 'createdAt' in (call[1] as Record<string, unknown>));
    expect(sellos).toHaveLength(1);
    expect(sellos[0][1]).toEqual({ uid: UID, createdAt: '__ts__' });
    expect(sellos[0][2]).toEqual({ merge: true });
  });

  it('si la regla rechaza el sello (la fecha ya existía), el guardado sigue', async () => {
    getOwnProfileRefMock.mockResolvedValue(perfilAlDia({ createdAt: 0 }));
    setDocMock.mockImplementation(async (...args: unknown[]) => {
      if ('createdAt' in ((args[1] as Record<string, unknown>) || {})) throw new Error('permission-denied');
    });

    await expect(guardar()).resolves.toBeUndefined();
    setDocMock.mockImplementation(async () => {});
  });

  it('reescribe UNA vez el perfil que aún publica `social.gistId`, para purgarlo', async () => {
    // Único resto legacy: el id del gist social. Sin contarlo como tal, este perfil no se purgaría nunca.
    getOwnProfileRefMock.mockResolvedValue(perfilAlDia({ socialGistId: 'social-viejo' }));

    await guardar();

    const writes = profileWrites();
    expect(writes).toHaveLength(1);
    const social = (writes[0][1] as { social: Record<string, unknown> }).social;
    expect(social.gistId).toBe('__del__');
    expect(social.gamesGistId).toBe('__del__');
  });

  it('sigue reescribiendo cuando cambia algo de verdad (el nick)', async () => {
    getOwnProfileRefMock.mockResolvedValue(perfilAlDia({ displayName: 'NickViejo' }));

    await guardar();

    expect(profileWrites()).toHaveLength(1);
  });
});

// Publicar es actividad aunque el perfil no cambie. Si `updatedAt` se quedara parado, quien publica desde la ficha
// del juego sin abrir nunca el espacio social (donde late el hub) cruzaría el corte de inactividad de 30 días y sus
// amigos dejarían de leer su gist: sus reseñas y publicaciones se caerían de los feeds ajenos sin que él lo notara.
describe('ensureProfileByEmail — la recencia se refresca aunque no se reescriba el perfil', () => {
  it('refresca `updatedAt` cuando el perfil no cambia', async () => {
    getOwnProfileRefMock.mockResolvedValue(perfilAlDia());

    await guardar();

    expect(profileWrites()).toHaveLength(0);
    expect(touchWrites()).toHaveLength(1);
    expect(patchLocalMetaMock).toHaveBeenCalled();
  });

  it('respeta el acotado: con un latido reciente no escribe nada', async () => {
    getOwnProfileRefMock.mockResolvedValue(perfilAlDia());
    getLocalMetaMock.mockResolvedValue({ profileTouchedAt: Date.now() - 60_000 });

    await guardar();

    expect(profileWrites()).toHaveLength(0);
    expect(touchWrites()).toHaveLength(0);
    expect(patchLocalMetaMock).not.toHaveBeenCalled();
  });
});
