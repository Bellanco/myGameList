import { describe, expect, it } from 'vitest';
import {
  BASE_WEIGHT,
  buildListsPool,
  buildProfilePool,
  buildListsWeigher,
  curveGrade,
  curveScore,
  gameWeight,
  listsWeight,
  NEUTRAL_GRADE,
  normalizeName,
  parseSeries,
  SEQUEL_DECAY,
  pickWeighted,
  profileWeight,
  type RouletteCandidate,
} from '../../src/core/roulette/roulette';
import type { TabId } from '../../src/model/types/game';
import type { GameItem, TabData } from '../../src/model/types/game';

function game(partial: Partial<GameItem> & { id: number; name: string }): GameItem {
  return {
    platforms: [],
    genres: [],
    steamDeck: false,
    review: '',
    _ts: 0,
    ...partial,
  };
}

function tabData(partial: Partial<TabData>): TabData {
  return { c: [], v: [], e: [], p: [], deleted: [], updatedAt: 0, ...partial };
}

describe('roulette weighting', () => {
  it('scored games weigh their score; unscored fall back to the base weight', () => {
    expect(gameWeight(game({ id: 1, name: 'A', score: 4 }))).toBe(4);
    expect(gameWeight(game({ id: 2, name: 'B', score: 0 }))).toBe(BASE_WEIGHT);
    expect(gameWeight(game({ id: 3, name: 'C' }))).toBe(BASE_WEIGHT);
  });

  it('pickWeighted (default linear) favours higher scores using the injected rng', () => {
    const candidates: RouletteCandidate[] = [
      { game: game({ id: 1, name: 'low', score: 1 }), sourceTab: 'p' },
      { game: game({ id: 2, name: 'high', score: 4 }), sourceTab: 'p' },
    ];
    // default weigher = linear gameWeight. total = 5. r in [0,1) -> low; r in [1,5) -> high.
    expect(pickWeighted(candidates, undefined, () => 0)?.game.name).toBe('low');
    expect(pickWeighted(candidates, undefined, () => 0.5)?.game.name).toBe('high');
    expect(pickWeighted(candidates, undefined, () => 0.99)?.game.name).toBe('high');
  });

  it('pickWeighted honours a custom weigher', () => {
    const candidates: RouletteCandidate[] = [
      { game: game({ id: 1, name: 'a', score: 5 }), sourceTab: 'c' },
      { game: game({ id: 2, name: 'b', score: 1 }), sourceTab: 'p' },
    ];
    // weigh only by list factor (ignore score): c=1, p=3 → total 4. r<1 → a, r>=1 → b.
    const byTab = (c: RouletteCandidate) => (c.sourceTab === 'p' ? 3 : 1);
    expect(pickWeighted(candidates, byTab, () => 0)?.game.name).toBe('a');
    expect(pickWeighted(candidates, byTab, () => 0.5)?.game.name).toBe('b');
  });

  it('returns null for an empty pool', () => {
    expect(pickWeighted([])).toBeNull();
  });
});

describe('curve & context weighting', () => {
  const cand = (tab: TabId, score: number, replayable?: boolean): RouletteCandidate => ({
    game: game({ id: 1, name: 'x', score, replayable }),
    sourceTab: tab,
  });

  it('curveScore is quadratic with a base for unscored', () => {
    expect(curveScore(0)).toBe(BASE_WEIGHT);
    expect(curveScore(1)).toBe(1);
    expect(curveScore(3)).toBe(9);
    expect(curveScore(5)).toBe(25);
  });

  it('listsWeight multiplies the curve by the list factor (próximos > vergüenza > completista)', () => {
    expect(listsWeight(cand('p', 2))).toBe(4 * 3.5);
    expect(listsWeight(cand('v', 2))).toBe(4 * 2);
    expect(listsWeight(cand('c', 2))).toBe(4 * 1);
    // an unscored próximo still weighs (base × list factor), so próximos keep showing up
    expect(listsWeight(cand('p', 0))).toBe(BASE_WEIGHT * 3.5);
  });

  it('profileWeight boosts replayable, but below a score step', () => {
    expect(profileWeight(cand('c', 4, true))).toBeCloseTo(16 * 1.5);
    expect(profileWeight(cand('c', 4, false))).toBe(16);
    // a great non-replayable game (5★ → 25) still beats a replayable 4★ (16 × 1.5 = 24)
    expect(profileWeight(cand('c', 5, false))).toBeGreaterThan(profileWeight(cand('c', 4, true)));
  });
});

