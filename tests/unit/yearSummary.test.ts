// El resumen del año de un perfil (`core/stats/yearSummary`) y la fecha de fin de la que tira
// (`core/utils/finishDates`). Lo que fijan estas pruebas son las reglas que no se ven en pantalla: qué año se
// resume, qué juego tiene fecha y cuál no, y que nunca aparezcan horas.
import { describe, expect, it } from 'vitest';
import { buildYearSummary, quoteFromReview, summaryYear, GAP_MIN, QUOTE_MAX_CHARS } from '../../src/core/stats/yearSummary';
import { hasCompletedIn, isSummarySeason } from '../../src/core/stats/summaryYear';
import { BULK_DAY_MIN, finishDays, withFinishedOn, type FinishedGame } from '../../src/core/utils/finishDates';
import type { GameItem } from '../../src/model/types/game';
import type { PalmaresEntry } from '../../src/model/types/premios';

const at = (iso: string) => new Date(`${iso}T18:30:00`).getTime();

function game(id: number, extra: Partial<FinishedGame> = {}): FinishedGame {
  return {
    id,
    _ts: 1,
    name: `Juego ${id}`,
    platforms: ['PC'],
    genres: ['RPG'],
    steamDeck: false,
    review: '',
    years: [2025],
    grade: 80,
    ...extra,
  };
}

describe('qué año se resume', () => {
  it('desde el 15 de diciembre, el que acaba; el resto del año, el anterior', () => {
    expect(summaryYear(new Date(2026, 11, 15))).toBe(2026);
    expect(summaryYear(new Date(2026, 11, 31, 23, 59))).toBe(2026);
    expect(summaryYear(new Date(2026, 11, 14, 23, 59))).toBe(2025);
    expect(summaryYear(new Date(2026, 9, 1))).toBe(2025);
    expect(summaryYear(new Date(2027, 0, 1))).toBe(2026);
  });

  it('la temporada (avisar y publicar) es solo del 15 al 31 de diciembre', () => {
    expect(isSummarySeason(new Date(2026, 11, 15))).toBe(true);
    expect(isSummarySeason(new Date(2026, 11, 14))).toBe(false);
    expect(isSummarySeason(new Date(2027, 0, 2))).toBe(false);
  });

  it('hay resumen si completó algo ese año', () => {
    expect(hasCompletedIn([{ years: [2024] }, { years: [2023, 2025] }], 2025)).toBe(true);
    expect(hasCompletedIn([{ years: [2024] }, {}], 2025)).toBe(false);
  });

  it('sin completados ese año no hay resumen (ni botón)', () => {
    expect(buildYearSummary({ completed: [game(1, { years: [2024] })], year: 2025, precision: 'month' })).toBeNull();
  });
});

describe('la fecha de fin', () => {
  it('sale del sello de completados, al día', () => {
    expect(finishDays([game(1, { enteredAt: { c: at('2025-05-21') } })]).get(1)).toBe('2025-05-21');
  });

  it(`un día con ${BULK_DAY_MIN} o más entradas es una carga en bloque: sin fecha`, () => {
    const bulk = Array.from({ length: BULK_DAY_MIN }, (_, i) => game(i + 1, { enteredAt: { c: at('2025-03-02') } }));
    const days = finishDays([...bulk, game(99, { enteredAt: { c: at('2025-04-11') } })]);
    expect([...days.values()]).toEqual(['2025-04-11']);
  });

  it('la precisión de mes recorta el día', () => {
    const [withMonth] = withFinishedOn([game(1, { enteredAt: { c: at('2025-05-21') } })], 'month');
    expect(withMonth.finishedOn).toBe('2025-05');
  });
});

