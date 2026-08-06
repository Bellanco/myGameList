import { beforeEach, describe, expect, it, vi } from 'vitest';

// Auto-saneado del perfil al iniciar sesión. Lo que se verifica aquí es sobre todo el ORDEN: preservar (token
// cifrado, id del gist, pseudónimo canónico en `privateConfig`/`userMap`) y solo entonces escribir el documento
// público. Si algo de la preservación falla, no se toca el documento.
const getOwnProfileRefMock = vi.fn<(...a: unknown[]) => unknown>();
const getPrivateConfigMock = vi.fn<(...a: unknown[]) => unknown>();
const setPrivateConfigMock = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});
const backupGithubTokenMock = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});
const setUserMapMock = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});
const resolveStableProfileIdMock = vi.fn<(...a: unknown[]) => Promise<string>>(async () => 'pid-nuevo');
const updateDocMock = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});
const invalidateOwnProfileCacheMock = vi.fn();
const reportHandledErrorMock = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});
const setDocMock = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});
const findSocialProfileByEmailMock = vi.fn<(...a: unknown[]) => unknown>(async () => null);
const invalidateProfileByEmailCacheMock = vi.fn();

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ firestore: { __fs: true } })),
  isPermissionDeniedError: () => false,
}));

vi.mock('../../src/model/repository/telemetryRepository', () => ({
  reportHandledError: (...a: unknown[]) => reportHandledErrorMock(...a),
}));

vi.mock('../../src/model/repository/firebaseRepository', () => ({
  getPrivateConfig: (...a: unknown[]) => getPrivateConfigMock(...a),
  setPrivateConfig: (...a: unknown[]) => setPrivateConfigMock(...a),
  backupGithubToken: (...a: unknown[]) => backupGithubTokenMock(...a),
  setUserMap: (...a: unknown[]) => setUserMapMock(...a),
  resolveStableProfileId: (...a: unknown[]) => resolveStableProfileIdMock(...a),
}));

vi.mock('../../src/model/repository/firebaseSocialRepository', () => ({
  getOwnProfileRef: (...a: unknown[]) => getOwnProfileRefMock(...a),
  findSocialProfileByEmail: (...a: unknown[]) => findSocialProfileByEmailMock(...a),
  invalidateOwnProfileCache: (...a: unknown[]) => invalidateOwnProfileCacheMock(...a),
  invalidateProfileByEmailCache: (...a: unknown[]) => invalidateProfileByEmailCacheMock(...a),
  invalidateSocialDirectoryCache: vi.fn(),
}));

vi.mock('firebase/firestore/lite', () => ({
  doc: (_fs: unknown, name: string, id: string) => ({ collection: name, id }),
  updateDoc: (...a: unknown[]) => updateDocMock(...a),
  setDoc: (...a: unknown[]) => setDocMock(...a),
  serverTimestamp: () => '__ts__',
  deleteField: () => '__del__',
}));

import { healOwnLegacyProfile } from '../../src/model/repository/firebaseProfileHealRepository';

// Perfil SANO por defecto: al día de esquema y con su identidad pseudónima establecida. Cada test estropea solo
// lo que quiere probar.
function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'uid-a',
    profileId: 'pid-a',
    schemaVersion: 1,
    displayName: 'Ada',
    email: '',
    photoURL: '',
    socialGistId: 'gs',
    gamesGistId: '',
    githubToken: '',
    socialEnabled: true,
    ...overrides,
  };
}