describe('buildListsPool', () => {
  it('takes completados with replayable, abandonados with retry and all próximos', () => {
    const data = tabData({
      c: [game({ id: 1, name: 'Replay', replayable: true }), game({ id: 2, name: 'NoReplay' })],
      v: [game({ id: 3, name: 'Retry', retry: true }), game({ id: 4, name: 'NoRetry' })],
      p: [game({ id: 5, name: 'Next A' }), game({ id: 6, name: 'Next B' })],
    });
    const pool = buildListsPool(data);
    expect(pool.map((c) => c.game.name).sort()).toEqual(['Next A', 'Next B', 'Replay', 'Retry']);
    expect(pool.find((c) => c.game.name === 'Replay')?.sourceTab).toBe('c');
    expect(pool.find((c) => c.game.name === 'Retry')?.sourceTab).toBe('v');
    expect(pool.find((c) => c.game.name === 'Next A')?.sourceTab).toBe('p');
  });

  it('deduplicates by id', () => {
    const shared = game({ id: 7, name: 'Dup', replayable: true });
    const data = tabData({ c: [shared], p: [shared] });
    expect(buildListsPool(data)).toHaveLength(1);
  });
});

describe('buildProfilePool', () => {
  it('uses only the completados list and maps snippet/rating fallbacks', () => {
    const pool = buildProfilePool({
      c: [{ id: 1, name: 'Done', rating: 5, snippet: 'great' }],
      p: [{ id: 2, name: 'Planned' }],
    });
    expect(pool).toHaveLength(1);
    expect(pool[0].game.name).toBe('Done');
    expect(pool[0].game.score).toBe(5);
    expect(pool[0].game.review).toBe('great');
    expect(pool[0].sourceTab).toBe('c');
  });

  it('preserves the fine grade (0–100) so the ring is not derived from rating×20', () => {
    const pool = buildProfilePool({
      c: [
        { id: 1, name: 'Con nota', rating: 5, grade: 92 },
        { id: 2, name: 'Sin nota', rating: 4 },
      ],
    });
    expect(pool[0].game.grade).toBe(92);
    expect(pool[1].game.grade).toBeNull();
  });

  it('is empty when there are no completados', () => {
    expect(buildProfilePool({ p: [{ id: 1, name: 'x' }] })).toEqual([]);
    expect(buildProfilePool(undefined)).toEqual([]);
  });
});

describe('normalizeName', () => {
  it('trims and lowercases for cross-user duplicate checks', () => {
    expect(normalizeName('  Hollow KNIGHT ')).toBe('hollow knight');
    expect(normalizeName('')).toBe('');
  });
});

describe('scoreless shame list fairness', () => {
  const cand = (tab: TabId, score: number): RouletteCandidate => ({
    game: game({ id: 1, name: 'x', score }),
    sourceTab: tab,
  });

  it('a scoreless shame game uses the neutral grade instead of the tiny base', () => {
    // vergüenza sin nota → curveGrade(NEUTRAL_GRADE) × TAB(v=2) (compite, no se queda en ~2)
    expect(listsWeight(cand('v', 0))).toBeCloseTo(curveGrade(NEUTRAL_GRADE) * 2);
    // un próximo sin "interés" mantiene el peso base (1 × 3.5)
    expect(listsWeight(cand('p', 0))).toBe(1 * 3.5);
    // así la vergüenza no queda por detrás de una lista sin puntuar
    expect(listsWeight(cand('v', 0))).toBeGreaterThan(listsWeight(cand('p', 0)));
  });

  it('a shame game with a real score still uses it (4★ → grade 80 → 16)', () => {
    expect(listsWeight(cand('v', 4))).toBe(16 * 2);
  });
});

