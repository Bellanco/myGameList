import { describe, expect, it } from 'vitest';
import {
  isParticipation,
  palmaresCompetition,
  palmaresPlace,
  palmaresRecipientsFrom,
  palmaresYear,
  shortYear,
  sortPalmares,
} from '../../src/core/premios/palmares';
import { PREMIOS_UI } from '../../src/core/constants/premiosLabels';
import type { PalmaresEntry } from '../../src/model/types/premios';

const entrada = (seasonId: string, rank: number, extra: Partial<PalmaresEntry> = {}): PalmaresEntry => ({
  seasonId,
  seasonName: `Game Awards ${seasonId}`,
  rank,
  awardedAt: 1,
  ...extra,
});

describe('palmaresRecipientsFrom', () => {
  it('los cinco primeros puestos llevan el suyo y el resto, el de participar', () => {
    const tabla = [1, 2, 2, 3, 4, 5, 6, 7].map((rank, i) => ({ userId: `u${i}`, rank }));
    expect(palmaresRecipientsFrom(tabla).map((r) => r.rank)).toEqual([1, 2, 2, 3, 4, 5, 0, 0]);
  });

  it('sin cuenta no hay perfil donde ponerlo', () => {
    expect(palmaresRecipientsFrom([{ userId: '', rank: 1 }])).toEqual([]);
  });

  it('la participación guarda en qué puesto quedó; el trofeo de puesto no lo repite', () => {
    const tabla = [1, 6, 12].map((rank, i) => ({ userId: `u${i}`, rank }));
    expect(palmaresRecipientsFrom(tabla)).toEqual([
      { uid: 'u0', rank: 1 },
      { uid: 'u1', rank: 0, place: 6 },
      { uid: 'u2', rank: 0, place: 12 },
    ]);
  });
});

describe('palmaresPlace', () => {
  it('el puesto del trofeo, o el real de quien participó', () => {
    expect(palmaresPlace(entrada('2025', 3))).toBe(3);
    expect(palmaresPlace(entrada('2025', 0, { place: 9 }))).toBe(9);
  });

  it('una participación concedida antes de guardarlo no inventa ninguno', () => {
    expect(palmaresPlace(entrada('2025', 0))).toBe(0);
    expect(palmaresPlace(entrada('2025', 0, { place: -2 }))).toBe(0);
  });
});

describe('palmaresYear', () => {
  it('usa el año guardado y, si no está, lo busca en el id y en el nombre', () => {
    expect(palmaresYear(entrada('x', 1, { season: 2021 }))).toBe(2021);
    expect(palmaresYear(entrada('2025', 1))).toBe(2025);
    expect(palmaresYear({ seasonId: 'reto-invierno', seasonName: 'El reto del jugador 2027' })).toBe(2027);
  });

  it('sin año no se inventa ninguno', () => {
    expect(palmaresYear({ seasonId: 'reto', seasonName: 'Reto' })).toBe(0);
    expect(shortYear(0)).toBe('');
  });
});

describe('sortPalmares', () => {
  // Las ediciones antiguas se importaron todas a la vez: por fecha de concesión, 2020 saldría delante de 2025.
  it('ordena por el año de la edición, no por cuándo se concedió', () => {
    const vitrina = sortPalmares([
      entrada('2020', 1, { awardedAt: 900 }),
      entrada('2025', 3, { awardedAt: 100 }),
      entrada('2022', 2, { awardedAt: 500 }),
    ]);
    expect(vitrina.map((e) => e.seasonId)).toEqual(['2025', '2022', '2020']);
  });

  it('la participación no le gana a un puesto', () => {
    expect(isParticipation(entrada('2025', 0))).toBe(true);
    const vitrina = sortPalmares([entrada('a-2025', 0), entrada('b-2025', 5)]);
    expect(vitrina.map((e) => e.rank)).toEqual([5, 0]);
  });
});

describe('la píldora del canto', () => {
  // El año ya va en el rótulo de debajo: en la pastilla solo cabe el puesto.
  it('lleva solo el puesto, y el año si es de participar', () => {
    expect(PREMIOS_UI.palmares.pill(3, shortYear(2025))).toBe('3.º');
    expect(PREMIOS_UI.palmares.pill(0, shortYear(2025))).toBe('’25');
    expect(PREMIOS_UI.palmares.pill(2, '')).toBe('2.º');
  });

  it('el rótulo distingue participar de quedar en un puesto', () => {
    expect(PREMIOS_UI.palmares.entry(0, 'Game Awards 2025')).toBe('Participó en Game Awards 2025');
    expect(PREMIOS_UI.palmares.entry(3, 'Game Awards 2025')).toBe('3.º en Game Awards 2025');
  });
});

describe('el banderín del perfil', () => {
  const L = PREMIOS_UI.palmares;

  it('el puesto, también el de quien participó; sin él, «Participó»', () => {
    expect(L.bandRank(1)).toBe('1.º');
    expect(L.bandRank(12)).toBe('12.º');
    expect(L.bandRank(0)).toBe('Participó');
  });

  it('la competición va sin el año, que la cinta pone aparte', () => {
    expect(palmaresCompetition({ seasonId: 'ga-2025', seasonName: 'Game Awards 2025' })).toBe('Game Awards');
    expect(palmaresCompetition({ seasonId: 'x', seasonName: 'The Game Awards' })).toBe('The Game Awards');
    // Un nombre que solo fuera el año no se queda vacío.
    expect(palmaresCompetition({ seasonId: '2024', seasonName: '2024' })).toBe('2024');
  });

  it('el rótulo completo de una participación dice su puesto, como un trofeo de puesto', () => {
    expect(L.entry(0, 'Game Awards 2024', 7)).toBe('7.º en Game Awards 2024');
    expect(L.entry(0, 'Game Awards 2024')).toBe('Participó en Game Awards 2024');
    expect(L.entryAria(0, 'Game Awards 2024', 7)).toBe('7.º en Game Awards 2024: ver los resultados');
    expect(L.medalAria(0, 'Game Awards 2024', 7)).toBe('Trofeo: participación en Game Awards 2024, 7.º puesto');
  });
});
