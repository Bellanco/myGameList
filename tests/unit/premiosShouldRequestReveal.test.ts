import { describe, expect, it } from 'vitest';
import { shouldRequestReveal } from '../../src/viewmodel/premios/usePremiosReveal';

/**
 * QUIÉN PIDE LOS VOTOS DE CADA UNO. Pedirlos sin poder leerlos es una lectura gastada y un `permission-denied` en la
 * consola; no pedirlos a quien puede leerlos le deja sin la clasificación final.
 */
const base = {
  signedIn: true,
  isAdmin: false,
  profileId: 'p-ana',
  seasonId: '2026',
  votesSeasonId: '2026',
  leaderboard: [{ profileId: 'p-ana' }, { profileId: 'p-bea' }],
};

describe('shouldRequestReveal', () => {
  it('quien votó en la edición los pide', () => {
    expect(shouldRequestReveal(base)).toBe(true);
  });

  it('quien no votó, no', () => {
    expect(shouldRequestReveal({ ...base, profileId: 'p-otro' })).toBe(false);
    expect(shouldRequestReveal({ ...base, profileId: '' })).toBe(false);
  });

  it('la administración los pide aunque no votara, y aunque no tenga perfil', () => {
    expect(shouldRequestReveal({ ...base, isAdmin: true, profileId: '' })).toBe(true);
  });

  it('nadie, ni la administración, los pide si esa edición no los guarda o no hay sesión', () => {
    expect(shouldRequestReveal({ ...base, isAdmin: true, votesSeasonId: '2025' })).toBe(false);
    expect(shouldRequestReveal({ ...base, isAdmin: true, votesSeasonId: null })).toBe(false);
    expect(shouldRequestReveal({ ...base, isAdmin: true, signedIn: false })).toBe(false);
  });
});