describe('el resumen', () => {
  const completed: FinishedGame[] = [
    game(1, { name: 'Clair Obscur', grade: 96, genres: ['RPG'], finishedOn: '2025-05-21', review: 'Una maravilla. De verdad.', strengths: ['Historia', 'Música'] }),
    game(2, { name: 'Silksong', grade: 93, genres: ['Metroidvania'], platforms: ['Switch'], finishedOn: '2025-10-11', strengths: ['historia'] }),
    game(3, { name: 'Hades II', grade: 90, genres: ['Acción'], finishedOn: '2025-10-26', weaknesses: ['Ritmo'] }),
    game(4, { name: 'Avowed', grade: 72, genres: ['RPG'], finishedOn: '2025-02-23', hours: 28 }),
    // Rejugada: el sello es de la primera vez (2023), así que este año no tiene fecha.
    game(5, { name: 'Celeste', grade: 88, genres: ['Plataformas'], years: [2023, 2025], finishedOn: '2023-06-01' }),
    // Del año anterior: no cuenta en este, sí en la comparación.
    game(6, { name: 'Viejo', grade: 60, years: [2024] }),
  ];

  const summary = buildYearSummary({ completed, year: 2025, precision: 'month' })!;

  it('cuenta lo de ese año y su nota media', () => {
    expect(summary.count).toBe(5);
    expect(summary.avgGrade).toBeCloseTo((96 + 93 + 90 + 72 + 88) / 5);
  });

  it('el juego del año es el de mejor nota, con la cita de su reseña; detrás, el podio', () => {
    expect(summary.best).toMatchObject({ name: 'Clair Obscur', grade: 96, genre: 'RPG', quote: 'Una maravilla. De verdad.' });
    expect(summary.podium.map((entry) => entry.name)).toEqual(['Silksong', 'Hades II']);
  });

  it('los géneros, con su media y el mejor de cada uno', () => {
    expect(summary.genres[0]).toEqual({ name: 'RPG', count: 2, avgGrade: 84, bestName: 'Clair Obscur' });
  });

  it('las etiquetas se cuentan sin distinguir mayúsculas', () => {
    expect(summary.strengths[0]).toEqual({ name: 'Historia', count: 2 });
    expect(summary.weaknesses).toEqual([{ name: 'Ritmo', count: 1 }]);
  });

  it('las carátulas de la composición, de mejor a peor nota', () => {
    expect(summary.covers.map((cover) => cover.name)).toEqual(['Clair Obscur', 'Silksong', 'Hades II', 'Celeste', 'Avowed']);
  });

  it('por meses, con la rejugada sin fecha y el mes estrella', () => {
    const when = summary.when!;
    expect(when.dated).toBe(4);
    expect(when.undated).toBe(1);
    expect(when.months[9]).toBe(2);
    expect(when.topMonths).toEqual([9]);
    expect(when.first).toEqual({ month: 1, names: ['Avowed'] });
    expect(when.last).toEqual({ month: 9, names: ['Silksong', 'Hades II'] });
    // Con precisión de mes no hay días ni día de la semana.
    expect(when.days).toBeUndefined();
  });

  it('frente al año anterior', () => {
    // «Viejo» no tiene fecha: cuenta en el total, pero no hay carrera mes a mes. Ningún género crece en dos.
    expect(summary.previous).toEqual({ year: 2024, count: 1, avgGrade: 60, months: null, undated: 1, genreRise: null });
  });

  it('no lleva horas por ningún lado', () => {
    expect(JSON.stringify(summary)).not.toMatch(/hours/);
  });

  it('sin ninguna fecha, la tarjeta de cuándo no existe', () => {
    const undated = buildYearSummary({ completed: completed.map(({ finishedOn: _omit, ...rest }) => rest), year: 2025, precision: 'month' });
    expect(undated?.when).toBeNull();
  });
});

describe('la carrera frente al año anterior', () => {
  const summary = buildYearSummary({
    completed: [
      game(1, { genres: ['Roguelike'], finishedOn: '2025-03' }),
      game(2, { genres: ['Roguelike'], finishedOn: '2025-03' }),
      game(3, { genres: ['Roguelike'], finishedOn: '2025-07' }),
      game(4, { genres: ['RPG'], finishedOn: '2025-07' }),
      game(10, { years: [2024], genres: ['RPG'], finishedOn: '2024-01' }),
      game(11, { years: [2024], genres: ['Roguelike'], finishedOn: '2024-06' }),
      // Sin fecha: no sale en la gráfica, pero el total del año anterior sigue siendo 3.
      game(12, { years: [2024], genres: ['RPG'] }),
    ],
    year: 2025,
    precision: 'month',
  })!;

  it('reparte por mes lo que tiene fecha del año anterior y cuenta lo que no', () => {
    expect(summary.previous?.months).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
    expect(summary.previous?.undated).toBe(1);
    expect(summary.previous?.count).toBe(3);
  });

  it('el género que más creció, solo si gana dos o más', () => {
    expect(summary.previous?.genreRise).toEqual({ name: 'Roguelike', from: 1, to: 3 });
  });
});

describe('con precisión de día (su dueño y la administración)', () => {
  it('da cada día con algún fin y el día de la semana que más se repite', () => {
    const summary = buildYearSummary({
      completed: [
        game(1, { finishedOn: '2025-05-17' }), // sábado
        game(2, { finishedOn: '2025-05-24' }), // sábado
        game(3, { finishedOn: '2025-06-02' }), // lunes
      ],
      year: 2025,
      precision: 'day',
    })!;
    expect(summary.when?.days?.finishes.map((entry) => entry.key)).toEqual(['2025-05-17', '2025-05-24', '2025-06-02']);
    expect(summary.when?.days?.topWeekday).toBe(6);
    expect(summary.when?.first).toEqual({ month: 4, day: 17, names: ['Juego 1'] });
  });
});

