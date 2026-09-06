import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  ACHIEVEMENTS_BY_ID,
  ACHIEVEMENTS_BY_LADDER,
  LADDERS,
  SCORING_ACHIEVEMENTS,
} from '../../src/core/achievements/catalog';
import { evaluateAchievements, nextPeak } from '../../src/core/achievements/evaluate';
import { levelFromPoints, summarize } from '../../src/core/achievements/summary';
import { ACHIEVEMENTS_LIST_MAX, MIRROR_ORDER, buildMirror, measureRarity, packAchievements, parseMirror } from '../../src/core/achievements/pack';
import type { AchievementState } from '../../src/core/achievements/types';
import type { GameItem, TabData } from '../../src/model/types/game';

const NOW = Date.parse('2026-09-06T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function game(partial: Partial<GameItem> & { id: number }): GameItem {
  return {
    _ts: NOW,
    name: `Juego ${partial.id}`,
    platforms: [],
    genres: [],
    steamDeck: false,
    review: '',
    ...partial,
  };
}

function library(partial: Partial<TabData> = {}): TabData {
  return { c: [], v: [], e: [], p: [], deleted: [], updatedAt: NOW, ...partial };
}

const NO_SOCIAL = { friends: 0, postWeeks: 0, profileCreatedAt: 0 };
const NO_DEVICE = { hasSync: false, rouletteUsedAt: 0, themeChanged: false };

function evaluate(games: TabData, peak = '', extra: Partial<typeof NO_SOCIAL> = {}) {
  const states = evaluateAchievements(
    { games, social: { ...NO_SOCIAL, ...extra }, device: NO_DEVICE, now: NOW },
    peak,
  );
  return new Map(states.map((state) => [state.id, state]));
}

