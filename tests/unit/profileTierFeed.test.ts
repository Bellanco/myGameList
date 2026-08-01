import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILE_TIER,
  PROFILE_TIERS,
  PROFILE_TIER_FEED_TTL_MS,
  PROFILE_TIER_LABELS,
  normalizeTier,
} from '../../src/core/constants/tiers';

// El rango decide cada cuánto se rehidrata el feed (directorio + un gist social por amigo, hasta ~50). Manda el
// rango de QUIEN MIRA, porque esas lecturas van con su token y cuentan contra su rate-limit.

describe('rangos de perfil', () => {
  it('bronce es el valor por defecto y conserva la cadencia de siempre (30 min)', () => {
    expect(DEFAULT_PROFILE_TIER).toBe('bronze');
    // Regresión explícita: si esto cambia, TODOS los usuarios pasan a gastar más llamadas sin haberlo pedido.
    expect(PROFILE_TIER_FEED_TTL_MS.bronze).toBe(30 * 60 * 1000);
  });

  it('cada rango refresca más a menudo que el anterior', () => {
    const ttls = PROFILE_TIERS.map((tier) => PROFILE_TIER_FEED_TTL_MS[tier]);
    const descending = [...ttls].sort((a, b) => b - a);
    expect(ttls).toEqual(descending);
    expect(new Set(ttls).size).toBe(PROFILE_TIERS.length); // sin empates: cada rango se nota
  });

  it('las cadencias acordadas: 30 / 15 / 10 min y mithril con suelo de 12 s', () => {
    expect(PROFILE_TIER_FEED_TTL_MS.silver).toBe(15 * 60 * 1000);
    expect(PROFILE_TIER_FEED_TTL_MS.gold).toBe(10 * 60 * 1000);
    // "Siempre fresco al abrir" con suelo de 12 s es exactamente un TTL de 12 s. El suelo evita que navegar
    // feed→detalle→feed dispare ~50 lecturas de gist por cada ida y vuelta.
    expect(PROFILE_TIER_FEED_TTL_MS.mithril).toBe(12_000);
  });

  it('todos los rangos tienen etiqueta y TTL: añadir uno sin cablearlo rompe aquí', () => {
    PROFILE_TIERS.forEach((tier) => {
      expect(PROFILE_TIER_LABELS[tier]).toBeTruthy();
      expect(typeof PROFILE_TIER_FEED_TTL_MS[tier]).toBe('number');
    });
  });

  it('normalizeTier degrada lo desconocido a bronce en vez de promocionar', () => {
    expect(normalizeTier('gold')).toBe('gold');
    expect(normalizeTier('GOLD')).toBe('gold');
    expect(normalizeTier(' mithril ')).toBe('mithril');
    expect(normalizeTier('adamantium')).toBe('bronze');
    expect(normalizeTier(undefined)).toBe('bronze');
    expect(normalizeTier(null)).toBe('bronze');
    expect(normalizeTier(42)).toBe('bronze');
  });
});