describe('contigo', () => {
  const theirs = [game(1, { name: 'Hades II', grade: 90 }), game(2, { name: 'Split Fiction', grade: 84 }), game(3, { name: 'Solo suyo' })];
  const mine: GameItem[] = [game(10, { name: 'hades ii', grade: 68 }), game(11, { name: 'Split Fiction', grade: 85 }), game(12, { name: 'Otro año', years: [2024] })];

  it('cruza por nombre lo que completasteis los dos ese año y busca dónde más chocáis', () => {
    const summary = buildYearSummary({ completed: theirs, year: 2025, precision: 'month', viewerCompleted: mine })!;
    expect(summary.common).toEqual({
      names: ['Hades II', 'Split Fiction'],
      // El de fondo es el que más os gustó a los dos: Split Fiction (84,5 de media) frente a Hades II (79).
      top: { name: 'Split Fiction', platforms: ['PC'] },
      gap: { name: 'Hades II', theirs: 90, yours: 68 },
      near: { name: 'Split Fiction', theirs: 84, yours: 85 },
      // Cien menos la diferencia media: (22 + 1) / 2.
      affinity: 89,
      picks: [],
    });
  });

  it(`por debajo de ${GAP_MIN} puntos de diferencia no hay «donde más chocáis»`, () => {
    const close: GameItem[] = [game(10, { name: 'Hades II', grade: 88 })];
    expect(buildYearSummary({ completed: theirs, year: 2025, precision: 'month', viewerCompleted: close })?.common?.gap).toBeNull();
  });

  it('con un solo juego en común con nota no hay afinidad ni «donde más coincidís»', () => {
    const summary = buildYearSummary({ completed: theirs, year: 2025, precision: 'month', viewerCompleted: mine.slice(0, 1) })!;
    expect(summary.common).toMatchObject({ names: ['Hades II'], gap: { name: 'Hades II' }, near: null, affinity: null });
  });

  it('propone lo de su año que tú tienes en Próximos, de mejor a peor nota suya', () => {
    const completed = [
      ...theirs,
      game(4, { name: 'Animal Well', grade: 96, finishedOn: '2025-11', review: 'Cada vez que creía haberlo visto todo, el pozo tenía otro fondo.' }),
      game(5, { name: 'Sin nota', grade: 0, scored: false }),
    ];
    const pending: GameItem[] = [game(20, { name: 'Solo suyo', years: [] }), game(21, { name: 'animal well', years: [] }), game(22, { name: 'Sin nota', years: [] })];
    const summary = buildYearSummary({ completed, year: 2025, precision: 'month', viewerCompleted: mine, viewerPending: pending })!;
    expect(summary.common?.picks).toEqual([
      { name: 'Animal Well', platforms: ['PC'], grade: 96, best: true, month: 10, quote: 'Cada vez que creía haberlo visto todo, el pozo tenía otro fondo.' },
      { name: 'Solo suyo', platforms: ['PC'], grade: 80, best: false, month: null, quote: '' },
    ]);
  });

  it('en el perfil propio no hay «contigo»', () => {
    expect(buildYearSummary({ completed: theirs, year: 2025, precision: 'day' })?.common).toBeNull();
  });
});

describe('el palmarés de ese año', () => {
  const entry = (rank: number, season: number): PalmaresEntry => ({ seasonId: `s${season}`, seasonName: `El reto ${season}`, rank, season, awardedAt: 1 });

  it('se queda con el puesto de ese año, o con la participación', () => {
    expect(buildYearSummary({ completed: [game(1)], year: 2025, precision: 'month', palmares: [entry(2, 2025), entry(1, 2024)] })?.palmares).toEqual({ rank: 2, seasonName: 'El reto 2025' });
    expect(buildYearSummary({ completed: [game(1)], year: 2025, precision: 'month', palmares: [entry(0, 2025)] })?.palmares).toEqual({ rank: 0, seasonName: 'El reto 2025' });
    expect(buildYearSummary({ completed: [game(1)], year: 2025, precision: 'month', palmares: [entry(1, 2024)] })?.palmares).toBeNull();
  });
});

describe('la cita', () => {
  it('corta por el final de una frase si cabe, y si no por la última palabra', () => {
    const sentences = `${'Primera frase bastante larga para que cuente como cita. '.repeat(2)}${'x'.repeat(200)}`;
    expect(quoteFromReview(sentences).endsWith('cita.')).toBe(true);
    const oneSentence = `${'palabra '.repeat(40)}`;
    const cut = quoteFromReview(oneSentence);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(QUOTE_MAX_CHARS + 1);
  });
});
