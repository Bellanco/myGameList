import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '../../src/core/utils/concurrency';

describe('mapWithConcurrency', () => {
  it('preserva el orden del resultado aunque las tareas terminen desordenadas', async () => {
    const items = [50, 10, 30, 5, 40, 20];
    const out = await mapWithConcurrency(items, 3, async (n) => {
      await new Promise((r) => setTimeout(r, n));
      return n * 2;
    });
    expect(out).toEqual(items.map((n) => n * 2));
  });

  it('nunca supera el límite de tareas en vuelo', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 30 }, (_, i) => i);
    await mapWithConcurrency(items, 6, async (n) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight -= 1;
      return n;
    });
    expect(maxInFlight).toBeLessThanOrEqual(6);
    expect(maxInFlight).toBeGreaterThan(1); // y sí hay paralelismo real
  });

  it('procesa todos los elementos', async () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const out = await mapWithConcurrency(items, 4, async (n) => n + 100);
    expect(out).toHaveLength(25);
    expect(out[0]).toBe(100);
    expect(out[24]).toBe(124);
  });

  it('listas vacías y límite ≥ tamaño funcionan', async () => {
    expect(await mapWithConcurrency([], 5, async (n) => n)).toEqual([]);
    expect(await mapWithConcurrency([1, 2], 99, async (n) => n * 10)).toEqual([10, 20]);
  });

  it('propaga el rechazo del mapper (la tolerancia es responsabilidad del llamador)', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      }),
    ).rejects.toThrow('boom');
  });
});
