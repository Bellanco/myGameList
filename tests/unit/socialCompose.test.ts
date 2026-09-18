import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// El compositor de publicaciones NO tenía ninguna prueba: los tests del hub no llegaban a `handlePublishPost`,
// así que su comportamiento (límite por rango, refresco del feed, avisos) solo estaba descrito en comentarios.
// Al salir del ViewModel a su propio hook se puede ejercitar aislado, que es buena parte de la razón de moverlo.
//
// EL TEXTO YA NO ES ESTADO DE ESTE HOOK: lo guarda `FeedComposer` para que escribir no repinte el feed, y llega
// como argumento al publicar. Así que lo que aquí se comprueba es el CONTRATO que sustituyó a aquel estado: el
// booleano de vuelta, que es lo que decide si el cuadro se vacía. `true` = publicado (vacía), `false` = no salió
// (el texto se queda). Quien comprueba que el cuadro se vacía de verdad es `FeedComposer.test.tsx`.

const publishPost = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../../src/model/repository/socialPublishRepository', () => ({ publishPost }));

const { useSocialCompose } = await import('../../src/viewmodel/social/useSocialCompose');
const { SOCIAL_UI } = await import('../../src/core/constants/socialLabels');
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
  it('publica con el límite del rango, dice que salió y refresca el feed', async () => {
    const { result, onPublished, setFeedback } = setup('silver');

    let salio: boolean | undefined;
    await act(async () => { salio = await result.current.handlePublishPost('  Hola feed  '); });

    // El texto va recortado; el máximo es el del rango, no un valor fijo.
    expect(publishPost).toHaveBeenCalledWith({ text: 'Hola feed', maxLength: PROFILE_TIER_POST_MAX_LENGTH.silver });
    // `true` es la señal con la que el compositor vacía su cuadro.
    expect(salio).toBe(true);
    // El refresco va DESPUÉS de publicar: si no, el post recién escrito no saldría en el feed.
    expect(onPublished).toHaveBeenCalledOnce();
    expect(setFeedback).toHaveBeenCalledWith('ok', SOCIAL_UI.status.postPublished);
  });

  it('bronce no publica, y lo hace EN SILENCIO', async () => {
    const { result, setFeedback } = setup('bronze');

    let salio: boolean | undefined;
    await act(async () => { salio = await result.current.handlePublishPost('Intento publicar'); });

    expect(publishPost).not.toHaveBeenCalled();
    // Y el cuadro NO se vacía: no se ha publicado nada.
    expect(salio).toBe(false);
    // Sin aviso a propósito: a quien no tiene el rango no se le recuerda lo que no puede hacer.
    expect(setFeedback).not.toHaveBeenCalled();
  });

  it('un texto en blanco no publica', async () => {
    const { result } = setup('gold');

    let salio: boolean | undefined;
    await act(async () => { salio = await result.current.handlePublishPost('   \n  '); });

    expect(publishPost).not.toHaveBeenCalled();
    expect(salio).toBe(false);
  });

  it('si la publicación falla, avisa y deja el texto para reintentar', async () => {
    publishPost.mockRejectedValueOnce(new Error('gist 403'));
    const { result, onPublished, setFeedback } = setup('gold');

    let salio: boolean | undefined;
    await act(async () => { salio = await result.current.handlePublishPost('Se va a caer'); });

    expect(setFeedback).toHaveBeenCalledWith('err', 'gist 403');
    // Perder lo escrito por un 403 sería lo peor que podría pasar aquí, y `false` es lo que lo impide.
    expect(salio).toBe(false);
    expect(onPublished).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.publishingPost).toBe(false));
  });

  it('no publica dos veces si ya hay un envío en curso', async () => {
    let release: () => void = () => {};
    publishPost.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const { result } = setup('silver');

    let first: Promise<boolean>;
    act(() => { first = result.current.handlePublishPost('Doble clic'); });
    await waitFor(() => expect(result.current.publishingPost).toBe(true));

    await act(async () => { expect(await result.current.handlePublishPost('Doble clic')).toBe(false); });
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
