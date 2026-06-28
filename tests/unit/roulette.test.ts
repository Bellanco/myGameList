import { describe, expect, it } from 'vitest';
import {
  BASE_WEIGHT,
  buildListsPool,
  buildProfilePool,
  gameWeight,
  normalizeName,
  pickWeighted,
  type RouletteCandidate,
} from '../../src/core/roulette/roulette';
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

  it('pickWeighted favours higher scores using the injected rng', () => {
    const candidates: RouletteCandidate[] = [
      { game: game({ id: 1, name: 'low', score: 1 }), sourceTab: 'p' },
      { game: game({ id: 2, name: 'high', score: 4 }), sourceTab: 'p' },
    ];
    // total weight = 5. r in [0,1) -> low; r in [1,5) -> high.
    expect(pickWeighted(candidates, () => 0)?.game.name).toBe('low');
    expect(pickWeighted(candidates, () => 0.5)?.game.name).toBe('high');
    expect(pickWeighted(candidates, () => 0.99)?.game.name).toBe('high');
  });

  it('returns null for an empty pool', () => {
    expect(pickWeighted([])).toBeNull();
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
