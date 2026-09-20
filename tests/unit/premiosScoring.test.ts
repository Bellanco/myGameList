import { describe, expect, it } from 'vitest';
import {
  assignDenseRanks,
  computeLeaderboard,
  scoreBallot,
} from '../../src/core/premios/scoring';
import type { PremiosBallot, PremiosCategory } from '../../src/model/types/premios';

const categories: PremiosCategory[] = [
  {
    id: 'cat1',
    title: { es: 'Juego del año' },
    weight: 2,
    winner: 'cat1_option_0',
    options: [
      { id: 'cat1_option_0', es: 'Juego A', en: 'Game A' },
      { id: 'cat1_option_1', es: 'Juego B', en: 'Game B' },
    ],
  },
  {
    id: 'cat2',
    title: { es: 'Banda sonora' },
    weight: 1,
    winner: 'cat2_option_1',
    options: [
      { id: 'cat2_option_0', es: 'Juego C', en: 'Game C' },
      { id: 'cat2_option_1', es: 'Juego D', en: 'Game D' },
    ],
  },
];

const papeleta = (partial: Partial<PremiosBallot>): PremiosBallot => ({
  userId: 'u',
  selections: {},
  ...partial,
});

describe('scoreBallot', () => {
  it('suma el peso de cada acierto', () => {
    const ballot = papeleta({ selections: { cat1: 'cat1_option_0', cat2: 'cat2_option_1' } });
    expect(scoreBallot(ballot, categories)).toBe(3);
  });

  it('ignora los fallos y las categorías sin votar', () => {
    expect(scoreBallot(papeleta({ selections: { cat1: 'cat1_option_1' } }), categories)).toBe(0);
  });

  it('cuenta solo los aciertos', () => {
    const ballot = papeleta({ selections: { cat1: 'cat1_option_0', cat2: 'cat2_option_0' } });
    expect(scoreBallot(ballot, categories)).toBe(2);
  });

  it('devuelve 0 sin selecciones', () => {
    expect(scoreBallot(papeleta({}), categories)).toBe(0);
    expect(scoreBallot(null, categories)).toBe(0);
  });

  // La razón de ser de `resolveOptionId`: un voto y un ganador guardados por NOMBRE siguen contando.
  it('tolera ganador y voto guardados por nombre', () => {
    const legacy: PremiosCategory[] = [
      { id: 'cat1', title: '', weight: 1, winner: 'Juego A', options: ['Juego A', 'Juego B'] },
    ];
    expect(scoreBallot(papeleta({ selections: { cat1: 'Juego A' } }), legacy)).toBe(1);
  });

  it('usa peso 1 cuando la categoría no dice otra cosa', () => {
    const cats: PremiosCategory[] = [
      { id: 'c', title: '', winner: 'c_option_0', options: [{ id: 'c_option_0', name: 'X' }] },
    ];
    expect(scoreBallot(papeleta({ selections: { c: 'c_option_0' } }), cats)).toBe(1);
  });

  // Los ganadores llegan por parámetro porque la colección de categorías es de lectura abierta: el mapa manda
  // sobre lo que traiga la categoría.
  it('el mapa de ganadores tiene prioridad sobre el ganador embebido', () => {
    const ballot = papeleta({ selections: { cat1: 'cat1_option_1' } });
    expect(scoreBallot(ballot, categories, { cat1: 'cat1_option_1' })).toBe(2);
  });
});

