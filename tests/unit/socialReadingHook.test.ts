/**
 * LO QUE SE ESTÁ LEYENDO EN EL ESPACIO SOCIAL (`useSocialReading`): la actividad abierta del feed, la ficha de un
 * perfil y sus esperas.
 *
 * Este dominio vivía dentro de `useSocialViewModel` y solo se ejercitaba a través del hub entero, sin ningún test
 * de sus esperas: son las que deciden entre un esqueleto y un «no se ha encontrado» DEFINITIVO, y el fallo que
 * tapaban era justo ese —un mensaje definitivo durante un estado transitorio, al entrar por un enlace o recargar—.
 * Lo de `useForeignProfileGames` (de quién se leen los listados y cómo) tiene su propio fichero.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadForeignProfileGames = vi.hoisted(() => vi.fn(() => new Promise(() => {})));
const readPublicSocialGistById = vi.hoisted(() => vi.fn());

vi.mock('../../src/model/repository/foreignProfileRepository', () => ({ loadForeignProfileGames, invalidateProfileGames: vi.fn() }));
vi.mock('../../src/model/repository/socialGistRepository', () => ({ getSocialSyncConfig: () => null, readPublicSocialGistById }));

const { useSocialReading } = await import('../../src/viewmodel/social/useSocialReading');

const VISIBLE = { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true };

function actividad(overrides: Record<string, unknown> = {}) {
  return {
    key: 'k', type: 'review', gameId: 7, gameName: 'Hollow Knight', rating: 5, grade: 96, snippet: 'Muy bueno',
    updatedAt: 100, profileId: 'perfil-ana', actorProfileId: 'actor-ana', profileDisplayName: 'ana', photoURL: '',
    ...overrides,
  };
}

function entrada(overrides: Record<string, unknown> = {}) {
  return {
    id: 'perfil-ana', uid: 'uid-ana', displayName: 'ana', photoURL: '', tier: 'bronce',
    socialGistId: 'aaaa1111', gamesGistId: 'bbbb2222', activity: [actividad()], posts: [], moves: [],
    sharedLists: {}, visibility: VISIBLE,
    ...overrides,
  };
}

const RUTA_VACIA = { activePanel: 'feed', profileDetailId: '', profileReviewGameId: 0, detailActorUid: '', detailGameId: 0, detailEventType: '' };
const DETALLE = { ...RUTA_VACIA, activePanel: 'detail', detailActorUid: 'actor-ana', detailGameId: 7, detailEventType: 'review' };
const FICHA = { ...RUTA_VACIA, activePanel: 'profile-detail', profileDetailId: 'perfil-ana' };

/** Las opciones se fijan fuera del render, como en el hub (memos y callbacks estables). */
function setup(opciones: Record<string, unknown> = {}) {
  const opts = {
    route: RUTA_VACIA,
    directory: [entrada()],
    directoryLoading: false,
    patchDirectoryEntries: vi.fn(),
    ownUid: 'uid-yo',
    ownProfileId: 'perfil-yo',
    ownDisplayName: 'yo',
    relationshipWith: () => 'friends',
    localGames: { c: [{ id: 1, name: 'Mío' }], v: [], e: [], p: [], d: [], deleted: [], updatedAt: 0 },
    isAdmin: false,
    defaultVisibility: VISIBLE,
    fallbackToken: 'ghp_0123456789abcdefghij',
    navigate: vi.fn(),
    ...opciones,
  };
  const hook = renderHook((props: typeof opts) => useSocialReading(props as never), { initialProps: opts });
  return { ...hook, opts };
}

beforeEach(() => {
  vi.clearAllMocks();
  loadForeignProfileGames.mockImplementation(() => new Promise(() => {}));
});