describe('healOwnLegacyProfile', () => {
  beforeEach(() => {
    getOwnProfileRefMock.mockReset();
    getPrivateConfigMock.mockReset();
    getPrivateConfigMock.mockResolvedValue(null);
    setPrivateConfigMock.mockClear();
    setPrivateConfigMock.mockResolvedValue(undefined);
    backupGithubTokenMock.mockClear();
    backupGithubTokenMock.mockResolvedValue(undefined);
    setUserMapMock.mockClear();
    setUserMapMock.mockResolvedValue(undefined);
    resolveStableProfileIdMock.mockClear();
    resolveStableProfileIdMock.mockResolvedValue('pid-nuevo');
    updateDocMock.mockClear();
    updateDocMock.mockResolvedValue(undefined);
    invalidateOwnProfileCacheMock.mockClear();
    reportHandledErrorMock.mockClear();
    setDocMock.mockClear();
    setDocMock.mockResolvedValue(undefined);
    findSocialProfileByEmailMock.mockClear();
    findSocialProfileByEmailMock.mockResolvedValue(null);
    invalidateProfileByEmailCacheMock.mockClear();
  });

  /** Escritura dirigida a `profiles`, que es la que crea el documento canónico del cutover. */
  function canonicalWrite() {
    const call = setDocMock.mock.calls.find((entry) => (entry[0] as { collection?: string })?.collection === 'profiles');
    return call ? (call[1] as Record<string, unknown>) : null;
  }

  it('un perfil ya limpio no provoca NINGUNA escritura', async () => {
    getOwnProfileRefMock.mockResolvedValue(profile());

    const healResult = await healOwnLegacyProfile('uid-a');

    expect(healResult.status).toBe('clean');
    expect(updateDocMock).not.toHaveBeenCalled();
    expect(setPrivateConfigMock).not.toHaveBeenCalled();
    expect(backupGithubTokenMock).not.toHaveBeenCalled();
  });

  it('respalda el token cifrado ANTES de borrar el que está en claro', async () => {
    getOwnProfileRefMock.mockResolvedValue(profile({ githubToken: 'ghp_legacy' }));
    const order: string[] = [];
    backupGithubTokenMock.mockImplementation(async () => { order.push('backup'); });
    updateDocMock.mockImplementation(async () => { order.push('purge'); });

    const healResult = await healOwnLegacyProfile('uid-a');

    expect(healResult).toMatchObject({ status: 'healed', backedUpToken: true });
    expect(backupGithubTokenMock).toHaveBeenCalledWith('uid-a', 'ghp_legacy');
    expect(order).toEqual(['backup', 'purge']);
  });

  // EL TEST QUE IMPORTA: si el respaldo falla, purgar dejaría al usuario sin token en su próximo dispositivo.
  it('si el respaldo del token falla, NO purga nada y lo deja para el próximo arranque', async () => {
    getOwnProfileRefMock.mockResolvedValue(profile({ githubToken: 'ghp_legacy' }));
    backupGithubTokenMock.mockRejectedValue(new Error('offline'));

    const healResult = await healOwnLegacyProfile('uid-a');

    expect(healResult).toMatchObject({ status: 'deferred', deferredAt: 'respaldo-token', detail: 'offline' });
    expect(updateDocMock).not.toHaveBeenCalled();
    // DIAGNÓSTICO: un saneado que no puede completarse deja rastro fuera de la consola del usuario.
    expect(reportHandledErrorMock).toHaveBeenCalledWith(expect.anything(), false, 'profile-heal:respaldo-token');
  });

  it('si ya existe el respaldo cifrado no lo reescribe, pero sí purga el token en claro', async () => {
    getOwnProfileRefMock.mockResolvedValue(profile({ githubToken: 'ghp_legacy' }));
    getPrivateConfigMock.mockResolvedValue({ encryptedGithubToken: 'ya-cifrado' });

    const healResult = await healOwnLegacyProfile('uid-a');

    expect(healResult).toMatchObject({ status: 'healed', backedUpToken: false });
    expect(backupGithubTokenMock).not.toHaveBeenCalled();
    expect(updateDocMock).toHaveBeenCalledTimes(1);
  });

  it('siembra el id del gist en privateConfig antes de borrarlo del perfil público', async () => {
    getOwnProfileRefMock.mockResolvedValue(profile({ gamesGistId: 'gg-legacy' }));

    const healResult = await healOwnLegacyProfile('uid-a');

    expect(healResult).toMatchObject({ status: 'healed', seededGamesGistId: true });
    expect(setPrivateConfigMock).toHaveBeenCalledWith('uid-a', { gamesGistId: 'gg-legacy' });
  });

  it('no pisa el id del gist que ya tenga la configuración privada', async () => {
    getOwnProfileRefMock.mockResolvedValue(profile({ gamesGistId: 'gg-viejo' }));
    getPrivateConfigMock.mockResolvedValue({ gamesGistId: 'gg-bueno' });

    const healResult = await healOwnLegacyProfile('uid-a');

    expect(healResult).toMatchObject({ status: 'healed', seededGamesGistId: false });
    expect(setPrivateConfigMock).not.toHaveBeenCalled();
  });

  it('la purga incluye `uid`, sin el cual las reglas la denegarían en perfiles viejos', async () => {
    getOwnProfileRefMock.mockResolvedValue(profile({ email: 'legacy@example.com' }));

    await healOwnLegacyProfile('uid-a');

    // Un perfil ya sellado y con pseudónimo no vuelve a recibir ni `schemaVersion` ni `profileId`.
    expect(updateDocMock.mock.calls[0][1]).toEqual({
      uid: 'uid-a',
      email: '__del__',
      'social.gamesGistId': '__del__',
      'social.githubToken': '__del__',
    });
    // El directorio y el perfil propio cacheados ya no valen tras la purga.
    expect(invalidateOwnProfileCacheMock).toHaveBeenCalledWith('uid-a');
  });

  // --- Identidad pseudónima ausente (señal `no-profile-id` del panel) ---

  it('establece la copia CANÓNICA del pseudónimo antes de sellarlo en el documento público', async () => {
    getOwnProfileRefMock.mockResolvedValue(profile({ profileId: '' }));
    const order: string[] = [];
    setUserMapMock.mockImplementation(async () => { order.push('userMap'); });
    setPrivateConfigMock.mockImplementation(async () => { order.push('privateConfig'); });
    updateDocMock.mockImplementation(async () => { order.push('public'); });

    const healResult = await healOwnLegacyProfile('uid-a');

    expect(healResult).toMatchObject({ status: 'healed', establishedProfileId: true });
    expect(order).toEqual(['userMap', 'privateConfig', 'public']);
    expect(setUserMapMock).toHaveBeenCalledWith('uid-a', 'pid-nuevo');
    // Solo el pseudónimo: `setPrivateConfig` hace merge y mandar ids de gist vacíos los BORRARÍA.
    expect(setPrivateConfigMock).toHaveBeenCalledWith('uid-a', { profileId: 'pid-nuevo' });
    expect(updateDocMock.mock.calls[0][1]).toMatchObject({ uid: 'uid-a', profileId: 'pid-nuevo' });
  });

  it('no reescribe la copia canónica que ya coincide: solo le falta el sello del documento público', async () => {
    getOwnProfileRefMock.mockResolvedValue(profile({ profileId: '' }));
    getPrivateConfigMock.mockResolvedValue({ profileId: 'pid-nuevo' });

    const healResult = await healOwnLegacyProfile('uid-a');

    expect(healResult).toMatchObject({ status: 'healed', establishedProfileId: true });
    expect(setPrivateConfigMock).not.toHaveBeenCalled();
    expect(updateDocMock.mock.calls[0][1]).toMatchObject({ profileId: 'pid-nuevo' });
  });

  // El pseudónimo del doc público tiene que ser el MISMO con el que ese usuario ya publica; si no, sus reseñas
  // quedan atribuidas a dos identidades distintas. `resolveStableProfileId` es quien lo reconcilia.
  it('usa el pseudónimo que resuelve la identidad estable, no uno inventado aquí', async () => {
    getOwnProfileRefMock.mockResolvedValue(profile({ profileId: '' }));
    resolveStableProfileIdMock.mockResolvedValue('pid-remoto-canonico');

    await healOwnLegacyProfile('uid-a');

    expect(resolveStableProfileIdMock).toHaveBeenCalledWith('uid-a');
    expect(setUserMapMock).toHaveBeenCalledWith('uid-a', 'pid-remoto-canonico');
    expect(updateDocMock.mock.calls[0][1]).toMatchObject({ profileId: 'pid-remoto-canonico' });
  });

  // EL OTRO TEST QUE IMPORTA: sellar el pseudónimo en el doc público sin que la copia canónica haya aterrizado es
  // justo la deriva que este saneado viene a evitar (el cliente lo pisaría en su siguiente guardado).
  it('si la copia canónica del pseudónimo falla, NO escribe el documento público', async () => {
    getOwnProfileRefMock.mockResolvedValue(profile({ profileId: '' }));
    setUserMapMock.mockRejectedValue(new Error('permission-denied'));

    const healResult = await healOwnLegacyProfile('uid-a');

    expect(healResult).toMatchObject({ status: 'deferred', deferredAt: 'identidad' });
    expect(updateDocMock).not.toHaveBeenCalled();
    expect(reportHandledErrorMock).toHaveBeenCalledWith(expect.anything(), false, 'profile-heal:identidad');
  });

  it('si la escritura del documento público falla, lo dice y lo deja para el próximo arranque', async () => {
    getOwnProfileRefMock.mockResolvedValue(profile({ schemaVersion: 0 }));
    updateDocMock.mockRejectedValue(new Error('permission-denied'));

    const healResult = await healOwnLegacyProfile('uid-a');

    expect(healResult).toMatchObject({ status: 'deferred', deferredAt: 'escritura-publica', detail: 'permission-denied' });
    expect(reportHandledErrorMock).toHaveBeenCalledWith(expect.anything(), false, 'profile-heal:escritura-publica');
  });

  it('no toca la identidad de quien ya tiene pseudónimo, aunque haya que purgarle restos', async () => {
    getOwnProfileRefMock.mockResolvedValue(profile({ githubToken: 'ghp_legacy' }));

    await healOwnLegacyProfile('uid-a');

    expect(resolveStableProfileIdMock).not.toHaveBeenCalled();
    expect(setUserMapMock).not.toHaveBeenCalled();
    expect(updateDocMock.mock.calls[0][1]).not.toHaveProperty('profileId');
  });

  // --- Marca de esquema atrasada (señal `stale-schema` del panel) ---

  it('vuelve a sellar el esquema de un perfil antiguo sin restos, en una sola escritura', async () => {
    getOwnProfileRefMock.mockResolvedValue(profile({ schemaVersion: 0 }));

    const healResult = await healOwnLegacyProfile('uid-a');

    expect(healResult).toMatchObject({ status: 'healed', stampedSchema: true, establishedProfileId: false });
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    expect(updateDocMock.mock.calls[0][1]).toMatchObject({ uid: 'uid-a', schemaVersion: 1 });
    // No es actividad del usuario: el latido `updatedAt` no se mueve. Y `createdAt` es inmutable en las reglas.
    expect(updateDocMock.mock.calls[0][1]).not.toHaveProperty('updatedAt');
    expect(updateDocMock.mock.calls[0][1]).not.toHaveProperty('createdAt');
  });

  it('un perfil sin pseudónimo Y con esquema antiguo se arregla del todo en una escritura', async () => {
    getOwnProfileRefMock.mockResolvedValue(profile({ profileId: '', schemaVersion: 0 }));

    const healResult = await healOwnLegacyProfile('uid-a');

    expect(healResult).toMatchObject({ status: 'healed', establishedProfileId: true, stampedSchema: true });
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    expect(updateDocMock.mock.calls[0][1]).toMatchObject({ profileId: 'pid-nuevo', schemaVersion: 1 });
  });

  it('un documento sin marca de esquema cuenta como versión 0 y se sella', async () => {
    // Es el caso real del `stale-schema`: perfiles anteriores a que la marca existiera, que no traen el campo.
    getOwnProfileRefMock.mockResolvedValue(profile({ schemaVersion: undefined }));

    expect((await healOwnLegacyProfile('uid-a')).stampedSchema).toBe(true);
  });

  it('sin documento canónico y sin perfil legacy que migrar, no hace nada', async () => {
    getOwnProfileRefMock.mockResolvedValue(null); // `profiles/{uid}` no existe

    const healResult = await healOwnLegacyProfile('uid-a', 'yo@example.com');

    expect(healResult.status).toBe('foreign-doc');
    expect(updateDocMock).not.toHaveBeenCalled();
    expect(setDocMock).not.toHaveBeenCalled();
  });

  // --- Cutover de identidad, primera mitad (la que puede hacer el dueño) ---

  describe('cutover de identidad', () => {
    const legacy = (overrides: Record<string, unknown> = {}) => profile({
      id: 'doc-legacy',
      displayName: 'Ada',
      email: 'yo@example.com',
      gamesGistId: 'gg-legacy',
      socialGistId: 'gs-legacy',
      githubToken: 'ghp_legacy',
      ...overrides,
    });

    it('crea el documento canónico LIMPIO y rescata antes lo que solo vivía en el huérfano', async () => {
      getOwnProfileRefMock.mockResolvedValue(null);
      findSocialProfileByEmailMock.mockResolvedValue(legacy());
      const order: string[] = [];
      backupGithubTokenMock.mockImplementation(async () => { order.push('token'); });
      setPrivateConfigMock.mockImplementation(async () => { order.push('privateConfig'); });
      setDocMock.mockImplementation(async () => { order.push('canonico'); });

      const healResult = await healOwnLegacyProfile('uid-a', 'yo@example.com');

      expect(healResult).toMatchObject({ status: 'migrated', backedUpToken: true, seededGamesGistId: true });
      // RESCATAR y luego CREAR: si el rescate falla, no debe existir un documento canónico sin token ni gists.
      expect(order[order.length - 1]).toBe('canonico');
      expect(order).toContain('token');
      // Los dos ids de gist van a `privateConfig` (owner-only), que es donde debían estar.
      expect(setPrivateConfigMock).toHaveBeenCalledWith('uid-a', { gamesGistId: 'gg-legacy', socialGistId: 'gs-legacy' });

      // El documento nuevo NO arrastra el email, ni los ids de gist, ni el token en claro.
      const written = canonicalWrite();
      expect(written).toMatchObject({ uid: 'uid-a', displayName: 'Ada', schemaVersion: 1, profileId: 'pid-nuevo' });
      expect(written).not.toHaveProperty('email');
      expect(written).not.toHaveProperty('tier'); // las reglas prohíben al dueño estrenarse un rango
      expect((written?.social as Record<string, unknown>)).toEqual({ enabled: true, etag: null });
      // `updatedAt` es obligatorio: el directorio ordena por él y excluye los documentos que no lo traen.
      expect(written).toHaveProperty('updatedAt', '__ts__');

      // Y el huérfano se queda intacto: las reglas no dejan al dueño ni borrarlo ni apagarlo.
      expect(updateDocMock).not.toHaveBeenCalled();
      expect(setDocMock.mock.calls.every((call) => (call[0] as { id?: string }).id !== 'doc-legacy')).toBe(true);
      // La referencia cacheada por correo apunta al huérfano: hay que olvidarla o las escrituras irían allí.
      expect(invalidateProfileByEmailCacheMock).toHaveBeenCalledWith('yo@example.com');
    });

    // Si el legacy no tiene nick, el nombre de la sesión de Google antes que dejar el perfil congelado. Crear el
    // canónico sin nombre sería la anomalía `no-display-name`; no migrar es peor todavía. El correo no se usa.
    it('usa el nombre de la sesión cuando el perfil legacy no tiene nick', async () => {
      getOwnProfileRefMock.mockResolvedValue(null);
      findSocialProfileByEmailMock.mockResolvedValue(legacy({ displayName: '' }));

      const healResult = await healOwnLegacyProfile('uid-a', 'yo@example.com', 'Ada de Google');

      expect(healResult.status).toBe('migrated');
      expect(canonicalWrite()).toMatchObject({ displayName: 'Ada de Google' });
      expect(canonicalWrite()?.displayName).not.toBe('yo@example.com');
    });

    it('sin nombre en ninguna parte no crea nada: eso lo mueve el panel', async () => {
      getOwnProfileRefMock.mockResolvedValue(null);
      findSocialProfileByEmailMock.mockResolvedValue(legacy({ displayName: '' }));

      const healResult = await healOwnLegacyProfile('uid-a', 'yo@example.com');

      expect(healResult.status).toBe('foreign-doc');
      expect(setDocMock).not.toHaveBeenCalled();
    });

    // La caché del perfil propio puede servir, bajo el uid, la referencia de un documento legacy con otro id
    // (`ensureProfileByEmail` la guarda así). Ahí el cutover ya tiene la referencia en la mano.
    it('aprovecha la referencia cacheada con otro id sin volver a buscar por correo', async () => {
      getOwnProfileRefMock.mockResolvedValue(legacy({ profileId: '', schemaVersion: 0 }));

      const healResult = await healOwnLegacyProfile('uid-a', 'yo@example.com');

      expect(healResult.status).toBe('migrated');
      expect(findSocialProfileByEmailMock).not.toHaveBeenCalled();
      expect(canonicalWrite()).toMatchObject({ uid: 'uid-a', displayName: 'Ada' });
    });

    it('si el rescate del token falla, NO crea el documento canónico y lo dice', async () => {
      getOwnProfileRefMock.mockResolvedValue(null);
      findSocialProfileByEmailMock.mockResolvedValue(legacy());
      backupGithubTokenMock.mockRejectedValue(new Error('offline'));

      const healResult = await healOwnLegacyProfile('uid-a', 'yo@example.com');

      expect(healResult).toMatchObject({ status: 'deferred', deferredAt: 'cutover-identidad' });
      expect(setDocMock).not.toHaveBeenCalled();
      expect(reportHandledErrorMock).toHaveBeenCalledWith(expect.anything(), false, 'profile-heal:cutover-identidad');
    });

    it('sin correo no se puede localizar el perfil legacy: no se inventa nada', async () => {
      getOwnProfileRefMock.mockResolvedValue(null);

      expect((await healOwnLegacyProfile('uid-a')).status).toBe('foreign-doc');
      expect(findSocialProfileByEmailMock).not.toHaveBeenCalled();
      expect(setDocMock).not.toHaveBeenCalled();
    });
  });

  it('sin uid no hace nada, y no lo reporta: no hay sesión todavía, no es un fallo', async () => {
    expect(await healOwnLegacyProfile('')).toMatchObject({ status: 'deferred', deferredAt: 'sin-sesion' });
    expect(getOwnProfileRefMock).not.toHaveBeenCalled();
    expect(reportHandledErrorMock).not.toHaveBeenCalled();
  });
});
