import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILE_TIER,
  POST_HARD_CEILING,
  PROFILE_TIERS,
  PROFILE_TIER_FEED_TTL_MS,
  PROFILE_TIER_LABELS,
  PROFILE_TIER_POST_MAX_LENGTH,
  canPublishPosts,
  hasPostLengthLimit,
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

  describe('cupo de publicación por rango', () => {
    it('bronce no publica; el resto sí', () => {
      expect(canPublishPosts('bronze')).toBe(false);
      expect(PROFILE_TIER_POST_MAX_LENGTH.bronze).toBe(0);
      expect(canPublishPosts('silver')).toBe(true);
      expect(canPublishPosts('gold')).toBe(true);
      expect(canPublishPosts('mithril')).toBe(true);
    });

    it('los cupos acordados: 1.000 plata, 10.000 oro, sin límite mithril', () => {
      expect(PROFILE_TIER_POST_MAX_LENGTH.silver).toBe(1_000);
      expect(PROFILE_TIER_POST_MAX_LENGTH.gold).toBe(10_000);
      // Mithril no tiene límite de producto: se queda en el techo del saneador, que solo existe para que un
      // payload manipulado no meta un texto desmedido en el gist.
      expect(PROFILE_TIER_POST_MAX_LENGTH.mithril).toBe(POST_HARD_CEILING);
    });

    it('solo se enseña contador a quien tiene un límite que mostrar', () => {
      expect(hasPostLengthLimit('bronze')).toBe(false); // no publica: no hay contador que enseñar
      expect(hasPostLengthLimit('silver')).toBe(true);
      expect(hasPostLengthLimit('gold')).toBe(true);
      expect(hasPostLengthLimit('mithril')).toBe(false); // sin límite → sin contador
    });

    it('cada rango publica al menos tanto como el anterior', () => {
      const cupos = PROFILE_TIERS.map((tier) => PROFILE_TIER_POST_MAX_LENGTH[tier]);
      expect(cupos).toEqual([...cupos].sort((a, b) => a - b));
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
