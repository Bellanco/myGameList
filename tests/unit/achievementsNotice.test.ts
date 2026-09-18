// §7.4 — EL AVISO DEL INSTANTE, y sobre todo LO QUE NO TIENE QUE AVISAR.
//
// Lo que se fija aquí es la quinta condición del hook: una medalla contada no se vuelve a contar. El fallo que
// motivó estos casos se veía así: escalones añadidos desde el panel (§6.4bis) saltaban como desbloqueos recién
// hechos —con su celebración— en CADA sesión, porque «nuevo» se decidía comparando solo contra la foto en
// memoria de la evaluación anterior y el catálogo crece a mitad de sesión, cuando llega la configuración.
//
// Se prueba por el hook y no por sus piezas porque el fallo estaba justo en la junta: el evaluador daba el nivel
// correcto, la marca de agua guardaba lo correcto, y aun así la cápsula salía.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAchievementNotice } from '../../src/view/hooks/useAchievementNotice';
import { applyExtraSteps } from '../../src/core/achievements/catalog';
import { evaluateAchievements, nextPeak } from '../../src/core/achievements/evaluate';
import { ACHIEVEMENTS_PEAK_KEY, ACHIEVEMENTS_TOLD_KEY } from '../../src/core/constants/storageKeys';
import type { TabData } from '../../src/model/types/game';

const NOW = Date.parse('2026-09-09T10:00:00.000Z');

/** Un umbral que no está declarado en el código: «Créditos finales» declara 100 y 150, no 125. */
const EXTRA = { completados: [125] } as const;

/** Biblioteca con N juegos terminados, sellados hoy. */
function biblioteca(cuantos: number): TabData {
  return {
    c: Array.from({ length: cuantos }, (_unused, index) => ({
      id: index + 1,
      name: `Juego ${index + 1}`,
      _ts: NOW,
      enteredAt: { c: NOW },
      platforms: [],
      genres: [],
      steamDeck: false,
      review: '',
    })),
    v: [], e: [], p: [], deleted: [], updatedAt: NOW,
  } as unknown as TabData;
}

const vacia = (): TabData => ({ c: [], v: [], e: [], p: [], deleted: [], updatedAt: 0 } as unknown as TabData);

/** La marca de agua que dejaría una sesión anterior con ESTE catálogo y ESTA biblioteca. */
function sembrarMarcaDeAgua(games: TabData): void {
  const estados = evaluateAchievements(
    {
      games,
      social: { friends: 0, postWeeks: 0, profileCreatedAt: 0 },
      device: { hasSync: false, rouletteUsedAt: 0, themeChanged: false },
      now: NOW,
    },
    '',
  );
  localStorage.setItem(ACHIEVEMENTS_PEAK_KEY, nextPeak(estados, ''));
}

