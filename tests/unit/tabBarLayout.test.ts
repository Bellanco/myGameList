import { describe, expect, it } from 'vitest';
import { fitTabBar, TABS_CONTROLS_GAP, type TabBarMeasures } from '../../src/view/components/tabBarLayout';

/** Una franja de `width` px con 20 px de relleno y los controles flotantes (80 px) a 14 px del borde derecho. */
function franja(width: number, pide: Partial<TabBarMeasures>): TabBarMeasures {
  return { left: 20, right: width - 20, controlsLeft: width - 14 - 80, withLabels: 1010, icons: 390, ...pide };
}

describe('fitTabBar · dónde va la pastilla de las listas', () => {
  it('en escritorio ancho sube con los nombres a la fila de la lupa', () => {
    expect(fitTabBar(franja(1440, {}))).toBe('inline');
  });

  it('si los nombres caben en la franja pero no al lado de los controles, bajan a su fila antes que perderlos', () => {
    expect(fitTabBar(franja(1100, {}))).toBe('below');
  });

  it('en tableta se queda con iconos, centrada en la fila de los controles', () => {
    expect(fitTabBar(franja(768, {}))).toBe('icons-inline');
  });

  it('en un móvil va en su fila y a todo el ancho, nunca descentrada a la izquierda de los controles', () => {
    expect(fitTabBar(franja(412, {}))).toBe('tight-below');
    expect(fitTabBar(franja(360, {}))).toBe('tight-below');
  });

  it('el borde exacto cuenta como que cabe, con el aire de los controles descontado a los dos lados', () => {
    const m = franja(768, {});
    const centrado = 2 * ((m.controlsLeft as number) - TABS_CONTROLS_GAP - (m.left + m.right) / 2);
    expect(fitTabBar({ ...m, icons: centrado })).toBe('icons-inline');
    expect(fitTabBar({ ...m, icons: centrado + 1 })).toBe('tight-below');
  });

  it('sin controles flotantes, la pastilla usa la franja entera', () => {
    expect(fitTabBar(franja(1100, { controlsLeft: null }))).toBe('inline');
  });

  it('sin medidas (jsdom o sin pintar) se queda en su fila, que se ve bien en cualquier ancho', () => {
    expect(fitTabBar({ left: 0, right: 0, controlsLeft: null, withLabels: 0, icons: 0 })).toBe('below');
  });
});
