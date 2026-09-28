import { describe, expect, it } from 'vitest';
import { hasPopularVote, popularWinners, tallyVotes } from '../../src/core/premios/popularVote';
import type { PremiosBallot, PremiosCategory, PremiosSeasonResult } from '../../src/model/types/premios';

const goty: PremiosCategory = {
  id: 'goty',
  title: { es: 'Juego del año' },
  options: [
    { id: 'goty_a', name: 'Elden Ring' },
    { id: 'goty_b', name: 'Hades II' },
    { id: 'goty_c', name: 'Balatro' },
  ],
};

const papeleta = (userId: string, voto: string): PremiosBallot => ({ userId, selections: { goty: voto } });

describe('tallyVotes', () => {
  it('cuenta cuántas personas votaron cada nominado, sin decir quiénes', () => {
    const tally = tallyVotes([papeleta('u1', 'goty_a'), papeleta('u2', 'goty_a'), papeleta('u3', 'goty_b')], [goty]);
    expect(tally).toEqual({ goty: { goty_a: 2, goty_b: 1 } });
    expect(JSON.stringify(tally)).not.toContain('u1');
  });

  // Mismo criterio que el recuento de puntos: una papeleta antigua que guardó el NOMBRE cuenta igual.
  it('resuelve un voto guardado por nombre', () => {
    expect(tallyVotes([papeleta('u1', 'Hades II')], [goty])).toEqual({ goty: { goty_b: 1 } });
  });

  it('descarta lo que no casa con ningún nominado', () => {
    expect(tallyVotes([papeleta('u1', 'Otro juego')], [goty])).toEqual({});
  });
});

const archivo = (votes: PremiosSeasonResult['votes']): PremiosSeasonResult => ({
  season: 2026,
  seasonId: '2026',
  name: 'Game Awards 2026',
  winners: { goty: 'goty_b' },
  categoriesSnapshot: [
    { id: 'goty', title: goty.title, winner: 'goty_b', weight: 3, options: goty.options },
    { id: 'arte', title: { es: 'Arte' }, winner: null, weight: 1, options: [{ id: 'arte_a', name: 'Hades II' }] },
  ],
  leaderboard: [],
  totalBallots: 3,
  votes,
});

describe('popularWinners', () => {
  it('saca el más votado de cada categoría con sus votos y el total', () => {
    const [primero] = popularWinners(archivo({ goty: { goty_a: 2, goty_b: 1 } }));
    expect(primero).toMatchObject({ optionIds: ['goty_a'], votes: 2, total: 3 });
  });

  // Con los votos iguales no hay uno más votado que otro: elegir el primero sería inventarse un ganador.
  it('con empate devuelve a todos los empatados, en el orden de la categoría', () => {
    const [primero] = popularWinners(archivo({ goty: { goty_c: 1, goty_a: 1 } }));
    expect(primero.optionIds).toEqual(['goty_a', 'goty_c']);
  });

  it('sigue el orden de las categorías archivadas, no el del mapa', () => {
    const ganadores = popularWinners(archivo({ arte: { arte_a: 1 }, goty: { goty_a: 1 } }));
    expect(ganadores.map((g) => g.category.id)).toEqual(['goty', 'arte']);
  });

  it('una edición sin recuento no tiene pantalla que ofrecer', () => {
    expect(hasPopularVote(archivo(undefined))).toBe(false);
    expect(hasPopularVote(archivo({}))).toBe(false);
    expect(popularWinners(archivo(undefined))).toEqual([]);
    expect(hasPopularVote(archivo({ goty: { goty_a: 1 } }))).toBe(true);
  });
});