/** El hook trabaja tras un `import()` y varios `await`: hay que dejar correr los microtareas antes de mirar. */
async function asentar(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

// El catálogo es de módulo: cada test lo deja como estaba para no contagiar a los demás.
afterEach(() => applyExtraSteps());
beforeEach(() => localStorage.clear());

describe('el aviso del instante no repite lo que ya ha contado', () => {
  it('un escalón del panel que la marca de agua ya conocía no vuelve a saltar al crecer el catálogo', async () => {
    // SESIÓN ANTERIOR: el usuario pasó por el hub con el catálogo ya ampliado, así que la marca de agua guardó
    // el escalón extra.
    applyExtraSteps(EXTRA);
    sembrarMarcaDeAgua(biblioteca(130));
    expect(localStorage.getItem(ACHIEVEMENTS_PEAK_KEY)).toContain('completados-125');

    // SESIÓN NUEVA: arranca con el catálogo del código, porque la configuración todavía no ha llegado.
    applyExtraSteps();
    const notify = vi.fn();
    const { result, rerender } = renderHook(
      ({ games }) => useAchievementNotice(games, notify),
      { initialProps: { games: biblioteca(130) } },
    );
    await asentar();
    expect(result.current.flash).toBeNull();

    // Se abre el hub (o `/logros`) y llega `appConfig/achievements`: el catálogo crece en caliente.
    applyExtraSteps(EXTRA);
    // Y el usuario guarda cualquier cosa.
    rerender({ games: biblioteca(131) });
    await asentar();

    expect(result.current.flash, 'el escalón ya estaba conseguido y contado hace meses').toBeNull();
    expect(notify).not.toHaveBeenCalled();
  });

  it('la biblioteca que llega de IndexedDB no desbloquea nada ni cruza hitos', async () => {
    sembrarMarcaDeAgua(biblioteca(130));

    const notify = vi.fn();
    const { result, rerender } = renderHook(
      ({ games }) => useAchievementNotice(games, notify),
      { initialProps: { games: vacia() } },
    );
    await asentar();

    // La hidratación asíncrona trae la biblioteca entera de golpe.
    rerender({ games: biblioteca(130) });
    await asentar();

    expect(result.current.flash, 'nadie ha hecho nada: los juegos solo han terminado de cargar').toBeNull();
    expect(notify).not.toHaveBeenCalled();
  });

  it('un escalón del panel que nadie ha contado se anuncia una vez, como ampliación y sin celebración', async () => {
    // La marca de agua se sembró con el catálogo del CÓDIGO: el escalón extra no está en ella.
    sembrarMarcaDeAgua(biblioteca(130));
    expect(localStorage.getItem(ACHIEVEMENTS_PEAK_KEY)).not.toContain('completados-125');

    const notify = vi.fn();
    const { result, rerender } = renderHook(
      ({ games }) => useAchievementNotice(games, notify),
      { initialProps: { games: biblioteca(130) } },
    );
    await asentar();
    expect(result.current.flash).toBeNull();

    applyExtraSteps(EXTRA);
    rerender({ games: biblioteca(131) });
    await asentar();

    expect(result.current.flash?.kind, 'es una ampliación del catálogo, no un desbloqueo').toBe('catalog');
    expect(result.current.flash && 'defs' in result.current.flash && result.current.flash.defs.map((def) => def.id))
      .toEqual(['completados-125']);
    expect(notify).toHaveBeenCalledTimes(1);

    // Y NO SE REPITE en la sesión siguiente, que es la parte que fallaba: se monta de nuevo (foto en blanco) con
    // el catálogo ya ampliado.
    const segunda = renderHook(({ games }) => useAchievementNotice(games, notify), {
      initialProps: { games: biblioteca(131) },
    });
    await asentar();
    expect(segunda.result.current.flash).toBeNull();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('un logro conseguido de verdad sigue saltando en el momento', async () => {
    // 99 juegos terminados: «Créditos finales V» (100) está a uno.
    sembrarMarcaDeAgua(biblioteca(99));

    const notify = vi.fn();
    const { result, rerender } = renderHook(
      ({ games }) => useAchievementNotice(games, notify),
      { initialProps: { games: biblioteca(99) } },
    );
    await asentar();
    expect(result.current.flash).toBeNull();

    rerender({ games: biblioteca(100) });
    await asentar();

    expect(result.current.flash?.kind).toBe('unlock');
    expect(result.current.flash && 'defs' in result.current.flash && result.current.flash.defs.map((def) => def.id))
      .toContain('completados-100');
    expect(notify).toHaveBeenCalledTimes(1);
    // Y queda apuntado, para que no vuelva a contarse nunca.
    expect(localStorage.getItem(ACHIEVEMENTS_TOLD_KEY)).toContain('completados-100');
  });

  it('la primera vez en el aparato siembra y calla', async () => {
    const notify = vi.fn();
    const { result } = renderHook(({ games }) => useAchievementNotice(games, notify), {
      initialProps: { games: biblioteca(130) },
    });
    await asentar();

    expect(result.current.flash, 'la retroactividad no reparte medallas').toBeNull();
    expect(notify).not.toHaveBeenCalled();
    // Pero queda todo apuntado: lo que se calla hoy no puede salir mañana como si fuera nuevo.
    expect(localStorage.getItem(ACHIEVEMENTS_TOLD_KEY)).toContain('completados-100');
  });
});