describe('catálogo — reglas que no se pueden romper sin avisar', () => {
  it('no hay dos logros con el mismo `id`', () => {
    // Un `id` viaja en el canal y en el estado local de todos los dispositivos: un duplicado hace que dos logros
    // distintos se pisen para siempre.
    const ids = ACHIEVEMENTS.map((def) => def.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('el `id` de un escalón lleva su umbral, no su posición', () => {
    // Es lo que hace ADITIVO insertar un escalón intermedio. Con el índice dentro del `id`, meter el 25 entre el
    // 10 y el 50 correría todos los siguientes y retiraría un logro ya publicado a todo el mundo.
    for (const def of ACHIEVEMENTS) {
      expect(def.id, def.id).toBe(`${def.ladder}-${def.step}`);
    }
  });

  it('los umbrales de cada escalera son monótonos y no se repiten', () => {
    for (const ladder of LADDERS) {
      expect(ladder.steps.length, ladder.key).toBeGreaterThan(0);
      for (let i = 1; i < ladder.steps.length; i += 1) {
        if (ladder.descending) expect(ladder.steps[i], `${ladder.key} escalón ${i + 1}`).toBeLessThan(ladder.steps[i - 1]);
        else expect(ladder.steps[i], `${ladder.key} escalón ${i + 1}`).toBeGreaterThan(ladder.steps[i - 1]);
      }
    }
  });

  it('cada escalón sabe su grado y su dibujo', () => {
    for (const [key, steps] of ACHIEVEMENTS_BY_LADDER) {
      steps.forEach((def, index) => {
        expect(def.icon, def.id).toBeTruthy();
        expect(def.grade, def.id).toBe(index + 1);
        expect(def.grades, def.id).toBe(steps.length);
        expect(def.ladder).toBe(key);
      });
    }
  });

  it('el nombre de un escalón se lee solo', () => {
    // Cada fila del listado es ya un logro completo: sin el grado en el nombre, media pantalla dice lo mismo.
    expect(ACHIEVEMENTS_BY_ID.get('completados-50')?.labels.name).toBe('Créditos finales III');
    expect(ACHIEVEMENTS_BY_ID.get('completados-50')?.labels.condition).toBe('Juegos que has terminado: 50');
    // Y una escalera de un solo escalón no lleva numeral: un «I» en algo que no tiene II es ruido.
    expect(ACHIEVEMENTS_BY_ID.get('paso-ruleta-1')?.labels.name).toBe('Tira el dado');
  });

  it('los «primeros pasos» y los retirados quedan fuera de la fracción y de los puntos', () => {
    // La regla es simétrica y de una línea: lo que no se publica, no cuenta. Si puntuaran, el dueño se vería un
    // nivel y su amistad —que lo reconstruye desde el espejo— le vería otro.
    expect(SCORING_ACHIEVEMENTS.some((def) => def.family === 'onboarding')).toBe(false);
    expect(SCORING_ACHIEVEMENTS.some((def) => def.retired)).toBe(false);
    expect(SCORING_ACHIEVEMENTS.length).toBe(251);
  });

  it('un excepcional no tiene escalera larga… salvo los que cuenta el calendario', () => {
    // A 60 puntos cada uno, una escalera larga de excepcionales mueve el nivel de perfil ella sola. Lo
    // excepcional lo es por conseguirse, no por repetirse — y la excepción es lo anual, donde el escalón no lo
    // pone el esfuerzo, lo pone el tiempo.
    for (const ladder of LADDERS) {
      if (ladder.rarity !== 'excepcional' || ladder.family === 'annual') continue;
      expect(ladder.steps.length, ladder.key).toBeLessThanOrEqual(5);
    }
  });
});

describe('métricas — donde la ausencia de dato se leería como dato', () => {
  it('«Lo terminé por orgullo» NO cuenta los completados sin nota', () => {
    // `resolveGrade` devuelve 0 para un juego sin puntuar, y 0 es menor que 50: sin la guarda, este logro cuenta
    // toda la lista de completados.
    const sinNota = evaluate(library({ c: [game({ id: 1 }), game({ id: 2 }), game({ id: 3 })] }));
    expect(sinNota.get('orgullo-1')?.value).toBe(0);

    const conNota = evaluate(library({ c: [game({ id: 1, grade: 30 }), game({ id: 2 })] }));
    expect(conNota.get('orgullo-1')?.level).toBe(1);
  });

  it('«Exterminatus» NO salta con la biblioteca recién instalada', () => {
    // La lista vacía es cierta para quien vació su pila y para quien acaba de llegar. Sin la guarda, un usuario
    // nuevo estrena en su primer render el excepcional más caro del catálogo — y ahora, los cinco de golpe.
    const nueva = evaluate(library());
    expect(nueva.get('estanteria-cero-50')?.level).toBe(0);
    expect(nueva.get('estanteria-cero-1')?.level).toBe(0);

    // Y sí salta cuando de verdad se ha vaciado una pila que existía.
    const vaciada = library({
      c: Array.from({ length: 5 }, (_u, i) => game({ id: i + 1, enteredAt: { p: NOW - 10 * DAY, c: NOW - DAY } })),
    });
    expect(evaluate(vaciada).get('estanteria-cero-1')?.level).toBe(1);
  });

  it('la escalera descendente se recorre de arriba abajo', () => {
    // Siete pasaron por Próximos y dos siguen ahí: se han cruzado los umbrales de 50, 25, 10 y 5, pero no el de 1.
    const pila = library({
      c: Array.from({ length: 7 }, (_u, i) => game({ id: i + 1, enteredAt: { p: NOW - 10 * DAY, c: NOW - DAY } })),
      p: [game({ id: 90, enteredAt: { p: NOW - 5 * DAY } }), game({ id: 91, enteredAt: { p: NOW - 5 * DAY } })],
    });
    const states = evaluate(pila);
    expect(states.get('estanteria-cero-25')?.level).toBe(1);
    expect(states.get('estanteria-cero-5')?.level).toBe(1);
    expect(states.get('estanteria-cero-1')?.level).toBe(0);
  });

  it('«Nota del crítico» no cuenta los ceros de los juegos sin puntuar', () => {
    const notas = [10, 90, 20, 80, 30, 70, 40, 60, 15, 95, 25, 85, 35, 75, 45, 65, 5, 99, 50, 55, 12, 88, 33, 66, 21];
    const conRuido = library({
      c: [...notas.map((grade, index) => game({ id: index + 1, grade })), ...Array.from({ length: 30 }, (_u, i) => game({ id: 500 + i }))],
    });
    // Veinticinco notas reales: el primer escalón. Los treinta sin puntuar no suman ni inflan la desviación.
    expect(evaluate(conRuido).get('criterio-25')?.value).toBe(25);
    expect(evaluate(conRuido).get('criterio-25')?.level).toBe(1);
  });

  it('«Sin cabos sueltos» con nada cerrado da 0, no NaN', () => {
    const state = evaluate(library({ p: [game({ id: 1 })] })).get('cobertura-25');
    expect(Number.isNaN(state?.value)).toBe(false);
    expect(state?.value).toBe(0);
  });

  it('«Speedrun» exige el PAR de sellos y nunca `listedAt`', () => {
    // Catalogar hacia atrás un juego viejo directamente como terminado sella `listedAt` y `enteredAt.c` el mismo
    // día: sobre una biblioteca real esa definición daba 42 aciertos y los 42 eran falsos.
    const catalogadoHaciaAtras = library({ c: [game({ id: 1, listedAt: NOW, enteredAt: { c: NOW } })] });
    expect(evaluate(catalogadoHaciaAtras).get('speedrun-1')?.value).toBe(0);

    const deVerdad = library({ c: [game({ id: 2, enteredAt: { p: NOW - 3600_000, c: NOW } })] });
    expect(evaluate(deVerdad).get('speedrun-1')?.value).toBe(1);
  });

  it('lo anual se mide sobre `years` y no sobre `enteredAt`', () => {
    // Con `enteredAt.c` una biblioteca catalogada de golpe da 1 año; con `years`, los que de verdad jugó.
    const games = library({
      c: [game({ id: 1, years: [2001, 2014], enteredAt: { c: NOW } }), game({ id: 2, years: [2020], enteredAt: { c: NOW } })],
    });
    expect(evaluate(games).get('memoria-larga-3')?.value).toBe(3);
  });

  it('«Toda una vida» cuenta años SEGUIDOS, que es lo que «Partida guardada» no dice', () => {
    const salteados = library({ c: [game({ id: 1, years: [2000, 2005, 2010, 2020, 2021, 2022] })] });
    const states = evaluate(salteados);
    expect(states.get('memoria-larga-3')?.value).toBe(6); // seis años distintos
    expect(states.get('cadena-de-anos-3')?.value).toBe(3); // pero la racha más larga son tres
    expect(states.get('cadena-de-anos-5')?.level).toBe(0);
  });

  it('«Sin prisa pero sin pausa» exige CERRAR, no solo catalogar', () => {
    // Es la única métrica del catálogo que no se satisface ordenando fichas: «Aún estás aquí» cuenta cualquier
    // sello, incluido el de meter un juego en Próximos.
    const soloCatalogado = library({
      p: [
        game({ id: 1, enteredAt: { p: Date.parse('2026-01-15T10:00:00Z') } }),
        game({ id: 2, enteredAt: { p: Date.parse('2026-02-15T10:00:00Z') } }),
      ],
    });
    expect(evaluate(soloCatalogado).get('ritmo-2')?.value).toBe(0);

    const cerrando = library({
      c: [
        game({ id: 1, enteredAt: { c: Date.parse('2026-01-15T10:00:00Z') } }),
        game({ id: 2, enteredAt: { c: Date.parse('2026-02-15T10:00:00Z') } }),
        game({ id: 3, enteredAt: { c: Date.parse('2026-03-15T10:00:00Z') } }),
      ],
    });
    expect(evaluate(cerrando).get('ritmo-3')?.level).toBe(1);
  });

  it('las banderas que nadie miraba ya cuentan', () => {
    const marcados = library({
      c: [game({ id: 1, replayable: true }), game({ id: 2, replayable: true }), game({ id: 3, replayable: true })],
      v: [game({ id: 4, retry: true })],
      p: [game({ id: 5, shared: true })],
    });
    const states = evaluate(marcados);
    expect(states.get('volvere-3')?.level).toBe(1);
    expect(states.get('revancha-1')?.level).toBe(1);
    expect(states.get('escaparate-1')?.level).toBe(1);
  });
});

describe('los logros que miden sobre otros logros', () => {
  it('«Tutorial superado» espera a los ocho primeros pasos', () => {
    const casi = evaluateAchievements(
      {
        games: library({ c: [game({ id: 1, grade: 80, review: 'x' })], p: [game({ id: 2 })], v: [game({ id: 3, reasons: ['no'] })] }),
        social: NO_SOCIAL,
        device: { hasSync: true, rouletteUsedAt: NOW, themeChanged: false },
        now: NOW,
      },
    );
    expect(casi.find((state) => state.id === 'tutorial-1')?.level).toBe(0);

    const completo = evaluateAchievements(
      {
        games: library({ c: [game({ id: 1, grade: 80, review: 'x' })], p: [game({ id: 2 })], v: [game({ id: 3, reasons: ['no'] })] }),
        social: NO_SOCIAL,
        device: { hasSync: true, rouletteUsedAt: NOW, themeChanged: true },
        now: NOW,
      },
    );
    expect(completo.find((state) => state.id === 'tutorial-1')?.level).toBe(1);
  });

  it('«Cien por cien» cuenta escaleras terminadas, no escalones sueltos', () => {
    // Tres escaleras cortas al tope: `obra-maestra` (2), `vida-entera` (3) y `no-eres-tu` (3).
    const games = library({
      c: [
        game({ id: 1, grade: 100, hours: 400 }),
        game({ id: 2, grade: 100, hours: 900 }),
        game({ id: 3, hours: 500 }),
        game({ id: 4, hours: 320 }),
      ],
      v: [
        game({ id: 5, grade: 90 }), game({ id: 6, grade: 75 }), game({ id: 7, grade: 71 }),
        game({ id: 8, grade: 88 }), game({ id: 9, grade: 70 }),
      ],
    });
    const states = evaluate(games);
    expect(states.get('obra-maestra-2')?.level).toBe(1);
    expect(states.get('vida-entera-4')?.level).toBe(1);
    expect(states.get('no-eres-tu-5')?.level).toBe(1);
    expect(states.get('platino-3')?.value).toBe(3);
    expect(states.get('platino-3')?.level).toBe(1);
  });
});

describe('la marca de agua — lo conseguido no se devuelve', () => {
  it('una biblioteca que encoge no retira el logro', () => {
    const llena = library({ c: Array.from({ length: 12 }, (_u, i) => game({ id: i + 1 })) });
    const antes = evaluate(llena);
    expect(antes.get('completados-10')?.level).toBe(1);

    const peak = nextPeak([...antes.values()], '');
    // Borras duplicados, corriges años mal puestos… y el número baja.
    const despues = evaluate(library({ c: [game({ id: 1 })] }), peak);

    expect(despues.get('completados-10')?.level).toBe(1);
    expect(despues.get('completados-10')?.value).toBe(1);
  });

  it('sin el nivel de hoy detrás, la fecha no se reinventa', () => {
    const llena = library({ c: Array.from({ length: 12 }, (_u, i) => game({ id: i + 1, enteredAt: { c: NOW - 100 * DAY } })) });
    const peak = nextPeak([...evaluate(llena).values()], '');
    const despues = evaluate(library(), peak).get('completados-10');
    // Recalcular la fecha diría que se consiguió hoy, que es falso: mejor sin fecha que con una inventada.
    expect(despues?.level).toBe(1);
    expect(despues?.unlockedAt).toBe(0);
  });

  it('la marca de agua no crece con lo que no existe', () => {
    expect(nextPeak([], 'inventado-99:1')).toContain('inventado-99');
    const peak = nextPeak([{ id: 'completados-10', level: 1, value: 10, next: null, unlockedAt: 0 }], '');
    expect(peak).toBe('completados-10:1');
  });
});

describe('las dos cifras', () => {
  it('la curva por tramos: el salto de tramo cae donde dice la tabla', () => {
    expect(levelFromPoints(0).level).toBe(1);
    expect(levelFromPoints(40).level).toBe(2);
    expect(levelFromPoints(359).level).toBe(9);
    expect(levelFromPoints(360).level).toBe(10);
    expect(levelFromPoints(480).level).toBe(11);
  });

  it('el catálogo entero tiene techo, y está donde dice el comentario', () => {
    // Con un logro por escalón el nivel deja de ser infinito: conviene que el número esté escrito y probado.
    const todos = SCORING_ACHIEVEMENTS.map((def) => ({ id: def.id, level: 1, value: 0, next: null, unlockedAt: 0 }));
    const full = summarize(todos);
    expect(full.percent).toBe(100);
    expect(full.points).toBe(5135);
    expect(full.level).toBe(37);
  });

  it('cada escalón suma una vez', () => {
    const uno = summarize([{ id: 'completados-400', level: 1, value: 400, next: null, unlockedAt: 0 }]);
    expect(uno.earned).toBe(1);
    expect(uno.total).toBe(251);
    expect(uno.points).toBe(25); // un raro, una vez
  });
});

describe('el espejo — mapa de bits y lectura defensiva', () => {
  const states: AchievementState[] = [
    { id: 'completados-50', level: 1, value: 200, next: null, unlockedAt: Date.parse('2026-03-12T10:00:00.000Z') },
    { id: 'plataformas-5', level: 1, value: 7, next: null, unlockedAt: 0 },
    { id: 'paso-resena-1', level: 1, value: 1, next: null, unlockedAt: NOW },
  ];

  it('el orden de los bits incluye los retirados, para que retirar no corra los índices', () => {
    // Es la trampa del bitmap: si `MIRROR_ORDER` fuera `SCORING_ACHIEVEMENTS`, retirar un logro desplazaría todos
    // los siguientes y cada espejo publicado pasaría a decir otra cosa.
    expect(MIRROR_ORDER).toContain('speedrun-1');
    expect(MIRROR_ORDER.some((id) => id.startsWith('paso-'))).toBe(false);
  });

  it('lo que se empaqueta es lo que se lee', () => {
    const list = packAchievements(states, ['plataformas-5']);
    const back = parseMirror(list, NOW);
    expect(back.map((item) => item.id)).toEqual(['completados-50', 'plataformas-5']);
    expect(back.find((item) => item.id === 'plataformas-5')?.featured).toBe(true);
    expect(back.find((item) => item.id === 'completados-50')?.unlockedAt).toBeGreaterThan(0);
    // Los «primeros pasos» no se publican jamás.
    expect(back.some((item) => item.id.startsWith('paso-'))).toBe(false);
  });

  it('el catálogo entero cabe de sobra en el tope de las reglas', () => {
    const todos = MIRROR_ORDER.map((id) => ({ id, level: 1, value: 0, next: null, unlockedAt: NOW }));
    const list = packAchievements(todos);
    expect(list.length).toBeLessThanOrEqual(ACHIEVEMENTS_LIST_MAX);
    // Y no pierde ni un logro por el camino, aunque sí pueda perder fechas.
    expect(parseMirror(list, NOW)).toHaveLength(MIRROR_ORDER.length);
  });

  it('el documento que se escribiría lleva versión, sello y cadena', () => {
    // La escritura sigue apagada (`ENABLE_ACHIEVEMENTS_PUBLISH`), pero la FORMA del documento se fija ya: es lo
    // que valida la regla de Firestore, y descubrirla mal el día del corte sería descubrirla en producción.
    expect(buildMirror('2:AAAA', NOW)).toEqual({ v: 2, at: NOW, list: '2:AAAA' });
  });

  it('el parser aguanta lo que le echen sin lanzar', () => {
    expect(parseMirror('')).toEqual([]);
    expect(parseMirror('basura,,,,;;')).toEqual([]);
    expect(parseMirror(null)).toEqual([]);
    // La gramática vieja ya no se lee: no hay espejos publicados con ella, y aceptarla obligaría a mantener dos
    // catálogos para siempre.
    expect(parseMirror('completados.3.2311')).toEqual([]);
    // Bits de más: un amigo con una versión más nueva publica logros que este cliente no conoce. Se ignoran, y
    // reaparecen en cuanto este se actualice. Nunca es un error de parseo.
    expect(() => parseMirror(`2:${'_'.repeat(200)}`)).not.toThrow();
    expect(parseMirror(`2:${'_'.repeat(200)}`).length).toBe(MIRROR_ORDER.length);
  });

  it('una fecha en el futuro se pinta SIN fecha, no descarta el logro', () => {
    const list = packAchievements([
      { id: 'completados-10', level: 1, value: 10, next: null, unlockedAt: NOW + 400 * DAY },
    ]);
    const [item] = parseMirror(list, NOW);
    expect(item.id).toBe('completados-10');
    expect(item.unlockedAt).toBe(0);
  });

  it('quince destacados marcados se recortan a tres', () => {
    const many = MIRROR_ORDER.slice(0, 15);
    const list = packAchievements(many.map((id) => ({ id, level: 1, value: 0, next: null, unlockedAt: NOW })), many);
    expect(parseMirror(list, NOW).filter((item) => item.featured)).toHaveLength(3);
  });
});

describe('el porcentaje comparado', () => {
  const mirrorOf = (ids: string[]) =>
    packAchievements(ids.map((id) => ({ id, level: 1, value: 0, next: null, unlockedAt: 0 })));

  it('no se pinta por debajo del suelo de muestra', () => {
    // Con siete personas, «el 14 %» es una persona: enseñarlo es peor que callarlo.
    expect(measureRarity(Array.from({ length: 7 }, () => mirrorOf(['completados-10'])))).toBeNull();
  });

  it('con muestra suficiente cuenta cuántos lo tienen', () => {
    const mirrors = [
      ...Array.from({ length: 15 }, () => mirrorOf(['completados-10'])),
      ...Array.from({ length: 10 }, () => mirrorOf(['plataformas-3'])),
    ];
    const measured = measureRarity(mirrors);
    expect(measured?.sample).toBe(25);
    expect(measured?.percent.get('completados-10')).toBe(60);
    expect(measured?.percent.get('plataformas-3')).toBe(40);
  });
});
