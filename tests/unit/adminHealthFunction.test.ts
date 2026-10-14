// `/api/admin/health` y su lector de Cloudflare (docs/plan-admin-rediseno.md, F5). Sin red: se le da a cada lector un
// `fetch` de mentira, y lo que se comprueba es lo que DECIDE —cómo se agrupan las operaciones, qué pasa sin
// credenciales o con la API caída—.
import { describe, expect, it } from 'vitest';
import { parseCloudflareUsage, readCloudflareUsage } from '../../functions/_lib/cloudflareAnalytics';

describe('API de analíticas de Cloudflare', () => {
  it('agrupa las operaciones de KV por tipo y suma las peticiones a Functions', () => {
    const parsed = parseCloudflareUsage({
      data: {
        viewer: {
          accounts: [{
            kv: [
              { sum: { requests: 900 }, dimensions: { actionType: 'read' } },
              { sum: { requests: 40 }, dimensions: { actionType: 'write' } },
              { sum: { requests: 2 }, dimensions: { actionType: 'write' } },
              { sum: { requests: 7 }, dimensions: { actionType: 'list' } },
            ],
            fn: [{ sum: { requests: 1500 } }, { sum: { requests: 20 } }],
          }],
        },
      },
    });
    expect(parsed).toEqual({ kv: { read: 900, write: 42, delete: 0, list: 7 }, functions: 1520 });
  });

  it('un error de GraphQL se dice con su mensaje', () => {
    expect(() => parseCloudflareUsage({ errors: [{ message: 'not authorized' }] })).toThrow('not authorized');
  });

  it('sin token no llama a nadie, y el día que cuenta es el UTC', async () => {
    const usage = await readCloudflareUsage({ CF_ACCOUNT_ID: 'acc' }, Date.UTC(2026, 9, 14, 23, 30), async () => {
      throw new Error('no debería llamar a nadie');
    });
    expect(usage.configured).toBe(false);
    expect(new Date(usage.resetsAt).toISOString()).toBe('2026-10-15T00:00:00.000Z');
  });

  it('con la API caída lo dice como error', async () => {
    const usage = await readCloudflareUsage({ CF_ACCOUNT_ID: 'acc', CF_ANALYTICS_TOKEN: 't' }, Date.UTC(2026, 9, 14), async () => new Response('', { status: 503 }));
    expect(usage.configured).toBe(true);
    expect(usage.error).toContain('503');
    expect(usage.kv.write).toBeNull();
  });
});