describe('fine 0–100 grade weighting', () => {
  it('curveGrade is quadratic on 0–100 (100→25, 80→16, 50→6.25, 0→base)', () => {
    expect(curveGrade(100)).toBe(25);
    expect(curveGrade(80)).toBe(16);
    expect(curveGrade(50)).toBeCloseTo(6.25);
    expect(curveGrade(0)).toBe(1);
  });

  it('weights by the fine grade, not the star bucket (95 > 91 though both are 5★)', () => {
    const hi: RouletteCandidate = { game: game({ id: 1, name: 'Hi', grade: 95 }), sourceTab: 'p' };
    const lo: RouletteCandidate = { game: game({ id: 2, name: 'Lo', grade: 91 }), sourceTab: 'p' };
    expect(listsWeight(hi)).toBeGreaterThan(listsWeight(lo));
  });
});

describe('series-aware ordering', () => {
  const g = (id: number, name: string) => game({ id, name });
  const p = (game_: GameItem): RouletteCandidate => ({ game: game_, sourceTab: 'p' });

  it('parseSeries handles arabic, roman, subtitle, years and no-number', () => {
    expect(parseSeries('Portal')).toEqual({ base: 'portal', ordinal: 1 });
    expect(parseSeries('Portal 2')).toEqual({ base: 'portal', ordinal: 2 });
    expect(parseSeries('Final Fantasy VII')).toEqual({ base: 'final fantasy', ordinal: 7 });
    expect(parseSeries('The Witcher 3: Wild Hunt')).toEqual({ base: 'the witcher', ordinal: 3 });
    expect(parseSeries('Cyberpunk 2077')).toEqual({ base: 'cyberpunk 2077', ordinal: 1 }); // año, no secuela
    expect(parseSeries('Left 4 Dead 2')).toEqual({ base: 'left 4 dead', ordinal: 2 }); // nº en medio no cuenta
  });

  it('puts the earlier entry ahead when both are pending', () => {
    const data = tabData({ p: [g(1, 'Portal'), g(2, 'Portal 2')] });
    const w = buildListsWeigher(data);
    expect(w(p(data.p[0]))).toBeGreaterThan(w(p(data.p[1])));
  });

  it('promotes the next unplayed sequel over later ones (played 1-3 of 5)', () => {
    const data = tabData({
      c: [g(1, 'Saga'), g(2, 'Saga 2'), g(3, 'Saga 3')],
      p: [g(4, 'Saga 4'), g(5, 'Saga 5')],
    });
    const w = buildListsWeigher(data);
    expect(w(p(data.p[0]))).toBeGreaterThan(w(p(data.p[1])));
  });

  it('does not penalize skipped (not owned) earlier entries', () => {
    const data = tabData({ c: [g(1, 'Saga')], p: [g(4, 'Saga 4')] });
    const w = buildListsWeigher(data);
    // Saga 4: solo tienes 1 (jugada) y 4; 2 y 3 no las tienes → sin penalización.
    expect(w(p(data.p[0]))).toBe(listsWeight(p(data.p[0])));
  });

  it('suppresses the whole series while one entry is in progress', () => {
    const data = tabData({ e: [g(2, 'Saga 2')], p: [g(3, 'Saga 3')] });
    const w = buildListsWeigher(data);
    expect(w(p(data.p[0]))).toBeCloseTo(listsWeight(p(data.p[0])) * SEQUEL_DECAY);
  });

  it('only penalizes when the earlier entry is also in próximos, not in the shame list', () => {
    // Anterior en vergüenza → la secuela NO se penaliza (solo cuentan las anteriores en próximos).
    const shame = tabData({ v: [g(1, 'Saga')], p: [g(2, 'Saga 2')] });
    expect(buildListsWeigher(shame)(p(shame.p[0]))).toBe(listsWeight(p(shame.p[0])));
    // Ambas en próximos → sí se penaliza la 2ª.
    const both = tabData({ p: [g(1, 'Saga'), g(2, 'Saga 2')] });
    const w = buildListsWeigher(both);
    expect(w(p(both.p[1]))).toBeCloseTo(listsWeight(p(both.p[1])) * SEQUEL_DECAY);
  });
});
