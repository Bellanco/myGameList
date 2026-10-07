import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PULSE_SLOT_MS, PULSE_SLOTS, useEffectPulses } from '../../src/view/hooks/useEffectPulses';

/**
 * EL RELOJ DE LOS DESTELLOS. Lo que se vigila es lo que haría volver el coste: que el atributo se quede puesto
 * con los efectos apagados o con «reducir movimiento» (los destellos seguirían saliendo), y que el reloj no se
 * pare al desmontar.
 */
const root = document.documentElement;
let reducir = false;
const realMatchMedia = window.matchMedia;

beforeEach(() => {
  vi.useFakeTimers();
  reducir = false;
  window.matchMedia = ((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reducir : false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  root.setAttribute('data-effects', 'on');
});

afterEach(() => {
  vi.useRealTimers();
  window.matchMedia = realMatchMedia;
  root.removeAttribute('data-effects');
  root.removeAttribute('data-pulso');
});

describe('useEffectPulses', () => {
  it('marca el pulso al montar y lo avanza en ciclo, sin empezar por el del título', () => {
    renderHook(() => useEffectPulses());
    const vistos = [root.getAttribute('data-pulso')];
    for (let i = 0; i < PULSE_SLOTS; i += 1) {
      vi.advanceTimersByTime(PULSE_SLOT_MS);
      vistos.push(root.getAttribute('data-pulso'));
    }
    expect(vistos).toEqual(['3', '4', '5', '6', '7', '8', '9', '10', '11', '0', '1', '2', '3']);
  });

  it('no marca nada con los efectos apagados, y se para y se reanuda al cambiarlos', async () => {
    root.setAttribute('data-effects', 'off');
    renderHook(() => useEffectPulses());
    expect(root.hasAttribute('data-pulso')).toBe(false);

    root.setAttribute('data-effects', 'on');
    await vi.waitFor(() => expect(root.getAttribute('data-pulso')).toBe('3'));

    root.setAttribute('data-effects', 'off');
    await vi.waitFor(() => expect(root.hasAttribute('data-pulso')).toBe(false));
    vi.advanceTimersByTime(PULSE_SLOT_MS * 3);
    expect(root.hasAttribute('data-pulso')).toBe(false);
  });

  it('respeta «reducir movimiento»', () => {
    reducir = true;
    renderHook(() => useEffectPulses());
    vi.advanceTimersByTime(PULSE_SLOT_MS * 2);
    expect(root.hasAttribute('data-pulso')).toBe(false);
  });

  it('al desmontar quita el atributo y para el reloj', () => {
    const { unmount } = renderHook(() => useEffectPulses());
    expect(root.hasAttribute('data-pulso')).toBe(true);
    unmount();
    expect(root.hasAttribute('data-pulso')).toBe(false);
    vi.advanceTimersByTime(PULSE_SLOT_MS * 3);
    expect(root.hasAttribute('data-pulso')).toBe(false);
  });
});
