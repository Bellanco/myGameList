/**
 * EL HOOK de los listados de otra persona (`useForeignProfileGames`).
 *
 * Fichero APARTE de `foreignProfileGames.test.ts`, que cubre la capa de abajo —la lectura del gist ajeno, el
 * recorte por visibilidad y las dos cachés de IndexedDB— y no se toca aquí. Lo de este fichero es la pieza que
 * decide CUÁNDO se pide y QUÉ se hace con lo que llega.
 *
 * Este dominio vivía dentro de `useSocialViewModel` y solo se ejercitaba de refilón, a través del hub entero.
 * Sus tres reglas —de quién se leen, con qué recorte se guardan y qué pasa cuando no se puede leer— son de
 * PRIVACIDAD y de comportamiento visible, así que aquí se afirman una por una:
 *
 *  1. Solo de amistades. El gist de listados lleva la biblioteca completa (reseñas, notas, horas): de un
 *     no-amigo no se pide NADA, ni para pintar su ficha.
 *  2. Lo que se guarda ya viene filtrado por la visibilidad de su dueño, no al pintar.
 *  3. Un fallo se apunta, para que la pantalla deje de esperar un cuerpo que no va a llegar.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadForeignProfileGames = vi.hoisted(() => vi.fn());
const invalidateProfileGames = vi.hoisted(() => vi.fn(async () => {}));
const applyProfileVisibility = vi.hoisted(() => vi.fn((games: unknown) => games));

vi.mock('../../src/model/repository/foreignProfileRepository', () => ({ loadForeignProfileGames, invalidateProfileGames }));
vi.mock('../../src/core/utils/profileVisibility', () => ({ applyProfileVisibility }));
vi.mock('../../src/model/repository/socialGistRepository', () => ({ getSocialSyncConfig: () => null }));

const { useForeignProfileGames } = await import('../../src/viewmodel/social/useForeignProfileGames');

const LISTAS = { c: [{ id: 7, name: 'Hollow Knight' }], v: [], e: [], p: [] };

function entrada(overrides: Record<string, unknown> = {}) {
  return {
    id: 'perfil-ana', uid: 'uid-ana', displayName: 'ana', photoURL: '', tier: 'bronce',
    socialGistId: 'aaaa1111', gamesGistId: 'bbbb2222', activity: [], posts: [], moves: [],
    sharedLists: {}, visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true },
    ...overrides,
  };
}

/**
 * Las opciones se construyen UNA vez y fuera del render, igual que en el hub: allí el directorio es un `useMemo`
 * y `relationshipWith` un `useCallback`. No es cosmética — son dependencias del efecto de carga, así que con
 * referencias nuevas en cada render la lectura en vuelo se cancela y se relanza, y una que iba a fallar acaba
 * resolviendo en el reintento. Es decir: pasarlas inestables cambia lo que la prueba mide.
 */
function setup(opciones: Record<string, unknown> = {}) {
  const opts = {
    activePanel: 'profile-detail',
    profileDetailId: 'perfil-ana',
    detailProfileId: '',
    ownUid: 'uid-yo',
    ownProfileId: 'perfil-yo',
    directory: [entrada()] as never,
    relationshipWith: () => 'friends',
    localGames: { c: [{ id: 1, name: 'Mío' }], v: [], e: [], p: [], deleted: [], updatedAt: 0 } as never,
    isAdmin: false,
    defaultVisibility: {} as never,
    fallbackToken: 'ghp_0123456789abcdefghij',
    ...opciones,
  };
  const hook = renderHook((props: typeof opts) => useForeignProfileGames(props as never), { initialProps: opts });
  return { ...hook, opts };
}

beforeEach(() => {
  vi.clearAllMocks();
  loadForeignProfileGames.mockResolvedValue(LISTAS);
  applyProfileVisibility.mockImplementation((games: unknown) => games);
});

describe('listados de otra persona', () => {
  it('baja el gist de un AMIGO y lo guarda ya filtrado por la visibilidad de su dueño', async () => {
    const { result } = setup();

    await waitFor(() => expect(result.current.foreignGames['perfil-ana']).toBeTruthy());
    expect(loadForeignProfileGames).toHaveBeenCalledWith({
      profileId: 'perfil-ana', gamesGistId: 'bbbb2222', token: 'ghp_0123456789abcdefghij',
    });
    // Regla 2: el recorte se aplica AL GUARDAR, con el rango de quien mira dentro.
    expect(applyProfileVisibility).toHaveBeenCalledWith(LISTAS, expect.objectContaining({ hiddenTabs: [] }), false);
  });

  it('de quien NO es amigo no se lee nada, ni para pintar su ficha', async () => {
    const { result } = setup({ relationshipWith: () => 'none' });

    await waitFor(() => expect(result.current.loadingForeignProfile).toBe(false));
    expect(loadForeignProfileGames).not.toHaveBeenCalled();
    expect(result.current.foreignGames['perfil-ana']).toBeUndefined();
  });

  it('del perfil PROPIO tampoco: sus juegos ya están en local', async () => {
    const { result } = setup({ profileDetailId: 'perfil-yo' });

    await waitFor(() => expect(result.current.loadingForeignProfile).toBe(false));
    expect(loadForeignProfileGames).not.toHaveBeenCalled();
  });

  it('en una pantalla que no pide listados no se toca la red', async () => {
    const { result } = setup({ activePanel: 'feed' });

    await waitFor(() => expect(result.current.loadingForeignProfile).toBe(false));
    expect(loadForeignProfileGames).not.toHaveBeenCalled();
  });

  it('si el gist no se puede leer, lo apunta y deja de esperar', async () => {
    loadForeignProfileGames.mockRejectedValueOnce(new Error('404'));
    const { result } = setup();

    await waitFor(() => expect(result.current.foreignProfileFailed['perfil-ana']).toBe(true));
    // Y el indicador de «bajando» baja igual: si no, la pantalla se queda esperando.
    await waitFor(() => expect(result.current.loadingForeignProfile).toBe(false));
  });

  it('un juego ajeno sale de la lista bajada; uno propio, de los listados locales', async () => {
    const { result } = setup();

    await waitFor(() => expect(result.current.foreignGames['perfil-ana']).toBeTruthy());
    expect(result.current.getGameItemById('perfil-ana', 7)?.name).toBe('Hollow Knight');
    expect(result.current.getGameItemById('perfil-yo', 1)?.name).toBe('Mío');
    // Un juego que no está en ninguna de las dos no se inventa.
    expect(result.current.getGameItemById('perfil-ana', 999)).toBeNull();
  });

  // EL FILTRO LO DECIDE EL CLAIM, y lo bajado se filtró con el de entonces: si cambia con la sesión abierta, lo
  // guardado se tira y se vuelve a pedir, ya con el nuevo.
  it('filtra con el claim de administración y vuelve a pedir si cambia', async () => {
    const { result, rerender, opts } = setup();
    await waitFor(() => expect(result.current.foreignGames['perfil-ana']).toBeTruthy());
    expect(applyProfileVisibility).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), false);

    loadForeignProfileGames.mockClear();
    rerender({ ...opts, isAdmin: true });

    await waitFor(() => expect(loadForeignProfileGames).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(applyProfileVisibility).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), true));
  });
});
