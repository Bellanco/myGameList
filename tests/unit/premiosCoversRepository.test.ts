// LAS CARÁTULAS DE LOS NOMINADOS SE RESUELVEN DESDE EL PANEL (`resolverCaratulasDeNominados`), porque la votación
// solo enseña lo ya resuelto (`c=1`). Aquí se fija que se piden como luego las pide quien vota —misma URL, sin
// plataformas ni modo ampliado—, en el modo que no descarga la imagen, y que un fallo se cuenta y no se lanza.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolverCaratulasDeNominados } from '../../src/model/repository/premios/premiosCoversRepository';
import { coverUrl } from '../../src/core/utils/coverUrl';

vi.mock('../../src/model/repository/coverQuotaRepository', () => ({
  pedirCupoDeCaratulasLibre: vi.fn(async () => true),
}));

let respuestas: Record<string, number | Error>;
let fetchSimulado: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  respuestas = {};
  fetchSimulado = vi.fn(async (url: string) => {
    const nombre = new URLSearchParams(url.split('?')[1]).get('n') ?? '';
    const r = respuestas[nombre] ?? 204;
    if (r instanceof Error) throw r;
    return new Response(null, { status: r });
  });
  vi.stubGlobal('fetch', fetchSimulado);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function resolver(nombres: string[]) {
  const promesa = resolverCaratulasDeNominados(nombres);
  await vi.runAllTimersAsync();
  return promesa;
}

describe('resolverCaratulasDeNominados', () => {
  it('pide cada título en modo «solo resolver», con la misma URL que usará quien vota', async () => {
    await resolver(['Elden Ring']);
    expect(fetchSimulado).toHaveBeenCalledWith(`${coverUrl('Elden Ring')}&m=1`);
  });

  it('no repite títulos ni pide los vacíos', async () => {
    await resolver(['Hades II', ' Hades II ', '', 'Balatro']);
    expect(fetchSimulado).toHaveBeenCalledTimes(2);
  });

  it('cuenta con carátula, sin carátula y las que no se han podido resolver', async () => {
    respuestas = { Jotum: 404, Celeste: 429, Hook: new Error('sin red') };
    const resumen = await resolver(['Elden Ring', 'Jotum', 'Celeste', 'Hook']);
    expect(resumen).toEqual({ conCaratula: 1, sinCaratula: 1, fallidas: 2 });
  });

  it('sin nominados no hace ninguna petición', async () => {
    expect(await resolver([])).toEqual({ conCaratula: 0, sinCaratula: 0, fallidas: 0 });
    expect(fetchSimulado).not.toHaveBeenCalled();
  });
});
