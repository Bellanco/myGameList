// LOGROS EN EL FEED (plan-logros §8.4; docs/plan-feed-sin-vacio.md, Fase 5).
//
// Hasta el 10-10-2026 un logro solo salía si no estaba en la «primera foto» que este dispositivo tomó del espejo de
// esa persona: con una amistad nueva o un móvil nuevo no salía ninguno. Ahora sale todo lo de los últimos 30 días,
// salvo lo fechado antes del 29-09-2026 (`ACHIEVEMENT_DATES_RELIABLE_FROM`): hasta la 1.4.7 la fecha se recalculaba y
// algunos logros viejos se publicaron con fecha de septiembre. Esas fechas salen solas de la ventana el 28-10-2026.
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_DATES_RELIABLE_FROM, achievementFeedEntries, FEED_DAYS_PER_PERSON } from '../../src/core/achievements/feed';
import { packAchievements } from '../../src/core/achievements/pack';
import type { AchievementState } from '../../src/core/achievements/types';

const NOW = new Date(2026, 9, 10, 12).getTime();
const DAY = 24 * 60 * 60 * 1000;
const got = (id: string, unlockedAt: number): AchievementState => ({ id, level: 1, value: 0, next: null, unlockedAt });
const idsOf = (entries: ReturnType<typeof achievementFeedEntries>) =>
  entries.flatMap((entry) => entry.items.map((item) => item.def.id)).sort();

describe('el feed de logros', () => {
  it('sale todo lo de los últimos 30 días, aunque sea la primera vez que este dispositivo ve a esa persona', () => {
    const mirror = packAchievements([got('completados-10', NOW - 3 * DAY), got('resenas-5', NOW)]);
    expect(idsOf(achievementFeedEntries([{ id: 'ada', mirror }], NOW))).toEqual(['completados-10', 'resenas-5']);
  });

  it('lo de hace más de 30 días no sale', () => {
    const mirror = packAchievements([got('completados-10', NOW - 31 * DAY)]);
    expect(achievementFeedEntries([{ id: 'ada', mirror }], NOW)).toEqual([]);
  });

  it('lo fechado antes del 29-09-2026 no sale: puede ser una fecha mala de antes de la 1.4.7', () => {
    expect(ACHIEVEMENT_DATES_RELIABLE_FROM).toBe(new Date(2026, 8, 29).getTime());
    const mirror = packAchievements([
      got('completados-10', ACHIEVEMENT_DATES_RELIABLE_FROM - 1),
      got('resenas-5', ACHIEVEMENT_DATES_RELIABLE_FROM),
    ]);
    expect(idsOf(achievementFeedEntries([{ id: 'ada', mirror }], NOW))).toEqual(['resenas-5']);
  });

  it('una entrada por persona y DÍA, y no solo la del día más reciente', () => {
    // Antes, conseguir algo el miércoles hacía desaparecer del feed la entrada del lunes.
    const mirror = packAchievements([got('completados-10', NOW - 2 * DAY), got('resenas-5', NOW)]);
    expect(achievementFeedEntries([{ id: 'ada', mirror }], NOW)).toHaveLength(2);
  });

  it(`como mucho ${FEED_DAYS_PER_PERSON} días por persona, los más recientes`, () => {
    const ids = ['completados-10', 'completados-25', 'resenas-5', 'resenas-10', 'resenas-25', 'volvere-3', 'volvere-10'];
    const mirror = packAchievements(ids.map((id, index) => got(id, NOW - index * DAY)));
    const entries = achievementFeedEntries([{ id: 'ada', mirror }], NOW);
    expect(entries).toHaveLength(FEED_DAYS_PER_PERSON);
    expect(idsOf(entries)).not.toContain('volvere-10');
  });
});
