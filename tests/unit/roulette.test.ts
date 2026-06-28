import { describe, expect, it } from 'vitest';
import {
  BASE_WEIGHT,
  buildListsPool,
  buildProfilePool,
  curveScore,
  gameWeight,
  listsWeight,
  normalizeName,
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
    expect(listsWeight(cand('p', 2))).toBe(4 * 3);
    expect(listsWeight(cand('v', 2))).toBe(4 * 2);
    expect(listsWeight(cand('c', 2))).toBe(4 * 1);
    // an unscored próximo still weighs (base × list factor), so próximos keep showing up
    expect(listsWeight(cand('p', 0))).toBe(BASE_WEIGHT * 3);
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
