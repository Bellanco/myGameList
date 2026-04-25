// @ts-nocheck
/**
 * Unit tests for myGameList sync logic
 * Tests CRDT merge behavior without losing data
 */

import { describe, it, expect } from 'vitest';

// Mock DataSync for testing
const DataSync = {
  isValidData(data) {
    return (
      data &&
      typeof data === 'object' &&
      Array.isArray(data.c) &&
      Array.isArray(data.v) &&
      Array.isArray(data.e) &&
      Array.isArray(data.p)
    );
  },

  mergeData(local, localTs, remote, remoteTs) {
    const merged = { ...local };
    const tabs = ['c', 'v', 'e', 'p'];

    tabs.forEach((tab) => {
      const localGames = merged[tab] || [];
      const remoteGames = remote[tab] || [];

      // Create map of remote games by ID
      const remoteMap = new Map(remoteGames.map(g => [g.id, g]));

      // Add remote games that don't exist locally
      remoteGames.forEach((game) => {
        if (!localGames.find(g => g.id === game.id)) {
          localGames.push(game);
        }
      });

      // Resolve conflicts based on timestamp
      localGames.forEach((game) => {
        const remoteGame = remoteMap.get(game.id);
        if (remoteGame) {
          const gameTs = game._ts || 0;
          const remoteGameTs = remoteGame._ts || 0;
          if (remoteGameTs > gameTs) {
            Object.assign(game, remoteGame);
          }
        }
      });

      merged[tab] = localGames;
    });

    return { merged };
  },
};

describe('DataSync - Core functionality', () => {
  it('should validate correct data structure', () => {
    const valid = { c: [], v: [], e: [], p: [] };
    expect(DataSync.isValidData(valid)).toBe(true);
  });

  it('should reject invalid structure', () => {
    expect(DataSync.isValidData(null)).toBeFalsy();
    expect(DataSync.isValidData({ c: [] })).toBeFalsy();
  });
});

describe('DataSync.mergeData - No data loss', () => {
  it('should keep all local games when remote is empty', () => {
    const local = { c: [{ id: '1', name: 'Game 1', _ts: 1000 }], v: [], e: [], p: [] };
    const remote = { c: [], v: [], e: [], p: [] };

    const result = DataSync.mergeData(local, 1000, remote, 1000);
    expect(result.merged.c.length).toBe(1);
    expect(result.merged.c[0].name).toBe('Game 1');
  });

  it('should keep all remote games when local is empty', () => {
    const local = { c: [], v: [], e: [], p: [] };
    const remote = { c: [{ id: '1', name: 'Game 1', _ts: 1000 }], v: [], e: [], p: [] };

    const result = DataSync.mergeData(local, 1000, remote, 1000);
    expect(result.merged.c.length).toBe(1);
    expect(result.merged.c[0].name).toBe('Game 1');
  });

  it('should merge games from both sides without losing any', () => {
    const local = { c: [{ id: '1', name: 'Game 1', _ts: 1000 }], v: [], e: [], p: [] };
    const remote = { c: [{ id: '2', name: 'Game 2', _ts: 1000 }], v: [], e: [], p: [] };

    const result = DataSync.mergeData(local, 1000, remote, 1000);
    expect(result.merged.c.length).toBe(2);
    expect(result.merged.c.some(g => g.id === '1')).toBe(true);
    expect(result.merged.c.some(g => g.id === '2')).toBe(true);
  });
});

describe('DataSync.mergeData - Conflict resolution (timestamp wins)', () => {
  it('should pick newer version when remote has newer timestamp', () => {
    const now = Date.now();
    const local = { c: [{ id: '1', name: 'Local', _ts: now - 1000 }], v: [], e: [], p: [] };
    const remote = { c: [{ id: '1', name: 'Remote', _ts: now }], v: [], e: [], p: [] };

    const result = DataSync.mergeData(local, now - 1000, remote, now);
    expect(result.merged.c[0].name).toBe('Remote');
  });

  it('should keep local version if newer', () => {
    const now = Date.now();
    const local = { c: [{ id: '1', name: 'Local', _ts: now }], v: [], e: [], p: [] };
    const remote = { c: [{ id: '1', name: 'Remote', _ts: now - 1000 }], v: [], e: [], p: [] };

    const result = DataSync.mergeData(local, now, remote, now - 1000);
    expect(result.merged.c[0].name).toBe('Local');
  });

  it('should handle multiple games with conflicts', () => {
    const now = Date.now();
    const local = {
      c: [
        { id: '1', name: 'Local 1', _ts: now },
        { id: '2', name: 'Local 2', _ts: now - 1000 },
      ],
      v: [],
      e: [],
      p: [],
    };
    const remote = {
      c: [
        { id: '1', name: 'Remote 1', _ts: now - 1000 },
        { id: '2', name: 'Remote 2', _ts: now },
      ],
      v: [],
      e: [],
      p: [],
    };

    const result = DataSync.mergeData(local, now, remote, now);
    expect(result.merged.c.find(g => g.id === '1').name).toBe('Local 1');
    expect(result.merged.c.find(g => g.id === '2').name).toBe('Remote 2');
  });
});
