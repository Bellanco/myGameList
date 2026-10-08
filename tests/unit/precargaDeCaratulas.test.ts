// La precarga de carátulas del cambio de lista. Lo que se protege es el CONTRATO con el listado: tiene que pedir
// exactamente las URL que `GameTable` va a pintar —si no, precarga otra imagen y la lista sigue entrando pelada— y
// no puede dejar el clic esperando más del plazo.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { caratulasDeArriba, caratulaPrecargada, precargarCaratulas } from '../../src/core/utils/precargaDeCaratulas';
import { coverDeCaja, coverDeRenglon } from '../../src/core/utils/coverDelListado';
import { coverUrl } from '../../src/core/utils/coverUrl';
import { recordarQueNoTiene, reiniciarMemoriaDeCaratulas } from '../../src/core/utils/coverMemory';
import { reiniciarIndiceDeCaratulas } from '../../src/core/utils/coverDone';
import type { GameItem } from '../../src/model/types/game';

const PROPIA = { preferirConocidas: false, soloCache: false };

function juego(id: number, name: string): GameItem {
  return { id, _ts: 1, name, platforms: ['Steam'], genres: [], steamDeck: false, review: '', grade: 50, score: 3 } as GameItem;
}

const JUEGOS = ['Celeste', 'Hades', 'Jotum', 'Portal', 'Inside', 'Limbo', 'Braid', 'Fez'].map((n, i) => juego(i + 1, n));

beforeEach(() => {
  localStorage.clear();
  reiniciarMemoriaDeCaratulas();
  reiniciarIndiceDeCaratulas();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('qué carátulas se precargan', () => {
  it('en renglones, las mismas URL que pinta el renglón, en orden y solo las de arriba', () => {
    expect(caratulasDeArriba(JUEGOS, 'list', 3, 2)).toEqual(JUEGOS.slice(0, 3).map((j) => coverDeRenglon(true, j, PROPIA)));
  });

  it('en el mosaico, la de la densidad de la pantalla, como elige el `srcset`', () => {
    expect(caratulasDeArriba(JUEGOS, 'grid', 2, 2)).toEqual(JUEGOS.slice(0, 2).map((j) => coverDeCaja(true, j, PROPIA).src2x));
    expect(caratulasDeArriba(JUEGOS, 'grid', 2, 1)).toEqual(JUEGOS.slice(0, 2).map((j) => coverDeCaja(true, j, PROPIA).src));
  });

  it('de un juego que ya se sabe que no tiene carátula no pide nada', () => {
    recordarQueNoTiene(coverUrl('Hades', ['Steam']));
    expect(caratulasDeArriba(JUEGOS, 'list', 3, 2)).toEqual([
      coverDeRenglon(true, JUEGOS[0], PROPIA),
      coverDeRenglon(true, JUEGOS[2], PROPIA),
    ]);
  });
});

describe('la espera', () => {
  it('nunca pasa del plazo, aunque las imágenes no lleguen', async () => {
    vi.useFakeTimers();
    // Una imagen que no termina nunca: la red se ha quedado colgada.
    vi.stubGlobal('Image', class { decoding = ''; src = ''; complete = false; decode() { return new Promise(() => {}); } });
    let resuelta = false;
    void precargarCaratulas(['/cover?n=Colgada'], 160).then(() => { resuelta = true; });

    await vi.advanceTimersByTimeAsync(159);
    expect(resuelta).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(resuelta).toBe(true);
  });

  it('un 404 no la rompe, y lo descodificado queda marcado como precargado', async () => {
    vi.stubGlobal('Image', class {
      decoding = '';
      src = '';
      complete = false;
      decode() {
        if (this.src.includes('Falla')) return Promise.reject(new Error('404'));
        this.complete = true;
        return Promise.resolve();
      }
    });
    await expect(precargarCaratulas(['/cover?n=Bien', '/cover?n=Falla'], 1000)).resolves.toBeUndefined();
    expect(caratulaPrecargada('/cover?n=Bien')).toBe(true);
    expect(caratulaPrecargada('/cover?n=Nunca')).toBe(false);
  });
});
