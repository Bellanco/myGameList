import { describe, expect, it } from 'vitest';
import { mergeCrdt } from '../../src/model/repository/syncRepository';
import type { GameItem, TabData } from '../../src/model/types/game';

function empty(): TabData {
  return { c: [], v: [], e: [], p: [], deleted: [], updatedAt: Date.now() };
}

function mkGame(over: Partial<GameItem> & { id: number; _ts: number }): GameItem {
  return {
    name: `Game ${over.id}`,
    genres: ['RPG'],
    platforms: ['PC'],
    steamDeck: false,
    review: '',
    ...over,
  };
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

  it('E1: purga tombstones antiguos sin copia viva (dejan de inflar el gist) y marca needsUpdate', () => {
    const local = empty();
    local.deleted.push({ id: 1, _ts: 1 }); // epoch → muy anterior a la ventana de retención
    const result = mergeCrdt(local, 1, empty(), 0);
    expect(result.merged.deleted).toHaveLength(0);
    expect(result.localNeedsUpdate).toBe(true); // el local debe soltar el tombstone viejo
  });

  it('E1: conserva tombstones recientes (dentro de la ventana de retención)', () => {
    const recent = Date.now() - 24 * 60 * 60 * 1000; // hace 1 día
    const local = empty();
    local.deleted.push({ id: 1, _ts: recent });
    const result = mergeCrdt(local, recent, empty(), 0);
    expect(result.merged.deleted.some((d) => d.id === 1)).toBe(true);
  });

  it('E1: no purga ni revive si existe copia viva, aunque el borrado sea antiguo', () => {
    const local = empty();
    local.deleted.push({ id: 1, _ts: 1000 }); // borrado antiguo
    const remote = empty();
    remote.c.push(mkGame({ id: 1, _ts: 500, name: 'Stale' })); // viva pero más vieja que el borrado
    const result = mergeCrdt(local, 1000, remote, 500);
    expect(result.merged.c).toHaveLength(0); // sigue borrada (no resucita)
    expect(result.merged.deleted.some((d) => d.id === 1)).toBe(true); // tombstone conservado
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

/**
 * Phase 0 — characterization & known-bug tests for the CRDT merge.
 *
 * These pin down the risky paths flagged in the remediation audit. Some assert
 * the CURRENT (buggy) behavior so a later fix surfaces here; the genuine bugs that
 * are fixable INSIDE mergeCrdt are written with `it.fails` — they pass today
 * (because the correct assertion fails) and will START failing once Phase 2 fixes
 * them, which is the signal to flip `it.fails` → `it`.
 */
describe('mergeCrdt — Phase 0 risky paths', () => {
  // ---- Correct behavior that already holds (regression guards) ----

  it('a newer edit wins over an older delete (resurrection)', () => {
    const local = empty();
    local.deleted.push({ id: 1, _ts: 10 });
    const remote = empty();
    remote.c.push(mkGame({ id: 1, _ts: 20, name: 'Revived' }));

    const result = mergeCrdt(local, 10, remote, 20);
    expect(result.merged.c).toHaveLength(1);
    expect(result.merged.c[0].name).toBe('Revived');
    expect(result.merged.deleted).toHaveLength(0);
  });

  it('an item present on only one side is kept and the other side is flagged for update', () => {
    const local = empty();
    local.c.push(mkGame({ id: 1, _ts: 10, name: 'Local only' }));

    const result = mergeCrdt(local, 10, empty(), 0);
    expect(result.merged.c).toHaveLength(1);
    expect(result.remoteNeedsUpdate).toBe(true);
    expect(result.localNeedsUpdate).toBe(false);
  });

  // ---- Characterization of bugs whose FIX lives outside mergeCrdt ----

  it('CHAR (C1): two different games sharing an id silently lose one — fix is unique ids at creation, not here', () => {
    // Device A (offline) created id=5 "Halo"; Device B (offline) created id=5 "Zelda".
    // The merge keys by numeric id, so only the newest _ts survives. This documents the
    // data-loss; the real fix is crypto.randomUUID() ids in useGameListViewModel, not mergeCrdt.
    const local = empty();
    local.c.push(mkGame({ id: 5, _ts: 10, name: 'Halo' }));
    const remote = empty();
    remote.c.push(mkGame({ id: 5, _ts: 20, name: 'Zelda' }));

    const result = mergeCrdt(local, 10, remote, 20);
    expect(result.merged.c).toHaveLength(1);
    expect(result.merged.c[0].name).toBe('Zelda'); // 'Halo' is gone forever
  });

  it('CHAR (L2): mergeCrdt passes through items missing genres/platforms unchanged — callers must normalize first', () => {
    // A hand-edited / legacy gist game without genres. mergeCrdt does not normalize, so the
    // field stays undefined and a later `game.genres.forEach` in the view would throw.
    // Fix: normalizeData(migrateData(remote)) before merge (in useSyncViewModel), not here.
    const remote = empty();
    remote.c.push({ id: 1, _ts: 20, name: 'NoGenres', review: '', steamDeck: false } as unknown as GameItem);

    const result = mergeCrdt(empty(), 0, remote, 20);
    expect(result.merged.c).toHaveLength(1);
    expect(result.merged.c[0].genres).toBeUndefined();
  });

  // ---- Genuine bugs fixable INSIDE mergeCrdt (expected to fail today) ----

  it('S1 (was BUG H1): equal _ts with different content flags the stale side for update', () => {
    // Both devices edited id=1 to different content in the same millisecond, same tab.
    // With the deterministic tiebreak the loser side is flagged so it re-writes the winner.
    const local = empty();
    local.c.push(mkGame({ id: 1, _ts: 100, name: 'Name A' }));
    const remote = empty();
    remote.c.push(mkGame({ id: 1, _ts: 100, name: 'Name B' }));

    const result = mergeCrdt(local, 100, remote, 100);
    // At least one side must be flagged so divergence can't persist.
    expect(result.localNeedsUpdate || result.remoteNeedsUpdate).toBe(true);
  });

  it('S1: deterministic tiebreak — both devices converge on the SAME winner regardless of which side is local', () => {
    // Same id, same _ts, same _v (undefined), different content. The winner must be identical
    // when computed from device A's view (A=local) and from device B's view (B=local).
    const a = mkGame({ id: 1, _ts: 100, name: 'Name A' });
    const b = mkGame({ id: 1, _ts: 100, name: 'Name B' });

    const fromA = empty();
    fromA.c.push({ ...a });
    const fromARemote = empty();
    fromARemote.c.push({ ...b });

    const fromB = empty();
    fromB.c.push({ ...b });
    const fromBRemote = empty();
    fromBRemote.c.push({ ...a });

    const resA = mergeCrdt(fromA, 100, fromARemote, 100);
    const resB = mergeCrdt(fromB, 100, fromBRemote, 100);

    expect(resA.merged.c).toHaveLength(1);
    expect(resB.merged.c).toHaveLength(1);
    expect(resA.merged.c[0].name).toBe(resB.merged.c[0].name); // same winner on both devices
  });

  it('S1: _v breaks an equal-_ts tie before content hash (higher version wins)', () => {
    const local = empty();
    local.c.push(mkGame({ id: 1, _ts: 100, _v: 1, name: 'Old' }));
    const remote = empty();
    remote.c.push(mkGame({ id: 1, _ts: 100, _v: 2, name: 'New' }));

    const result = mergeCrdt(local, 100, remote, 100);
    expect(result.merged.c[0].name).toBe('New');
    expect(result.localNeedsUpdate).toBe(true);
  });

  it.fails('BUG (H2): an edit-vs-delete tie must preserve the tombstone', () => {
    // Delete (_ts=100) races an edit (_ts=100). `maxDelTs > maxItemTs` is strict, so the
    // tombstone is dropped and a later independent delete has nothing to merge against.
    const local = empty();
    local.c.push(mkGame({ id: 1, _ts: 100, name: 'Edited' }));
    const remote = empty();
    remote.deleted.push({ id: 1, _ts: 100 });

    const result = mergeCrdt(local, 100, remote, 100);
    expect(result.merged.deleted.some((d) => d.id === 1)).toBe(true); // FAILS today
  });
});
