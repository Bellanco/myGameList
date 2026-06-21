import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acquireSyncLock, canRead, canReadNow, canWrite, getNextReadDelayMs, isSyncInFlight, resetSyncState, transitionTo } from '../../src/model/repository/syncMachineRepository';

describe('syncMachineRepository', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetSyncState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows forced reads even when throttle is active', () => {
    const now = Date.now();
    vi.setSystemTime(now);

    expect(canRead()).toBe(true);
    expect(canReadNow(true)).toBe(true);

    transitionTo('idle', { lastReadAt: now });
    expect(canRead()).toBe(false);
    expect(canReadNow(true)).toBe(true);
  });

  it('blocks reads during busy sync states even when forced', () => {
    transitionTo('writing');
    expect(canRead()).toBe(false);
    expect(canReadNow(true)).toBe(false);
  });

  it('calculates next read delay correctly', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    transitionTo('idle', { lastReadAt: now });

    expect(getNextReadDelayMs()).toBeGreaterThan(0);

    vi.setSystemTime(now + 60_000);
    expect(getNextReadDelayMs()).toBe(0);
  });

  // Phase 0 — documents the H3 hazard: an error path that leaves the machine in a busy
  // state without recovering blocks ALL future syncs until reload. The real fix is to make
  // error handlers (e.g. recoverGistIdFromGoogle in useSyncViewModel) always transitionTo
  // 'error_backoff'/'idle' on failure.
  it('a busy state left without recovery bricks both reads and writes until a transition resets it', () => {
    transitionTo('writing'); // simulate a sync that threw mid-write and never recovered
    expect(canRead()).toBe(false);
    expect(canReadNow(true)).toBe(false);
    expect(canWrite()).toBe(false); // sync is fully blocked

    transitionTo('idle'); // an explicit recovery is the only way out
    expect(canWrite()).toBe(true);
  });
});

describe('syncMachineRepository — S2 in-flight lock', () => {
  beforeEach(() => {
    resetSyncState();
  });

  it('the second concurrent acquire is refused while the first holds the lock', () => {
    expect(isSyncInFlight()).toBe(false);
    const lock = acquireSyncLock();
    expect(lock).not.toBeNull();
    expect(isSyncInFlight()).toBe(true);

    // A second high-level cycle starting before the first finishes must be coalesced (skipped).
    expect(acquireSyncLock()).toBeNull();

    lock!.release();
    expect(isSyncInFlight()).toBe(false);
    // Once released, a new cycle can run.
    expect(acquireSyncLock()).not.toBeNull();
  });

  it('release is idempotent (double release does not free a later lock)', () => {
    const first = acquireSyncLock();
    first!.release();
    const second = acquireSyncLock(); // takes the lock again
    first!.release(); // stale release must be a no-op
    expect(isSyncInFlight()).toBe(true); // second still holds it
    expect(acquireSyncLock()).toBeNull();
    second!.release();
  });

  it('resetSyncState frees a stuck lock', () => {
    acquireSyncLock();
    expect(isSyncInFlight()).toBe(true);
    resetSyncState();
    expect(isSyncInFlight()).toBe(false);
  });
});
