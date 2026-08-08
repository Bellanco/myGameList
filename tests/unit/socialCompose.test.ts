import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// El compositor de publicaciones NO tenía ninguna prueba: los tests del hub no llegaban a `handlePublishPost`,
// así que su comportamiento (límite por rango, refresco del feed, avisos) solo estaba descrito en comentarios.
// Al salir del ViewModel a su propio hook se puede ejercitar aislado, que es buena parte de la razón de moverlo.

const publishPost = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../../src/model/repository/socialPublishRepository', () => ({ publishPost }));

const { useSocialCompose } = await import('../../src/viewmodel/social/useSocialCompose');
const { SOCIAL_UI } = await import('../../src/core/constants/labels');
const { PROFILE_TIER_POST_MAX_LENGTH } = await import('../../src/core/constants/tiers');

function setup(tier: 'bronze' | 'silver' | 'gold' | 'mithril' = 'silver') {
  const onPublished = vi.fn(async () => {});
  const setFeedback = vi.fn();
  const hook = renderHook(() => useSocialCompose({ ownTier: tier, onPublished, setFeedback }));
  return { ...hook, onPublished, setFeedback };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('compositor de publicaciones', () => {
  it('publica con el límite del rango, vacía el cuadro y refresca el feed', async () => {
    const { result, onPublished, setFeedback } = setup('silver');

    act(() => { result.current.setComposePostText('  Hola feed  '); });
    await act(async () => { await result.current.handlePublishPost(); });

    // El texto va recortado; el máximo es el del rango, no un valor fijo.
    expect(publishPost).toHaveBeenCalledWith({ text: 'Hola feed', maxLength: PROFILE_TIER_POST_MAX_LENGTH.silver });
    expect(result.current.composePostText).toBe('');
    // El refresco va DESPUÉS de publicar: si no, el post recién escrito no saldría en el feed.
    expect(onPublished).toHaveBeenCalledOnce();
    expect(setFeedback).toHaveBeenCalledWith('ok', SOCIAL_UI.status.postPublished);
  });

  it('bronce no publica, y lo hace EN SILENCIO', async () => {
    const { result, setFeedback } = setup('bronze');

    act(() => { result.current.setComposePostText('Intento publicar'); });
    await act(async () => { await result.current.handlePublishPost(); });

    expect(publishPost).not.toHaveBeenCalled();
    // Sin aviso a propósito: a quien no tiene el rango no se le recuerda lo que no puede hacer.
    expect(setFeedback).not.toHaveBeenCalled();
  });

  it('un texto en blanco no publica', async () => {
    const { result } = setup('gold');

    act(() => { result.current.setComposePostText('   \n  '); });
    await act(async () => { await result.current.handlePublishPost(); });

    expect(publishPost).not.toHaveBeenCalled();
  });

  it('si la publicación falla, avisa y deja el texto para reintentar', async () => {
    publishPost.mockRejectedValueOnce(new Error('gist 403'));
    const { result, onPublished, setFeedback } = setup('gold');

    act(() => { result.current.setComposePostText('Se va a caer'); });
    await act(async () => { await result.current.handlePublishPost(); });

    expect(setFeedback).toHaveBeenCalledWith('err', 'gist 403');
    // Perder lo escrito por un 403 sería lo peor que podría pasar aquí.
    expect(result.current.composePostText).toBe('Se va a caer');
    expect(onPublished).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.publishingPost).toBe(false));
  });

  it('no publica dos veces si ya hay un envío en curso', async () => {
    let release: () => void = () => {};
    publishPost.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const { result } = setup('silver');

    act(() => { result.current.setComposePostText('Doble clic'); });

    let first: Promise<void>;
    act(() => { first = result.current.handlePublishPost(); });
    await waitFor(() => expect(result.current.publishingPost).toBe(true));

    await act(async () => { await result.current.handlePublishPost(); });
    expect(publishPost).toHaveBeenCalledOnce();

    await act(async () => { release(); await first; });
  });

  it('expone los límites del rango que la pantalla necesita', () => {
    expect(setup('bronze').result.current.canPublishPosts).toBe(false);
    expect(setup('silver').result.current.showPostCounter).toBe(true);
    // Mithril no tiene límite práctico que enseñar, así que no lleva contador.
    expect(setup('mithril').result.current.showPostCounter).toBe(false);
    expect(setup('gold').result.current.postMaxLength).toBe(PROFILE_TIER_POST_MAX_LENGTH.gold);
  });
});
