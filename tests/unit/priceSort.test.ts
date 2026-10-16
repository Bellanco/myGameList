// ORDENAR Y FILTRAR DESEADOS POR PRECIO (segunda pasada de la P3 del plan de la ficha y los precios).
import { describe, expect, it } from 'vitest';
import { isPriceSortColumn, onSaleOnly, sortByPrice } from '../../src/core/prices/priceSort';
import { nextSort } from '../../src/core/utils/sortGames';
import { countActiveFilters, DEFAULT_FILTERS, parseFilters, serializeFilters } from '../../src/viewmodel/toolbarFilters';
import type { GameItem } from '../../src/model/types/game';
import type { PrecioItad } from '../../src/model/types/prices';

const juego = (id: number, name: string): GameItem => ({ id, _ts: 1, name, platforms: [], genres: [], steamDeck: false, review: '' });
const precio = (valor: number, descuento: number): PrecioItad => ({
  titulo: 'x',
  itadId: 'x',
  mejor: { tienda: 'Steam', precio: valor, normal: null, descuento, hasta: null, url: '#' },
  otras: [],
  minimos: { historico: null, anio: null, tresMeses: null },
  urlFicha: null,
  bundles: [],
});

const juegos = [juego(1, 'Celeste'), juego(2, 'Hades'), juego(3, 'Sin precio'), juego(4, 'Brindis'), juego(5, 'Agotado')];
const precios: Record<string, PrecioItad | null> = {
  Celeste: precio(4.99, 75),
  Hades: precio(12.49, 50),
  Brindis: precio(4.99, 0),
  Agotado: { ...precio(1, 0), mejor: null },
};
const nombres = (lista: GameItem[]) => lista.map((game) => game.name);

describe('sortByPrice', () => {
  it('por precio, de lo más barato a lo más caro, con empates por nombre y sin precio al final', () => {
    expect(nombres(sortByPrice(juegos, precios, { col: 'price', asc: true }))).toEqual(['Brindis', 'Celeste', 'Hades', 'Agotado', 'Sin precio']);
  });

  it('al revés, lo sin precio sigue al final', () => {
    expect(nombres(sortByPrice(juegos, precios, { col: 'price', asc: false }))).toEqual(['Hades', 'Brindis', 'Celeste', 'Agotado', 'Sin precio']);
  });

  it('por descuento, la rebaja más grande primero', () => {
    expect(nombres(sortByPrice(juegos, precios, { col: 'discount', asc: false }))).toEqual(['Celeste', 'Hades', 'Brindis', 'Agotado', 'Sin precio']);
  });

  it('no muta la lista que recibe', () => {
    const copia = [...juegos];
    sortByPrice(juegos, precios, { col: 'price', asc: true });
    expect(juegos).toEqual(copia);
  });
});

describe('onSaleOnly', () => {
  it('deja solo lo rebajado ahora; sin precio o sin tienda, fuera', () => {
    expect(nombres(onSaleOnly(juegos, precios))).toEqual(['Celeste', 'Hades']);
  });
});

describe('columnas y filtro de precio', () => {
  it('solo precio y descuento son columnas de precio', () => {
    expect(['price', 'discount'].map(isPriceSortColumn)).toEqual([true, true]);
    expect(isPriceSortColumn('score')).toBe(false);
  });

  it('el precio arranca de lo más barato y el descuento de la rebaja más grande', () => {
    expect(nextSort({ col: 'score', asc: false }, 'price')).toEqual({ col: 'price', asc: true });
    expect(nextSort({ col: 'score', asc: false }, 'discount')).toEqual({ col: 'discount', asc: false });
  });

  it('«En oferta» viaja en la URL y cuenta como filtro', () => {
    const conOferta = { ...DEFAULT_FILTERS, sale: true };
    expect(serializeFilters(conOferta).toString()).toBe('sale=1');
    expect(parseFilters(new URLSearchParams('sale=1')).sale).toBe(true);
    expect(parseFilters(new URLSearchParams('')).sale).toBe(false);
    expect(countActiveFilters(conOferta)).toBe(1);
  });
});
