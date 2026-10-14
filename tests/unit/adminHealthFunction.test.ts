// `/api/admin/health` y sus dos lectores (docs/plan-admin-rediseno.md, F5). Sin red: se le da a cada lector un
// `fetch` de mentira, y lo que se comprueba es lo que DECIDE —el día que cuenta, cómo se suman las series, qué
// pasa sin credenciales o con la API caída—.
import { describe, expect, it } from 'vitest';
import { describeGoogleError, pacificMidnight, readFirestoreUsage, sumTimeSeries } from '../../functions/_lib/gcpMonitoring';
import { parseCloudflareUsage, readCloudflareUsage } from '../../functions/_lib/cloudflareAnalytics';

describe('Cloud Monitoring (Firestore)', () => {
  it('el día de la cuota empieza a medianoche del Pacífico, con horario de verano y sin él', () => {
    // 14 oct 2026, 12:00 UTC → en Los Ángeles son las 05:00 (PDT, UTC-7): el día empezó a las 07:00 UTC.
    expect(new Date(pacificMidnight(Date.UTC(2026, 9, 14, 12))).toISOString()).toBe('2026-10-14T07:00:00.000Z');
    // 14 dic 2026, 03:00 UTC → en Los Ángeles aún es el 13 a las 19:00 (PST, UTC-8).
    expect(new Date(pacificMidnight(Date.UTC(2026, 11, 14, 3))).toISOString()).toBe('2026-12-13T08:00:00.000Z');
  });

  // Los dos días de cambio de hora, el desfase de la tarde no es el de la medianoche: la cuenta se movía una hora.
  it('acierta también los días de cambio de hora', () => {
    // 1 nov 2026 (fin del horario de verano a las 2:00): la medianoche aún es PDT.
    expect(new Date(pacificMidnight(Date.UTC(2026, 10, 1, 20))).toISOString()).toBe('2026-11-01T07:00:00.000Z');
    // 8 mar 2026 (empieza a las 2:00): la medianoche aún es PST.
    expect(new Date(pacificMidnight(Date.UTC(2026, 2, 8, 20))).toISOString()).toBe('2026-03-08T08:00:00.000Z');
  });

  it('suma todos los puntos de todas las series, y sin series dice que no sabe', () => {
    expect(sumTimeSeries({ timeSeries: [{ points: [{ value: { int64Value: '1200' } }, { value: { int64Value: '30' } }] }, { points: [{ value: { int64Value: '5' } }] }] })).toBe(1235);
    expect(sumTimeSeries({})).toBeNull();
  });

  it('sin la cuenta de servicio no inventa un cero: dice que no está configurado', async () => {
    const usage = await readFirestoreUsage({ FIREBASE_PROJECT_ID: 'p' }, Date.UTC(2026, 9, 14, 12), async () => {
      throw new Error('no debería llamar a nadie');
    });
    expect(usage.configured).toBe(false);
    expect(usage.values).toEqual({ read: null, write: null, delete: null });
  });

  it('con una cuenta de servicio rota lo dice como error, sin tumbar la respuesta', async () => {
    const usage = await readFirestoreUsage(
      { FIREBASE_PROJECT_ID: 'p', GCP_MONITORING_SA: JSON.stringify({ client_email: 'a@b', private_key: 'no-es-una-clave' }) },
      Date.UTC(2026, 9, 14, 12),
      async () => new Response('{}'),
    );
    expect(usage.configured).toBe(true);
    expect(usage.error).toBeTruthy();
    expect(usage.values.read).toBeNull();
  });

  it('un error de Google dice su motivo, que es lo que separa API apagada de rol que falta', () => {
    expect(
      describeGoogleError({
        error: {
          code: 403,
          status: 'PERMISSION_DENIED',
          message: 'Cloud Monitoring API has not been used in project 123 before or it is disabled.',
          details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED' }],
        },
      }),
    ).toBe('SERVICE_DISABLED: Cloud Monitoring API has not been used in project 123 before or it is disabled.');
    expect(describeGoogleError({ error: { status: 'PERMISSION_DENIED', message: 'Permission denied' } })).toBe(
      'PERMISSION_DENIED: Permission denied',
    );
    expect(describeGoogleError(null)).toBe('');
  });
});

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
