// Los avisos de «Hoy» sobre cuentas caducadas y a punto de caducar (docs/plan-cuentas-inactivas.md).
import { describe, expect, it } from 'vitest';
import { buildAttention } from '../../src/core/admin/attention';

const AHORA = Date.UTC(2026, 9, 15);

describe('buildAttention · cuentas', () => {
  it('avisa de las caducadas y de las que caducan pronto, y no dice nada sin la lectura de Auth', () => {
    const items = buildAttention({ now: AHORA, accounts: { expired: 2, expiring: 1 } });
    expect(items).toEqual([
      { code: 'accounts-expired', severity: 'warn', count: 2 },
      { code: 'accounts-expiring', severity: 'info', count: 1 },
    ]);
    expect(buildAttention({ now: AHORA, accounts: null })).toEqual([]);
    expect(buildAttention({ now: AHORA, accounts: { expired: 0, expiring: 0 } })).toEqual([]);
  });
});
