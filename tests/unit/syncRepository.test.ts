import { describe, expect, it } from 'vitest';
import { mergeCrdt } from '../../src/model/repository/syncRepository';
import type { TabData } from '../../src/model/types/game';

function empty(): TabData {
  return { c: [], v: [], e: [], p: [], deleted: [], updatedAt: Date.now() };
}

describe('mergeCrdt', () => {
  it('keeps local records when remote is empty', () => {
    const local = empty();
    local.c.push({
      id: 1,
      _ts: 10,
      name: 'Local Game',
      genres: ['RPG'],
      platforms: ['PC'],
      steamDeck: false,
      review: '',
    });

    const result = mergeCrdt(local, 10, empty(), 0);
    expect(result.merged.c).toHaveLength(1);
    expect(result.merged.c[0].name).toBe('Local Game');
  });

  it('picks latest version by timestamp', () => {
    const local = empty();
    const remote = empty();

    local.c.push({
      id: 1,
      _ts: 10,
      name: 'Old Name',
      genres: ['RPG'],
      platforms: ['PC'],
      steamDeck: false,
      review: '',
    });

    remote.c.push({
      id: 1,
      _ts: 20,
      name: 'New Name',
      genres: ['RPG'],
      platforms: ['PC'],
      steamDeck: false,
      review: '',
    });

    const result = mergeCrdt(local, 10, remote, 20);
    expect(result.merged.c[0].name).toBe('New Name');
  });

  it('respects delete tombstones newer than content', () => {
    const local = empty();
    const remote = empty();

    local.c.push({
      id: 1,
      _ts: 10,
      name: 'Game',
      genres: ['Action'],
      platforms: ['PC'],
      steamDeck: false,
      review: '',
    });

    remote.deleted.push({ id: 1, _ts: 25 });

    const result = mergeCrdt(local, 10, remote, 25);
    expect(result.merged.c).toHaveLength(0);
    expect(result.merged.deleted).toHaveLength(1);
    expect(result.merged.deleted[0].id).toBe(1);
  });
});
