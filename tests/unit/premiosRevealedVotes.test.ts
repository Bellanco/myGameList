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
      { categoryId: 'goty', title: 'Juego del año', weight: 3, voted: 'Hades II', winner: 'Hades II', decided: true, hit: true },
      { categoryId: 'arte', title: 'Mejor arte', weight: 0.5, voted: 'Okami', winner: 'Hollow Knight', decided: true, hit: false },
    ]);
    expect(ana.hits).toBe(1);
    expect(ana.decided).toBe(2);
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

  // EL PANEL DE ADMINISTRACIÓN enseña la edición antes de publicarla: ahí entran también las que no tienen ganador.
  it('con `includeUndecided` entran las categorías sin ganador, con el voto y sin acierto ni fallo', () => {
    const [ana] = revealedRows([fila(1, 'Ana', 3, { goty: 'goty_option_1', desierta: 'd_0' })], categorias, { includeUndecided: true });

    expect(ana.picks.map((pick) => pick.categoryId)).toEqual(['goty', 'arte', 'desierta']);
    expect(ana.picks[2]).toMatchObject({ voted: 'Nadie', winner: '', decided: false, hit: false });
    // Los aciertos se cuentan sobre las que tienen ganador, que es contra lo que se puede acertar.
    expect(ana.hits).toBe(1);
    expect(ana.decided).toBe(2);
  });

  it('sin ningún ganador marcado (votación abierta) no hay nada decidido, y cada fila es la papeleta tal cual', () => {
    const abiertas = categorias.map((categoria) => ({ ...categoria, winner: null }));
    const entrada = fila(1, 'Ana', 0, { goty: 'goty_option_0' });
    const [ana] = revealedRows([entrada], abiertas, { includeUndecided: true });

    expect(ana.entry).toBe(entrada); // el mismo objeto: el panel casa cada fila con su papeleta por referencia
    expect(ana.decided).toBe(0);
    expect(ana.picks.map((pick) => pick.voted)).toEqual(['Elden Ring', '', '']);
  });
});
