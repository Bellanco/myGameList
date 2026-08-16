import { describe, it, expect } from 'vitest';
import {
  PROFILE_TIERS,
  PROFILE_TIER_SHARE_MAX_ACTIVE,
  PROFILE_TIER_SHARE_TTL_DAYS,
  SHARE_MAX_ACTIVE_CEILING,
  SHARE_TTL_DAYS_CEILING,
  resolveShareQuota,
  shareExpiresAt,
} from '../../src/core/constants/tiers';

describe('cuota de compartir — valores por rango', () => {
  it('gives every tier a positive quota', () => {
    for (const tier of PROFILE_TIERS) {
      expect(PROFILE_TIER_SHARE_TTL_DAYS[tier]).toBeGreaterThan(0);
      expect(PROFILE_TIER_SHARE_MAX_ACTIVE[tier]).toBeGreaterThan(0);
    }
  });

  // Bronce NO puede publicar en el feed pero SÍ compartir sus reseñas. La asimetría es una decisión de producto
  // (publicar ocupa el espacio de los demás; compartir es sacar lo tuyo fuera), así que se fija con una prueba:
  // si alguien "unifica" ambos límites por coherencia aparente, esto se pone rojo.
  it('lets bronze share even though it cannot post', () => {
    expect(PROFILE_TIER_SHARE_MAX_ACTIVE.bronze).toBe(5);
    expect(PROFILE_TIER_SHARE_TTL_DAYS.bronze).toBe(7);
  });

  it('never gives a lower tier more than a higher one', () => {
    const ordered = ['bronze', 'silver', 'gold', 'mithril'] as const;
    for (let i = 1; i < ordered.length; i += 1) {
      expect(PROFILE_TIER_SHARE_MAX_ACTIVE[ordered[i]]).toBeGreaterThan(PROFILE_TIER_SHARE_MAX_ACTIVE[ordered[i - 1]]);
      expect(PROFILE_TIER_SHARE_TTL_DAYS[ordered[i]]).toBeGreaterThan(PROFILE_TIER_SHARE_TTL_DAYS[ordered[i - 1]]);
    }
  });
});

describe('cuota de compartir — resolución con ajuste individual', () => {
  it('falls back to the tier when there is no override', () => {
    expect(resolveShareQuota('silver')).toEqual({ maxActive: 10, ttlDays: 10 });
    expect(resolveShareQuota('gold', null)).toEqual({ maxActive: 15, ttlDays: 14 });
  });

  it('lets the override win over the tier, as an absolute value', () => {
    // 8 es 8, no "5 del rango + 8" ni "8 solo si es mayor": manda el ajuste mientras exista.
    expect(resolveShareQuota('bronze', { maxActive: 8 })).toEqual({ maxActive: 8, ttlDays: 7 });
    expect(resolveShareQuota('mithril', { maxActive: 2, ttlDays: 3 })).toEqual({ maxActive: 2, ttlDays: 3 });
  });

  it('applies each field independently', () => {
    expect(resolveShareQuota('gold', { ttlDays: 30 })).toEqual({ maxActive: 15, ttlDays: 30 });
    expect(resolveShareQuota('gold', { maxActive: 3 })).toEqual({ maxActive: 3, ttlDays: 14 });
  });

  // La cota del saneador: protege de un dedazo en el panel de administración, no del usuario.
  it('clamps an oversized override to the ceiling', () => {
    expect(resolveShareQuota('bronze', { maxActive: 10_000, ttlDays: 3_650 })).toEqual({
      maxActive: SHARE_MAX_ACTIVE_CEILING,
      ttlDays: SHARE_TTL_DAYS_CEILING,
    });
  });

  // Degradar es más seguro que promocionar: un valor corrupto cae al rango, nunca abre la mano.
  it('ignores corrupt override values and falls back to the tier', () => {
    const tier = 'silver';
    const expected = { maxActive: 10, ttlDays: 10 };
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 'muchos', null, undefined, {}]) {
      expect(resolveShareQuota(tier, { maxActive: bad as never, ttlDays: bad as never })).toEqual(expected);
    }
  });

  it('floors fractional overrides instead of accepting them', () => {
    expect(resolveShareQuota('bronze', { maxActive: 7.9, ttlDays: 2.5 })).toEqual({ maxActive: 7, ttlDays: 2 });
  });
});

describe('cuota de compartir — caducidad', () => {
  it('adds exactly the resolved days to the creation instant', () => {
    const now = 1_700_000_000_000;
    expect(shareExpiresAt(resolveShareQuota('bronze'), now)).toBe(now + 7 * 86_400_000);
    expect(shareExpiresAt(resolveShareQuota('mithril'), now)).toBe(now + 90 * 86_400_000);
  });

  it('uses the override duration when there is one', () => {
    const now = 1_700_000_000_000;
    expect(shareExpiresAt(resolveShareQuota('bronze', { ttlDays: 30 }), now)).toBe(now + 30 * 86_400_000);
  });
});
