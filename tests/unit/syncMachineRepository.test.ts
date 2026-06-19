import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canRead, canReadNow, canWrite, getNextReadDelayMs, resetSyncState, transitionTo } from '../../src/model/repository/syncMachineRepository';

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
