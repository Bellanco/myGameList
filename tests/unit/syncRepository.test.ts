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
 * the CURRENT behavior of bugs whose fix lives OUTSIDE mergeCrdt (marked CHAR), so a later fix surfaces here.
 * The bugs that were fixable inside mergeCrdt (H1, H2) are fixed: their tests now assert the correct behavior
 * directly, so no `it.fails` markers are left in this file.
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

  // ---- H2 (fixed): an edit-vs-delete tie keeps the tombstone ----

  it('H2 (was BUG): an edit-vs-delete tie preserves the tombstone and drops the live copy', () => {
    // Delete (_ts=100) races an edit (_ts=100). The comparison used to be strict, so the tombstone was dropped and
    // the edit survived; the deleting device then had nothing to merge against and the game came back to life.
    const local = empty();
    local.c.push(mkGame({ id: 1, _ts: 100, name: 'Edited' }));
    const remote = empty();
    remote.deleted.push({ id: 1, _ts: 100 });

    const result = mergeCrdt(local, 100, remote, 100);
    expect(result.merged.deleted.some((d) => d.id === 1)).toBe(true);
    // And the game must NOT stay in the lists: a tombstone next to a live copy is not a state, it's a bug.
    expect(result.merged.c).toHaveLength(0);
    // The side that still holds the live copy has to rewrite, or it keeps showing a deleted game.
    expect(result.localNeedsUpdate).toBe(true);
  });

  it('H2: the tie resolves the SAME way whichever side is local (no ping-pong between devices)', () => {
    // The loop the bug caused: device A resurrects what B deleted, B deletes again, A resurrects... Both views of
    // the same pair must agree, and that is what closes it.
    const withEdit = () => {
      const d = empty();
      d.c.push(mkGame({ id: 1, _ts: 100, name: 'Edited' }));
      return d;
    };
    const withDelete = () => {
      const d = empty();
      d.deleted.push({ id: 1, _ts: 100 });
      return d;
    };

    const fromEditor = mergeCrdt(withEdit(), 100, withDelete(), 100);
    const fromDeleter = mergeCrdt(withDelete(), 100, withEdit(), 100);

    expect(fromEditor.merged.c).toHaveLength(0);
    expect(fromDeleter.merged.c).toHaveLength(0);
    expect(fromEditor.merged.deleted).toEqual(fromDeleter.merged.deleted);
  });

  it('H2: merging the result again is stable — the tombstone is not lost on the second pass', () => {
    // The real damage was here: with the tombstone gone, a later independent delete had nothing to merge against.
    //
    // Timestamps must be RECENT: once there is no live copy left, E1 purges tombstones older than the retention
    // window, so a 1970-era `_ts` (like the other tests use) would be dropped for a different, legitimate reason
    // and this test would pass or fail for the wrong one.
    const ahora = Date.now();
    const local = empty();
    local.c.push(mkGame({ id: 1, _ts: ahora, name: 'Edited' }));
    const remote = empty();
    remote.deleted.push({ id: 1, _ts: ahora });

    const first = mergeCrdt(local, ahora, remote, ahora);
    const second = mergeCrdt(first.merged, first.merged.updatedAt, remote, ahora);

    expect(second.merged.deleted.some((d) => d.id === 1)).toBe(true);
    expect(second.merged.c).toHaveLength(0);
    // Nothing left to reconcile once both sides carry the same tombstone and no live copy.
    expect(second.localNeedsUpdate).toBe(false);
  });

  it('H2: a strictly newer edit still wins over an older delete (the tie rule is only for ties)', () => {
    // Guard against over-correcting: `>=` must not swallow legitimate resurrections.
    const local = empty();
    local.c.push(mkGame({ id: 1, _ts: 101, name: 'Edited after the delete' }));
    const remote = empty();
    remote.deleted.push({ id: 1, _ts: 100 });

    const result = mergeCrdt(local, 101, remote, 100);
    expect(result.merged.c).toHaveLength(1);
    expect(result.merged.deleted).toHaveLength(0);
  });
});
