import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NetworkDeferredError,
  getRetryAfterMs,
  githubFetch,
  isDeferredNetworkError,
  parseRetryAfterMs,
} from '../../src/model/repository/githubHttp';

function responseWith(status: number, headers: Record<string, string>): Response {
  return new Response(null, { status, headers });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('parseRetryAfterMs', () => {
  it('returns 0 for non rate-limit statuses', () => {
    expect(parseRetryAfterMs(responseWith(200, {}), 0)).toBe(0);
    expect(parseRetryAfterMs(responseWith(500, { 'retry-after': '30' }), 0)).toBe(0);
  });

  it('reads Retry-After in seconds (429)', () => {
    expect(parseRetryAfterMs(responseWith(429, { 'retry-after': '30' }), 0)).toBe(30_000);
  });

  it('reads Retry-After as an HTTP date (403)', () => {
    const now = 1_000_000;
    const future = new Date(now + 45_000).toUTCString();
    const ms = parseRetryAfterMs(responseWith(403, { 'retry-after': future }), now);
    // La fecha pierde precisión a segundos → tolerancia de 1s.
    expect(ms).toBeGreaterThanOrEqual(44_000);
    expect(ms).toBeLessThanOrEqual(45_000);
  });

  it('falls back to X-RateLimit-Reset when remaining is 0', () => {
    const now = 2_000_000;
    const resetEpochSec = Math.floor((now + 60_000) / 1000);
    const ms = parseRetryAfterMs(
      responseWith(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(resetEpochSec) }),
      now,
    );
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(60_000);
  });

  it('returns 0 when remaining is not exhausted', () => {
    expect(parseRetryAfterMs(responseWith(403, { 'x-ratelimit-remaining': '5', 'x-ratelimit-reset': '9999999999' }), 0)).toBe(0);
  });
});

describe('isDeferredNetworkError / getRetryAfterMs', () => {
  it('recognises NetworkDeferredError', () => {
    expect(isDeferredNetworkError(new NetworkDeferredError('offline'))).toBe(true);
    expect(isDeferredNetworkError(new Error('Read failed: 500'))).toBe(false);
    expect(isDeferredNetworkError(null)).toBe(false);
  });

  it('reads retryAfterMs attached to an error, 0 otherwise', () => {
    const err = Object.assign(new Error('Write failed: 429'), { retryAfterMs: 5000 });
    expect(getRetryAfterMs(err)).toBe(5000);
    expect(getRetryAfterMs(new Error('plain'))).toBe(0);
    expect(getRetryAfterMs(undefined)).toBe(0);
  });
});

describe('githubFetch', () => {
  it('throws a deferred error when offline (navigator.onLine === false)', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(githubFetch('https://api.github.com/x')).rejects.toBeInstanceOf(NetworkDeferredError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps an AbortError (timeout) to a deferred error', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));

    const error = await githubFetch('https://api.github.com/x').catch((e) => e);
    expect(isDeferredNetworkError(error)).toBe(true);
    expect((error as NetworkDeferredError).reason).toBe('timeout');
  });

  it('maps a TypeError (transport failure) to a deferred error', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const error = await githubFetch('https://api.github.com/x').catch((e) => e);
    expect(isDeferredNetworkError(error)).toBe(true);
    expect((error as NetworkDeferredError).reason).toBe('network');
  });

  it('passes through the Response on success and forwards a signal', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const fetchSpy = vi.fn().mockResolvedValue(responseWith(304, {}));
    vi.stubGlobal('fetch', fetchSpy);

    const res = await githubFetch('https://api.github.com/x', { method: 'GET' });
    expect(res.status).toBe(304);
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.method).toBe('GET');
  });
});
