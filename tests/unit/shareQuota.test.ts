import { describe, it, expect } from 'vitest';
import {
  PROFILE_TIERS,
  PROFILE_TIER_SHARE_MAX_ACTIVE,
  PROFILE_TIER_SHARE_TTL_DAYS,
  SHARE_MAX_ACTIVE_CEILING,
  SHARE_TTL_DAYS_CEILING,
  resolveShareQuota,
  shareDailyLimit,
  shareExpiresAt,
} from '../../src/core/constants/tiers';
// El tope del ajuste individual vive en el lado del servidor: es una regla sobre quién puede GUARDAR qué, no
// sobre cómo se resuelve lo ya guardado, y se prueba junto al resto de la cuota porque es la misma decisión.
import { overrideExceedsTier } from '../../functions/_lib/quota';

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

describe('cuota de compartir — techo diario', () => {
  // La regla en una frase: al día puedes crear tantos como puedes tener a la vez. Si alguien la sustituye por una
  // tabla de cifras sueltas, esto se pone rojo y hay que justificarlo.
  it('matches the number of active links of the tier', () => {
    for (const tier of PROFILE_TIERS) {
      expect(shareDailyLimit(resolveShareQuota(tier))).toBe(PROFILE_TIER_SHARE_MAX_ACTIVE[tier]);
    }
  });

  // Lo que de verdad protege: quien tiene la cuota recortada no puede saltarse el recorte creando y retirando
  // todo el día, porque su ritmo baja con ella.
  it('follows an individual quota adjustment, up and down', () => {
    expect(shareDailyLimit(resolveShareQuota('gold', { maxActive: 3 }))).toBe(3);
    expect(shareDailyLimit(resolveShareQuota('bronze', { maxActive: 12 }))).toBe(12);
  });

  it('never exceeds the ceiling', () => {
    expect(shareDailyLimit(resolveShareQuota('bronze', { maxActive: 10_000 }))).toBe(SHARE_MAX_ACTIVE_CEILING);
  });
});

// EL AJUSTE INDIVIDUAL SOLO RECORTA. `resolveShareQuota` acepta cualquier cifra hasta el techo absoluto (es su
// trabajo: resolver lo que hay guardado), así que el filtro de quién puede GUARDAR qué vive aparte, en el
// endpoint del panel. Sin él, el ajuste era una segunda vía para conceder privilegios sin tocar el rango.
describe('cuota de compartir — tope del ajuste individual', () => {
  it('deja pasar el ajuste que cabe en la categoría', () => {
    expect(overrideExceedsTier('bronze', { maxActive: 3, ttlDays: 5 })).toBeNull();
    // Exactamente el máximo también cabe: el tope es inclusivo.
    expect(overrideExceedsTier('bronze', {
      maxActive: PROFILE_TIER_SHARE_MAX_ACTIVE.bronze,
      ttlDays: PROFILE_TIER_SHARE_TTL_DAYS.bronze,
    })).toBeNull();
  });

  it('rechaza pasarse, y dice en qué campo y cuál es el tope', () => {
    expect(overrideExceedsTier('bronze', { maxActive: 6 })).toEqual({
      field: 'maxActive', ceiling: PROFILE_TIER_SHARE_MAX_ACTIVE.bronze,
    });
    expect(overrideExceedsTier('bronze', { ttlDays: 30 })).toEqual({
      field: 'ttlDays', ceiling: PROFILE_TIER_SHARE_TTL_DAYS.bronze,
    });
  });

  // Lo que un bronce con el ajuste conseguía antes de existir esto: la cuota de mithril entera.
  it('un bronce no puede llevarse la cuota de mithril por la puerta de atrás', () => {
    expect(overrideExceedsTier('bronze', {
      maxActive: PROFILE_TIER_SHARE_MAX_ACTIVE.mithril,
      ttlDays: PROFILE_TIER_SHARE_TTL_DAYS.mithril,
    })).not.toBeNull();
    // Y a mithril, esas mismas cifras sí le corresponden.
    expect(overrideExceedsTier('mithril', {
      maxActive: PROFILE_TIER_SHARE_MAX_ACTIVE.mithril,
      ttlDays: PROFILE_TIER_SHARE_TTL_DAYS.mithril,
    })).toBeNull();
  });

  it('un campo ausente no se mira: el ajuste es parcial por diseño', () => {
    expect(overrideExceedsTier('bronze', {})).toBeNull();
    expect(overrideExceedsTier('bronze', { ttlDays: 3 })).toBeNull();
  });

  it('vale para todos los rangos, sin una tabla de cifras propia', () => {
    for (const tier of PROFILE_TIERS) {
      expect(overrideExceedsTier(tier, { maxActive: PROFILE_TIER_SHARE_MAX_ACTIVE[tier] })).toBeNull();
      expect(overrideExceedsTier(tier, { maxActive: PROFILE_TIER_SHARE_MAX_ACTIVE[tier] + 1 })).not.toBeNull();
    }
  });
});
