// El contador del consumo de IsThereAnyDeal para Capacidad (`functions/_lib/itadUso.ts`). Lo que sujeta: que solo
// cuenten las llamadas que salen de verdad, que el lote al azar no escriba más de una vez por petición, que las
// peticiones sin cupo se junten en memoria y se apunten como mucho una vez por minuto, y que un KV roto no haga
// fallar nada.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  apuntarUsoItad,
  contarLlamadas,
  ITAD_LOTE_LLAMADAS,
  ITAD_SIN_CUPO_CADA_MS,
  itadLlamadasKey,
  itadSinCupoKey,
  lotesAlAzar,
  reiniciarUsoItadParaTests,
} from '../../functions/_lib/itadUso';
import type { KVNamespace } from '../../functions/_lib/keys';

const AHORA = Date.UTC(2026, 9, 17, 12);

function kvEnMemoria() {
  const datos = new Map<string, string>();
  const escrituras: Array<{ clave: string; valor: string; ttl?: number }> = [];
  const kv = {
    get: async (clave: string) => datos.get(clave) ?? null,
    put: async (clave: string, valor: string, opciones?: { expirationTtl?: number }) => {
      escrituras.push({ clave, valor, ttl: opciones?.expirationTtl });
      datos.set(clave, valor);
    },
  } as unknown as KVNamespace;
  return { kv, datos, escrituras };
}

const siempre = () => 0;
const nunca = () => 0.99;

describe('contador de IsThereAnyDeal', () => {
  beforeEach(() => {
    reiniciarUsoItadParaTests();
  });

  it('cuenta solo las llamadas que el presupuesto deja salir', () => {
    let quedan = 2;
    const presupuesto = contarLlamadas({ tomar: () => quedan-- > 0 });
    expect([presupuesto.tomar(), presupuesto.tomar(), presupuesto.tomar()]).toEqual([true, true, false]);
    expect(presupuesto.llamadas).toBe(2);
  });

  it('cada llamada tira su dado: con todos a favor, un lote por llamada', () => {
    expect(lotesAlAzar(3, siempre)).toBe(3);
    expect(lotesAlAzar(3, nunca)).toBe(0);
    expect(lotesAlAzar(0, siempre)).toBe(0);
  });

  it('apunta los lotes de una petición en una sola escritura, con el día UTC y 48 h de vida', async () => {
    const { kv, datos, escrituras } = kvEnMemoria();
    datos.set(itadLlamadasKey(AHORA), '20');
    await apuntarUsoItad(kv, { llamadas: 3, sinCupo: false }, AHORA, siempre);
    expect(escrituras).toEqual([{ clave: 'itad:llamadas-dia:v1:2026-10-17', valor: String(20 + 3 * ITAD_LOTE_LLAMADAS), ttl: 48 * 3600 }]);
    await apuntarUsoItad(kv, { llamadas: 3, sinCupo: false }, AHORA, nunca);
    expect(escrituras).toHaveLength(1);
  });

  it('las peticiones sin cupo se juntan y se apuntan como mucho una vez por minuto, también desde una con cupo', async () => {
    const { kv, datos, escrituras } = kvEnMemoria();
    await apuntarUsoItad(kv, { llamadas: 1, sinCupo: true }, AHORA, nunca);
    await apuntarUsoItad(kv, { llamadas: 1, sinCupo: true }, AHORA + 1_000, nunca);
    await apuntarUsoItad(kv, { llamadas: 1, sinCupo: true }, AHORA + 2_000, nunca);
    expect(datos.get(itadSinCupoKey(AHORA))).toBe('1');
    // Pasado el minuto, una petición que sí tuvo cupo apunta las dos que quedaron en memoria.
    await apuntarUsoItad(kv, { llamadas: 1, sinCupo: false }, AHORA + ITAD_SIN_CUPO_CADA_MS, nunca);
    expect(datos.get(itadSinCupoKey(AHORA))).toBe('3');
    expect(escrituras).toHaveLength(2);
  });

  it('sin KV o con KV roto no lanza', async () => {
    await expect(apuntarUsoItad(undefined, { llamadas: 5, sinCupo: true }, AHORA, siempre)).resolves.toBeUndefined();
    const roto = { get: async () => { throw new Error('sin cupo de KV'); }, put: async () => {} } as unknown as KVNamespace;
    await expect(apuntarUsoItad(roto, { llamadas: 5, sinCupo: true }, AHORA, siempre)).resolves.toBeUndefined();
  });
});
