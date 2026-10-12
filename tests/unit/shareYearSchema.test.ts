// El esquema del resumen del año compartido con enlace (`kind: 'year'`, docs/plan-resumen-del-ano.md, Fase 3). Lo
// que publica la proyección pasa; lo que la proyección deja fuera (cita, día, «contigo», horas) se rechaza aunque
// alguien lo cuele a mano en la petición.
import { describe, expect, it } from 'vitest';
import { assertValidSharedYearSummary } from '../../src/model/schemas/shareSchema';
import { buildYearSummary } from '../../src/core/stats/yearSummary';
import { publicYearSummary } from '../../src/core/stats/publicYearSummary';
import type { FinishedGame } from '../../src/core/utils/finishDates';
import type { SharedYearSummary } from '../../src/model/types/share';

const games: FinishedGame[] = [1, 2, 3].map((id) => ({
  id,
  _ts: 1,
  name: `Juego ${id}`,
  platforms: ['PC'],
  genres: ['RPG'],
  steamDeck: false,
  review: 'Reseña. Con dos frases.',
  years: [2025, 2026],
  grade: 70 + id,
  strengths: ['Historia'],
  weaknesses: ['Ritmo'],
  finishedOn: `2026-0${id}-1${id}`,
}));

function article(): SharedYearSummary {
  const summary = buildYearSummary({ completed: games, year: 2026, precision: 'day', palmares: [] });
  if (!summary) throw new Error('sin resumen');
  return {
    v: 1,
    kind: 'year',
    year: 2026,
    summary: publicYearSummary(summary),
    authorNick: 'Bellanco',
    createdAt: 1_800_000_000_000,
    updatedAt: 1_800_000_000_000,
    expiresAt: 1_800_600_000_000,
  };
}

describe('el resumen del año compartido', () => {
  it('lo que sale de la proyección valida', () => {
    expect(() => assertValidSharedYearSummary(article())).not.toThrow();
  });

  it('rechaza la cita, el día, «contigo» y cualquier clave de más', () => {
    const conCita = article();
    conCita.summary.best = { ...conCita.summary.best!, quote: 'Mi reseña' };
    expect(() => assertValidSharedYearSummary(conCita)).toThrow(/quote/);

    const conDia = article();
    conDia.summary.when = { ...conDia.summary.when!, first: { ...conDia.summary.when!.first, day: 11 } };
    expect(() => assertValidSharedYearSummary(conDia)).toThrow();

    const conDias = article();
    conDias.summary.when = { ...conDias.summary.when!, days: { finishes: [], topWeekday: null, topWeekdayCount: 0 } };
    expect(() => assertValidSharedYearSummary(conDias)).toThrow();

    const conContigo = article();
    conContigo.summary.common = { names: [], top: null, gap: null, near: null, affinity: null, picks: [] };
    expect(() => assertValidSharedYearSummary(conContigo)).toThrow();

    expect(() => assertValidSharedYearSummary({ ...article(), uid: 'u1' })).toThrow(/uid/);
    expect(() => assertValidSharedYearSummary({ ...article(), summary: { ...article().summary, hours: 10 } })).toThrow(/hours/);
  });

  it('rechaza listados sin acotar', () => {
    const largo = article();
    largo.summary.platforms = Array.from({ length: 31 }, (_, index) => ({ name: `P${index}`, count: 1 }));
    expect(() => assertValidSharedYearSummary(largo)).toThrow();
  });
});