describe('la actividad abierta desde el feed', () => {
  it('se busca en el directorio y, ante duplicados, gana la más reciente', () => {
    const { result } = setup({
      route: DETALLE,
      directory: [entrada({ activity: [actividad({ updatedAt: 100, snippet: 'vieja' }), actividad({ updatedAt: 200, snippet: 'nueva' })] })],
    });
    expect(result.current.activeDetailEvent?.snippet).toBe('nueva');
  });

  it('mientras el directorio puede traerla, espera; cuando ya no, deja de esperar', () => {
    const { result, rerender, opts } = setup({ route: DETALLE, directory: [], directoryLoading: true });
    expect(result.current.activeDetailEvent).toBeNull();
    expect(result.current.detailEventLoading).toBe(true);

    rerender({ ...opts, directoryLoading: false });
    // Ya no va a llegar: ahora sí toca el «no se ha encontrado».
    expect(result.current.detailEventLoading).toBe(false);
  });

  it('el análisis completo de una AMISTAD se espera mientras su gist de listados viene de camino', () => {
    const { result } = setup({ route: DETALLE });
    expect(result.current.detailReviewLoading).toBe(true);
  });

  it('de quien no es amistad no se espera nada: no se va a pedir', () => {
    const { result } = setup({ route: DETALLE, relationshipWith: () => 'none' });
    expect(result.current.detailReviewLoading).toBe(false);
    expect(loadForeignProfileGames).not.toHaveBeenCalled();
  });

  it('la propia sale de los listados locales: tampoco hay espera', () => {
    const propia = actividad({ profileId: 'perfil-yo', actorProfileId: 'actor-yo' });
    const { result } = setup({
      route: { ...DETALLE, detailActorUid: 'actor-yo' },
      directory: [entrada({ id: 'perfil-yo', uid: 'uid-yo', activity: [propia] })],
    });
    expect(result.current.isOwnDetailEvent).toBe(true);
    expect(result.current.detailReviewLoading).toBe(false);
  });
});

describe('la ficha de un perfil', () => {
  it('al recargar, espera al directorio en vez de decir que no existe', () => {
    const { result } = setup({ route: FICHA, directory: [], directoryLoading: true });
    expect(result.current.selectedProfileDetail).toBeNull();
    expect(result.current.profileDetailLoading).toBe(true);
  });

  it('«me» abre la ficha propia, con los listados locales', () => {
    const { result } = setup({
      route: { ...FICHA, profileDetailId: 'me' },
      directory: [entrada(), entrada({ id: 'perfil-yo', uid: 'uid-yo', displayName: 'yo' })],
    });
    expect(result.current.selectedProfileDetail?.id).toBe('perfil-yo');
    expect(result.current.isOwnProfileDetail).toBe(true);
    expect(result.current.selectedProfileDetail?.sharedLists?.c).toEqual([{ id: 1, name: 'Mío' }]);
  });

  /* Un amigo inactivo llega sin su gist social leído (`socialSkipped`): al abrir su ficha se lee, con el token que
     ya está hidratado —el de reserva, porque aquí no hay canal social propio—, y se completa su entrada. */
  it('de un amigo inactivo lee su gist social al abrir la ficha y completa su entrada', async () => {
    readPublicSocialGistById.mockResolvedValue({ profile: { name: 'Ana', photoURL: 'https://foto', visibility: VISIBLE } });
    const { opts } = setup({ route: FICHA, directory: [entrada({ socialSkipped: true })] });

    await waitFor(() => expect(opts.patchDirectoryEntries).toHaveBeenCalled());
    expect(readPublicSocialGistById).toHaveBeenCalledWith('aaaa1111', 'ghp_0123456789abcdefghij');
    const [, parche] = (opts.patchDirectoryEntries as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(parche).toEqual({ displayName: 'Ana', photoURL: 'https://foto', visibility: VISIBLE, socialSkipped: false, socialUnreadable: false });
  });

  /* Un gist social ILEGIBLE deja sin saber lo que esa persona esconde: al abrir su ficha se reintenta, y mientras
     tanto la ficha la pinta como todo oculto (fallar cerrado, 09-10-2026). */
  it('de un amigo con el gist social ilegible reintenta al abrir y, mientras, lo pinta todo oculto', async () => {
    readPublicSocialGistById.mockReturnValue(new Promise(() => {}));
    const { result } = setup({ route: FICHA, directory: [entrada({ socialUnreadable: true })] });

    await waitFor(() => expect(readPublicSocialGistById).toHaveBeenCalledWith('aaaa1111', 'ghp_0123456789abcdefghij'));
    expect(result.current.selectedProfileDetail?.visibility?.hiddenTabs).toEqual(['c', 'v', 'e', 'p', 'd']);
    expect(result.current.selectedProfileDetail?.visibility?.hideGameTime).toBe(true);
  });

  it('a mi propia ficha se va por identidad; sin entrada propia, al editor', () => {
    const navigate = vi.fn();
    const { result, rerender, opts } = setup({ navigate, directory: [entrada({ id: 'perfil-yo', uid: 'uid-yo' })] });
    result.current.openOwnProfileDetail();
    expect(navigate).toHaveBeenLastCalledWith('/social/profiles/perfil-yo');

    rerender({ ...opts, directory: [entrada()] });
    result.current.openOwnProfileDetail();
    expect(navigate).toHaveBeenLastCalledWith('/social/profile');
  });
});
