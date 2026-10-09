// Las escrituras del canal social van en fila (ver `serializeSocialWrite`, 09-10-2026).
import { describe, expect, it, vi } from 'vitest';
import { serializeSocialWrite } from '../../src/model/repository/socialWriteQueue';

describe('fila de escrituras del canal social', () => {
  it('la segunda no empieza hasta que termina la primera', async () => {
    const orden: string[] = [];
    let soltar = () => {};
    const primera = serializeSocialWrite(async () => {
      orden.push('1:empieza');
      await new Promise<void>((resolve) => { soltar = resolve; });
      orden.push('1:termina');
    });
    const segunda = serializeSocialWrite(async () => { orden.push('2:empieza'); });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(orden).toEqual(['1:empieza']);
    soltar();
    await Promise.all([primera, segunda]);
    expect(orden).toEqual(['1:empieza', '1:termina', '2:empieza']);
  });

  it('un fallo es de quien lo pidió: la fila sigue con las demás', async () => {
    const fallida = serializeSocialWrite(async () => { throw new Error('red'); });
    const siguiente = serializeSocialWrite(async () => 'ok');

    await expect(fallida).rejects.toThrow('red');
    await expect(siguiente).resolves.toBe('ok');
  });

  it('si una escritura se queda colgada, la siguiente sigue pasado el tope en vez de esperar para siempre', async () => {
    vi.useFakeTimers();
    try {
      void serializeSocialWrite(() => new Promise<void>(() => {}));
      let hecha = false;
      const siguiente = serializeSocialWrite(async () => { hecha = true; });

      await vi.advanceTimersByTimeAsync(44_000);
      expect(hecha).toBe(false);
      await vi.advanceTimersByTimeAsync(2_000);
      await siguiente;
      expect(hecha).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
