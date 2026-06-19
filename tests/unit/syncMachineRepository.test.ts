import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canRead, canReadNow, getNextReadDelayMs, resetSyncState, transitionTo } from '../../src/model/repository/syncMachineRepository';

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
});