describe('computeLeaderboard', () => {
  const ballots: PremiosBallot[] = [
    papeleta({ userId: 'u1', profileId: 'p1', userDisplayName: 'Ana', selections: { cat1: 'cat1_option_0', cat2: 'cat2_option_1' } }),
    papeleta({ userId: 'u2', profileId: 'p2', userNickname: 'Beto', selections: { cat1: 'cat1_option_0' } }),
    papeleta({ userId: 'u3', selections: {} }),
  ];

  it('ordena de mayor a menor y reparte puesto', () => {
    const board = computeLeaderboard(ballots, categories);
    expect(board.map((e) => e.userId)).toEqual(['u1', 'u2', 'u3']);
    expect(board.map((e) => e.rank)).toEqual([1, 2, 3]);
    expect(board[0].points).toBe(3);
  });

  it('resuelve el nombre: el elegido, luego el de la cuenta, luego «Anónimo»', () => {
    const board = computeLeaderboard(ballots, categories);
    expect(board.map((e) => e.nickname)).toEqual(['Ana', 'Beto', 'Anónimo']);
  });

  // EL PSEUDÓNIMO ES LO QUE SOBREVIVE AL ARCHIVAR (ver docs/plan-unificar-premios.md §4.1): el archivo publicado
  // no lleva `userId`, así que sin esto la fila no podría reconocerse ni enlazar a ningún perfil.
  it('propaga el pseudónimo del perfil, y lo deja vacío si la papeleta no lo trae', () => {
    const board = computeLeaderboard(ballots, categories);
    expect(board.map((e) => e.profileId)).toEqual(['p1', 'p2', '']);
  });

  it('empata el puesto de quienes suman lo mismo', () => {
    const empatados = [
      papeleta({ userId: 'u1', userDisplayName: 'Ana', selections: { cat1: 'cat1_option_0' } }),
      papeleta({ userId: 'u2', userDisplayName: 'Beto', selections: { cat1: 'cat1_option_0' } }),
      papeleta({ userId: 'u3', userDisplayName: 'Carla', selections: { cat2: 'cat2_option_1' } }),
    ];
    expect(computeLeaderboard(empatados, categories).map((e) => e.rank)).toEqual([1, 1, 2]);
  });

  it('devuelve una lista vacía sin papeletas', () => {
    expect(computeLeaderboard([], categories)).toEqual([]);
    expect(computeLeaderboard(null, categories)).toEqual([]);
  });
});

describe('assignDenseRanks', () => {
  it('da el MISMO puesto a quienes empatan', () => {
    const board = assignDenseRanks([
      { nickname: 'Ana', points: 5 },
      { nickname: 'Beto', points: 5 },
      { nickname: 'Carla', points: 3 },
    ]);
    expect(board.map((e) => e.rank)).toEqual([1, 1, 2]);
  });

  // Lo que reparte los trofeos del podio es el PUESTO: con tres primeros, el cuarto clasificado se lleva el
  // título de SEGUNDO.
  it('no deja huecos tras un empate', () => {
    const board = assignDenseRanks([{ points: 9 }, { points: 9 }, { points: 9 }, { points: 1 }]);
    expect(board.map((e) => e.rank)).toEqual([1, 1, 1, 2]);
  });

  it('ordena aunque lleguen desordenados y conserva el resto de campos', () => {
    const board = assignDenseRanks([
      { nickname: 'Ana', points: 2, profileId: 'aaa' },
      { nickname: 'Beto', points: 7, profileId: 'bbb' },
    ]);
    expect(board.map((e) => e.nickname)).toEqual(['Beto', 'Ana']);
    expect(board[0]).toMatchObject({ rank: 1, points: 7, profileId: 'bbb' });
  });

  // Los archivos publicados antes del ranking denso guardaban el puesto como posición en la lista. Se recalcula
  // al leerlos, y por eso no hay que migrar ni uno.
  it('es idempotente sobre un archivo antiguo', () => {
    const archived = [
      { rank: 1, points: 4 },
      { rank: 2, points: 4 },
      { rank: 3, points: 0 },
    ];
    expect(assignDenseRanks(archived).map((e) => e.rank)).toEqual([1, 1, 2]);
    expect(assignDenseRanks(assignDenseRanks(archived)).map((e) => e.rank)).toEqual([1, 1, 2]);
  });

  it('aguanta una clasificación vacía o ausente', () => {
    expect(assignDenseRanks([])).toEqual([]);
    expect(assignDenseRanks(null)).toEqual([]);
  });
});
