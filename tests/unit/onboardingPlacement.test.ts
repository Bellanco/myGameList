import { describe, expect, it } from 'vitest';
import { GAP, GUTTER, placeBubble } from '../../src/view/components/onboarding/placement';

// Medidas reales de la app (capturas del 29-09-2026): iPhone 390×844 y MacBook 1512×900.
const MOVIL = { w: 390, h: 844, bottomInset: 0 };
const ESCRITORIO = { w: 1512, h: 900, bottomInset: 0 };
const BURBUJA = { w: 358, h: 200 };

describe('dónde va la burbuja', () => {
  it('bajo las pestañas, con la flecha apuntando a su centro', () => {
    const tabs = { x: 0, y: 73, w: 390, h: 58 };
    const placement = placeBubble(tabs, BURBUJA, MOVIL);
    expect(placement.side).toBe('bottom');
    expect(placement.top).toBe(tabs.y + tabs.h + GAP);
    expect(placement.left).toBe(GUTTER);
    expect(placement.left + placement.caret).toBeCloseTo(195, 0);
  });

  it('sobre el «+», que está pegado abajo a la derecha, sin salirse por el borde', () => {
    const fab = { x: 307, y: 689, w: 70, h: 70 };
    const placement = placeBubble(fab, { w: 292, h: 200 }, MOVIL);
    expect(placement.side).toBe('top');
    expect(placement.top + 200).toBe(fab.y - GAP);
    expect(placement.left + 292).toBeLessThanOrEqual(MOVIL.w - GUTTER);
  });

  it('en escritorio, al lado de una tarjeta alta que no deja sitio ni arriba ni abajo', () => {
    const card = { x: 9, y: 60, w: 749, h: 479 };
    const placement = placeBubble(card, { w: 420, h: 440 }, ESCRITORIO);
    expect(placement.side).toBe('right');
    expect(placement.left).toBe(card.x + card.w + GAP);
  });

  it('no se mete bajo el aviso de cookies', () => {
    const tabs = { x: 0, y: 73, w: 390, h: 58 };
    const placement = placeBubble(tabs, { w: 358, h: 500 }, { ...MOVIL, bottomInset: 190 });
    // Debajo de las pestañas quedarían 844 - 190 - 16 - 147 = 491 px: no cabe, y arriba tampoco.
    expect(placement.side).toBeNull();
    expect(placement.top + 500).toBeLessThanOrEqual(MOVIL.h - 190 - GUTTER);
  });

  it('sin control, centrada y sin flecha', () => {
    const placement = placeBubble(null, BURBUJA, MOVIL);
    expect(placement.side).toBeNull();
    expect(placement.left).toBe(GUTTER);
  });
});
