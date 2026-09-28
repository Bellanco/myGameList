// F5 — NOVEDADES DE LOGROS EN EL FEED, contra una línea base (plan-logros §5.4 y §8.4).
//
// Fija las reglas que separan «reciente» de «nuevo»: sin ellas, cualquier fecha reciente que llegara a un espejo
// salía como un logro de ese día, y una entrada desaparecía en cuanto su dueño conseguía algo al día siguiente.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { achievementFeedEntries, FEED_DAYS_PER_PERSON } from '../../src/core/achievements/feed';
import { packAchievements } from '../../src/core/achievements/pack';
import { getLocalMeta, seedAchievementsPeerSeen } from '../../src/model/repository/indexedDbRepository';
import type { AchievementState } from '../../src/core/achievements/types';

const NOW = Date.parse('2026-09-28T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const got = (id: string, unlockedAt: number): AchievementState => ({ id, level: 1, value: 0, next: null, unlockedAt });
const idsOf = (entries: ReturnType<typeof achievementFeedEntries>) =>
  entries.flatMap((entry) => entry.items.map((item) => item.def.id)).sort();

describe('el feed de logros contra la línea base', () => {
  it('lo que ya estaba en la línea base no se anuncia, aunque su fecha sea de hoy', () => {
    const mirror = packAchievements([got('completados-10', NOW), got('resenas-5', NOW)]);
    const seen = packAchievements([got('completados-10', 0)]);
    expect(idsOf(achievementFeedEntries([{ id: 'ada', mirror, seen }], NOW))).toEqual(['resenas-5']);
  });

  it('sin línea base (`undefined`) no filtra: esa decisión es del llamante', () => {
    const mirror = packAchievements([got('completados-10', NOW)]);
    expect(idsOf(achievementFeedEntries([{ id: 'ada', mirror }], NOW))).toEqual(['completados-10']);
  });

  it('una línea base VACÍA deja pasar todo lo reciente', () => {
    const mirror = packAchievements([got('completados-10', NOW)]);
    expect(idsOf(achievementFeedEntries([{ id: 'ada', mirror, seen: packAchievements([]) }], NOW))).toEqual(['completados-10']);
  });

  it('una entrada por persona y DÍA, y no solo la del día más reciente', () => {
    // Antes, conseguir algo el miércoles hacía desaparecer del feed la entrada del lunes.
    const mirror = packAchievements([got('completados-10', NOW - 2 * DAY), got('resenas-5', NOW)]);
    const entries = achievementFeedEntries([{ id: 'ada', mirror, seen: packAchievements([]) }], NOW);
    expect(entries).toHaveLength(2);
  });

  it(`como mucho ${FEED_DAYS_PER_PERSON} días por persona, los más recientes`, () => {
    const ids = ['completados-10', 'completados-25', 'resenas-5', 'resenas-10', 'resenas-25', 'volvere-3', 'volvere-10'];
    const mirror = packAchievements(ids.map((id, index) => got(id, NOW - index * DAY)));
    const entries = achievementFeedEntries([{ id: 'ada', mirror, seen: packAchievements([]) }], NOW);
    expect(entries).toHaveLength(FEED_DAYS_PER_PERSON);
    expect(idsOf(entries)).not.toContain('volvere-10');
  });
});

describe('la línea base guardada', () => {
  it('siembra lo que falta y NO reescribe lo que ya había: es la primera foto', async () => {
    await seedAchievementsPeerSeen({ ada: 'primera' });
    const next = await seedAchievementsPeerSeen({ ada: 'segunda', bob: 'bob' });
    expect(next).toEqual({ ada: 'primera', bob: 'bob' });
    expect((await getLocalMeta())?.achievementsPeerSeen).toEqual({ ada: 'primera', bob: 'bob' });
  });

  it('poda a quien ya no es amistad, y solo cuando se le pide', async () => {
    await seedAchievementsPeerSeen({ carla: 'carla' });
    expect(await seedAchievementsPeerSeen({}, new Set(['ada', 'carla']))).toEqual({ ada: 'primera', carla: 'carla' });
  });
});
