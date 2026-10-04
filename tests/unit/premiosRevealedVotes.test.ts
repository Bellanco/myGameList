import { describe, expect, it } from 'vitest';
import { revealedRows } from '../../src/core/premios/revealedVotes';
import type { PremiosCategorySnapshot, PremiosRevealedBallot } from '../../src/model/types/premios';

const categorias: PremiosCategorySnapshot[] = [
  {
    id: 'goty',
    title: { es: 'Juego del año', en: 'Game of the year' },
    winner: 'goty_option_1',
    weight: 3,
    options: [
      { id: 'goty_option_0', name: 'Elden Ring' },
      { id: 'goty_option_1', name: 'Hades II' },
    ],
  },
  {
    id: 'arte',
    title: { es: 'Mejor arte' },
    winner: 'arte_option_0',
    weight: 0.5,
    options: [
      { id: 'arte_option_0', name: 'Hollow Knight' },
      { id: 'arte_option_1', name: 'Okami' },
    ],
  },
  // Sin ganador: no hay acierto ni fallo que decir.
  { id: 'desierta', title: 'Desierta', winner: null, weight: 1, options: [{ id: 'd_0', name: 'Nadie' }] },
];

const fila = (rank: number, nickname: string, points: number, selections: Record<string, string>): PremiosRevealedBallot => ({
  rank,
  profileId: `p-${nickname}`,
  nickname,
  points,
  selections,
});

describe('revealedRows', () => {
  it('cruza cada voto con el ganador y su peso', () => {
    const [ana] = revealedRows([fila(1, 'Ana', 3, { goty: 'goty_option_1', arte: 'arte_option_1' })], categorias);

    expect(ana.picks).toEqual([
      { categoryId: 'goty', title: 'Juego del año', weight: 3, voted: 'Hades II', winner: 'Hades II', hit: true },
      { categoryId: 'arte', title: 'Mejor arte', weight: 0.5, voted: 'Okami', winner: 'Hollow Knight', hit: false },
    ]);
    expect(ana.hits).toBe(1);
  });

  it('respeta los puestos del resumen, empates incluidos', () => {
    const filas = revealedRows(
      [fila(2, 'Bea', 0, {}), fila(1, 'Ana', 3, {}), fila(2, 'Cris', 0, {})],
      categorias,
    );
    expect(filas.map((f) => [f.entry.rank, f.entry.nickname])).toEqual([
      [1, 'Ana'],
      [2, 'Bea'],
      [2, 'Cris'],
    ]);
  });

  it('una categoría sin voto es un fallo sin nominado', () => {
    const [bea] = revealedRows([fila(1, 'Bea', 0, {})], categorias);
    expect(bea.picks[0]).toMatchObject({ voted: '', hit: false });
  });

  // Las papeletas antiguas guardaban el NOMBRE del nominado: el recuento las acepta y aquí también.
  it('acepta un voto guardado por nombre', () => {
    const [ana] = revealedRows([fila(1, 'Ana', 3, { goty: 'Hades II' })], categorias);
    expect(ana.picks[0]).toMatchObject({ voted: 'Hades II', hit: true });
  });
});
