import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  ACHIEVEMENTS_BY_ID,
  ACHIEVEMENTS_BY_LADDER,
  LADDERS,
  SCORING_ACHIEVEMENTS,
} from '../../src/core/achievements/catalog';
import { evaluateAchievements, nextPeak } from '../../src/core/achievements/evaluate';
import { libraryStart } from '../../src/core/achievements/metrics';
import { levelFromPoints, summarize } from '../../src/core/achievements/summary';
import { ACHIEVEMENTS_LIST_MAX, MIRROR_ORDER, buildMirror, measureRarity, packAchievements, parseMirror } from '../../src/core/achievements/pack';
import type { AchievementState } from '../../src/core/achievements/types';
import { medalThreshold } from '../../src/core/constants/achievementLabels';
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

  it('cada escalera escribe su condición en una frase, no en «condición: número»', () => {
    // El fallback de `expand` compone «Juegos terminados en un mismo año natural: 20», que es como habla una
    // máquina y no como se lee una lista. Toda escalera declara su `goal`, y este test es lo que impide que la
    // próxima se cuele sin él: el fallback sigue existiendo como red, pero nadie debe aterrizar en él.
    const sinFrase = LADDERS.filter((ladder) => !ladder.goal).map((ladder) => ladder.key);
    expect(sinFrase, `escaleras sin goal: ${sinFrase.join(', ')}`).toEqual([]);
  });

  it('ninguna condición acaba en «: número»', () => {
    // La cifra va DENTRO de la frase («Terminar 100 juegos»). Acabar en dos puntos y el umbral es la firma del
    // fallback, y es justo lo que no queremos leer en el listado.
    //
    // No se comprueba que el número aparezca UNA sola vez, porque hay frases donde sale dos veces con razón:
    // «Llegar a 40 h en 40 juegos» tiene el umbral de la escalera y las horas que la definen, y ambas son 40.
    for (const def of ACHIEVEMENTS) {
      expect(def.labels.condition.endsWith(`: ${def.step}`), `${def.id}: «${def.labels.condition}»`).toBe(false);
    }
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
    expect(ACHIEVEMENTS_BY_ID.get('completados-50')?.labels.condition).toBe('Termina 50 juegos');
    // Y una escalera de un solo escalón no lleva numeral: un «I» en algo que no tiene II es ruido.
    expect(ACHIEVEMENTS_BY_ID.get('paso-ruleta-1')?.labels.name).toBe('Tira el dado');
  });

  it('los «primeros pasos» y los retirados quedan fuera de la fracción y de los puntos', () => {
    // La regla es simétrica y de una línea: lo que no se publica, no cuenta. Si puntuaran, el dueño se vería un
    // nivel y su amistad —que lo reconstruye desde el espejo— le vería otro.
    expect(SCORING_ACHIEVEMENTS.some((def) => def.family === 'onboarding')).toBe(false);
    expect(SCORING_ACHIEVEMENTS.some((def) => def.retired)).toBe(false);
    expect(SCORING_ACHIEVEMENTS.length).toBe(402);
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

  /**
   * LA PILA TUVO QUE SER UNA PILA. Con un mínimo absoluto, a quien tiene ocho juegos en total y llegó a apilar
   * cinco se le regalaban de golpe los escalones de 50, 25 y 10 sin haber bajado nada: premiarle por «dejar
   * Próximos en 50 o menos» a quien jamás pasó de cinco no dice nada de nadie.
   *
   * Ahora la exigencia es RELATIVA: más del 15 % de la biblioteca en el punto más alto. Es la misma vara leída a
   * la escala de cada cual, que es justo lo que un número absoluto no puede hacer.
   */
  it('«Exterminatus» pide que la pila fuera una parte real de la colección', () => {
    const apilado = (id: number) => game({ id, enteredAt: { p: NOW - 10 * DAY, c: NOW - DAY } });
    const suelto = (id: number) => game({ id, enteredAt: { c: NOW - DAY } });

    // Biblioteca grande con una pila ridícula: 300 juegos y sólo 20 pasaron por Próximos (el 6,6 %). No cuenta.
    const pilaRidicula = library({
      c: [
        ...Array.from({ length: 20 }, (_u, i) => apilado(i + 1)),
        ...Array.from({ length: 280 }, (_u, i) => suelto(100 + i)),
      ],
    });
    expect(evaluate(pilaRidicula).get('estanteria-cero-50')?.level, 'pila del 6 %').toBe(0);

    // La misma pila de 20, pero sobre una biblioteca de 40: el 50 %. Eso sí fue una pila, y sí cuenta.
    const pilaDeVerdad = library({
      c: [
        ...Array.from({ length: 20 }, (_u, i) => apilado(i + 1)),
        ...Array.from({ length: 20 }, (_u, i) => suelto(100 + i)),
      ],
    });
    expect(evaluate(pilaDeVerdad).get('estanteria-cero-50')?.level, 'pila del 50 %').toBe(1);

    // Y el mínimo absoluto se queda ADEMÁS del porcentaje: en una biblioteca de tres, el 15 % es medio juego, y
    // «tuve un juego apilado» no es una pila por mucho que sea el 33 %.
    const bibliotecaMinima = library({ c: [apilado(1), suelto(2), suelto(3)] });
    expect(evaluate(bibliotecaMinima).get('estanteria-cero-50')?.level, 'biblioteca de tres').toBe(0);
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

describe('las escaleras nuevas — la forma, los agregados, las etiquetas y la distancia', () => {
  it('el 3×3 no se cuela por un lado: hacen falta N juegos Y N vueltas', () => {
    // Es lo que separa a «El día de la marmota» de «New Game +», que suma vueltas y no sabe cómo se reparten.
    const unoMuyRejugado = library({ c: [game({ id: 1, years: [2018, 2019, 2020, 2021, 2022] })] });
    expect(evaluate(unoMuyRejugado).get('marmota-2')?.value).toBe(1);
    expect(evaluate(unoMuyRejugado).get('marmota-2')?.level).toBe(0);

    const muchosDeUnaVuelta = library({ c: Array.from({ length: 10 }, (_u, i) => game({ id: i + 1, years: [2020] })) });
    expect(evaluate(muchosDeUnaVuelta).get('marmota-2')?.level).toBe(0);

    // Y el 3×3 de verdad: tres juegos con tres vueltas cada uno.
    const tresPorTres = library({
      c: [1, 2, 3].map((id) => game({ id, years: [2020, 2021, 2022] })),
    });
    const states = evaluate(tresPorTres);
    expect(states.get('marmota-3')?.value).toBe(3);
    expect(states.get('marmota-3')?.level).toBe(1);
    expect(states.get('marmota-4')?.level).toBe(0);
  });

  it('el índice por etiqueta exige fondo Y amplitud, no una sola pila', () => {
    const unSoloGenero = library({
      c: Array.from({ length: 20 }, (_u, i) => game({ id: i + 1, genres: ['FPS'] })),
      v: [game({ id: 90, genres: ['Puzles'] }), game({ id: 91, genres: ['Cartas'] })],
    });
    // Veinte de un género y uno de otros dos: el índice se queda en 1, aunque «Mundo abierto» diría 3.
    expect(evaluate(unSoloGenero).get('todos-los-palos-3')?.value).toBe(1);

    const repartido = library({
      c: ['FPS', 'ARPG', 'Puzles'].flatMap((genre, g) => [1, 2, 3].map((n) => game({ id: g * 10 + n, genres: [genre] }))),
    });
    expect(evaluate(repartido).get('todos-los-palos-3')?.level).toBe(1);
  });

  /**
   * LA FECHA DE UN LOGRO NO SE MUEVE. El índice por etiqueta fechaba con el sello MÁS TARDÍO de su grupo, así
   * que cada juego nuevo de ese género empujaba la fecha hacia delante y «A todos los palos I» —conseguido hace
   * meses— pasaba a decir que fue hoy. Se vio en la app, con la biblioteca real: aparecía fechado en el día en
   * que se editó un juego cualquiera de un género que ya contaba.
   *
   * Ahora se consigue SIN fecha, que es un estado previsto (§5.3) y la única respuesta honesta: la fecha buena
   * sería la del juego que completó el grupo, y cuál es eso depende del tamaño al que se mire, que lo decide el
   * índice después.
   */
  it('el índice por etiqueta no cambia de fecha al crecer su grupo', () => {
    const generos = ['FPS', 'FPS', 'FPS', 'RPG', 'RPG', 'RPG', 'Puzles', 'Puzles', 'Puzles'];
    const enero = Date.parse('2026-01-10T10:00:00.000Z');
    const base = generos.map((genre, index) => game({ id: index + 1, genres: [genre], enteredAt: { c: enero } }));

    const antes = evaluate(library({ c: base })).get('todos-los-palos-3');
    expect(antes?.level).toBe(1);
    expect(antes?.unlockedAt).toBe(0);

    // Un juego más del mismo género, sellado HOY: el logro sigue conseguido y sigue sin fecha propia.
    const despues = evaluate(library({
      c: [...base, game({ id: 99, genres: ['FPS'], enteredAt: { c: NOW } })],
    })).get('todos-los-palos-3');
    expect(despues?.level).toBe(1);
    expect(despues?.unlockedAt).toBe(0);
  });

  it('«Libro de cosechas» cuenta años buenos, no el mejor año', () => {
    const unAnoGrande = library({ c: Array.from({ length: 24 }, (_u, i) => game({ id: i + 1, years: [2025] })) });
    expect(evaluate(unAnoGrande).get('buena-cosecha-20')?.level).toBe(1); // el mejor año sí lo premia otra
    expect(evaluate(unAnoGrande).get('anadas-2')?.level).toBe(0);         // pero un solo año no es una cadena

    const dosAnos = library({
      c: [2024, 2025].flatMap((year, y) => [1, 2].map((n) => game({ id: y * 10 + n, years: [year] }))),
    });
    expect(evaluate(dosAnos).get('anadas-2')?.level).toBe(1);
  });

  it('«Otra oportunidad» mide UN juego, y fecha cada vuelta en su año', () => {
    const dosJuegosDeUnaVuelta = library({ c: [game({ id: 1, years: [2020] }), game({ id: 2, years: [2021] })] });
    expect(evaluate(dosJuegosDeUnaVuelta).get('otra-oportunidad-2')?.level).toBe(0);

    const tresVueltas = library({ c: [game({ id: 1, years: [2018, 2019, 2020] })] });
    const state = evaluate(tresVueltas).get('otra-oportunidad-3');
    expect(state?.value).toBe(3);
    expect(state?.level).toBe(1);
    // La tercera vuelta se fecha en SU año y no en el último: un logro conseguido no cambia de fecha después.
    expect(state?.unlockedAt).toBe(new Date(2020, 11, 31, 12).getTime());
  });

  it('«El peso de las horas» SUMA, y no cuenta juegos', () => {
    const games = library({
      c: [game({ id: 1, hours: 40 }), game({ id: 2, hours: 60 }), game({ id: 3, hours: null }), game({ id: 4 })],
    });
    const states = evaluate(games);
    expect(states.get('horas-totales-100')?.value).toBe(100);
    expect(states.get('horas-totales-100')?.level).toBe(1);
    // Y las dos escaleras de horas no dicen lo mismo: «El contador de horas» cuenta fichas rellenas.
    expect(states.get('horas-10')?.value).toBe(2);
  });

  it('«Obra completa» cuenta palabras, no reseñas ni caracteres', () => {
    const games = library({
      c: [game({ id: 1, review: 'Una reseña de cinco palabras' }), game({ id: 2, review: '   ' })],
    });
    expect(evaluate(games).get('obra-escrita-500')?.value).toBe(5);
  });

  it('«Ya sé cómo acaba esto» cuenta el motivo MÁS repetido, no todos los motivos', () => {
    const games = library({
      v: [
        game({ id: 1, reasons: ['Frustración'] }),
        game({ id: 2, reasons: ['Frustración'] }),
        game({ id: 3, reasons: ['frustración'] }),   // la misma etiqueta con otra caja
        game({ id: 4, reasons: ['Dificultad'] }),
        game({ id: 5, reasons: ['Repetitividad'] }),
      ],
    });
    // Cinco abandonos razonados, pero el motivo repetido son tres: la escalera no se llena con variedad.
    expect(evaluate(games).get('mania-5')?.value).toBe(3);
    expect(evaluate(games).get('abandonos-razonados-5')?.value).toBe(5);
  });

  it('«Diccionario de a bordo» junta virtudes y defectos y no cuenta dos veces la misma palabra', () => {
    const games = library({
      c: [
        game({ id: 1, strengths: ['Jugabilidad', 'Historia'], weaknesses: ['jugabilidad'] }),
        game({ id: 2, strengths: ['Historia'], weaknesses: ['Repetitividad'] }),
      ],
    });
    expect(evaluate(games).get('vocabulario-5')?.value).toBe(3);
  });

  it('«Cuánto tiempo sin verte» pide el HUECO, no la rejugada', () => {
    const seguido = library({ c: [game({ id: 1, years: [2020, 2021, 2022] })] });
    expect(evaluate(seguido).get('reencuentro-1')?.value).toBe(0);

    const conHueco = library({ c: [game({ id: 1, years: [2010, 2016] })] });
    const state = evaluate(conHueco).get('reencuentro-1');
    expect(state?.level).toBe(1);
    // Fechado en el año de la VUELTA, que es toda la precisión que da `years`.
    expect(state?.unlockedAt).toBe(new Date(2016, 11, 31, 12).getTime());
  });

  it('«Memoria de otro siglo» con un solo año da 0, que no es un «no sé»', () => {
    const unAno = library({ c: [game({ id: 1, years: [2026] })] });
    expect(evaluate(unAno).get('arqueologia-5')?.value).toBe(0);

    const cuartoDeSiglo = library({ c: [game({ id: 1, years: [2000] }), game({ id: 2, years: [2026] })] });
    const states = evaluate(cuartoDeSiglo);
    expect(states.get('arqueologia-25')?.value).toBe(26);
    expect(states.get('arqueologia-25')?.level).toBe(1);
    expect(states.get('arqueologia-30')?.level).toBe(0);
  });

  it('«Ni con un palo» NO cuenta los juegos sin puntuar', () => {
    // El mismo agujero que «Lo terminé por orgullo»: `resolveGrade` da 0 sin nota, y 0 es «menos de 30».
    const sinNota = library({ c: Array.from({ length: 5 }, (_u, i) => game({ id: i + 1 })) });
    expect(evaluate(sinNota).get('suspenso-1')?.value).toBe(0);

    const conNotaBaja = library({ c: [game({ id: 1, grade: 20 }), game({ id: 2, grade: 30 })] });
    // El 30 no entra: el listón es «menos de 30».
    expect(evaluate(conNotaBaja).get('suspenso-1')?.value).toBe(1);
  });

  it('«Dicho y hecho» exige la casilla Y la vuelta', () => {
    const games = library({
      c: [
        game({ id: 1, replayable: true, years: [2020, 2024] }),   // cumplido
        game({ id: 2, replayable: true, years: [2020] }),         // prometido y sin cumplir
        game({ id: 3, replayable: false, years: [2020, 2024] }),  // rejugado sin haberlo marcado
      ],
    });
    const states = evaluate(games);
    expect(states.get('palabra-1')?.value).toBe(1);
    expect(states.get('volvere-3')?.value).toBe(2);  // la casilla, que es lo que cuenta «Aquí volveré»
  });

  it('«El bibliotecario» cuenta las cuatro listas', () => {
    const games = library({ c: [game({ id: 1 })], v: [game({ id: 2 })], e: [game({ id: 3 })], p: [game({ id: 4 })] });
    expect(evaluate(games).get('biblioteca-25')?.value).toBe(4);
  });

  it('la píldora de la medalla dice «3×3» donde el escalón pide tres de cada', () => {
    expect(medalThreshold('marmota', 3, 5, false)).toBe('3×3');
    expect(medalThreshold('horas-totales', 1000, 9, false)).toBe('1000');  // magnitud: sin aspa
    expect(medalThreshold('biblioteca', 100, 8, false)).toBe('×100');      // contador: con aspa
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
    // Tres escaleras al TOPE, no a media altura: `obra-maestra` (hasta 5), `vida-entera` (hasta 20) y
    // `no-eres-tu` (hasta 50). El fixture es grande a propósito — es justo lo que mide este logro: llevar una
    // escalera hasta su último escalón, no coleccionar escalones sueltos de muchas.
    const games = library({
      c: [
        // Cinco cienes → `obra-maestra` completa. Y veinte juegos de más de 300 h → `vida-entera` completa.
        ...Array.from({ length: 5 }, (_u, i) => game({ id: i + 1, grade: 100, hours: 400 })),
        ...Array.from({ length: 15 }, (_u, i) => game({ id: 100 + i, hours: 320 })),
      ],
      // Cincuenta dejados con un 70 o más → `no-eres-tu` completa.
      v: Array.from({ length: 50 }, (_u, i) => game({ id: 200 + i, grade: 70 + (i % 20) })),
    });
    const states = evaluate(games);
    expect(states.get('obra-maestra-5')?.level, 'obra-maestra').toBe(1);
    expect(states.get('vida-entera-20')?.level, 'vida-entera').toBe(1);
    expect(states.get('no-eres-tu-50')?.level, 'no-eres-tu').toBe(1);
    expect(states.get('platino-3')?.value).toBe(3);
    expect(states.get('platino-3')?.level).toBe(1);
  });
});

describe('la fecha de cada escalón', () => {
  it('una racha fecha cada escalón cuando de verdad lo alcanzó', () => {
    // `at` viene indexado por VALOR —«cuándo llegué a siete semanas»— y los escalones son 2, 4, 8… Indexarlo por
    // la posición del escalón le colgaba a «Aún estás aquí IV» la fecha del segundo, años antes de conseguirlo.
    const semanas = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => Date.parse('2026-01-05T10:00:00Z') + n * 7 * DAY);
    const games = library({
      c: semanas.map((at, index) => game({ id: index + 1, enteredAt: { c: at } })),
    });
    const states = evaluate(games);
    // Ocho semanas seguidas: los escalones de 2, 4 y 8 caen, y cada uno con su propia semana.
    expect(states.get('constancia-2')?.unlockedAt).toBe(semanas[1]);
    expect(states.get('constancia-4')?.unlockedAt).toBe(semanas[3]);
    expect(states.get('constancia-8')?.unlockedAt).toBe(semanas[7]);
    expect(states.get('constancia-12')?.level).toBe(0);
  });

  it('lo que se cuenta se fecha con la unidad que hace el número', () => {
    const games = library({
      c: Array.from({ length: 12 }, (_u, i) => game({ id: i + 1, enteredAt: { c: Date.parse('2026-01-01') + i * DAY } })),
    });
    const states = evaluate(games);
    // El décimo juego es el que hace el diez, no el último de la lista.
    expect(states.get('completados-10')?.unlockedAt).toBe(Date.parse('2026-01-01') + 9 * DAY);
  });
});

describe('lo que pasa cuando una métrica no sabe medir', () => {
  it('hacia abajo, «no sé» NO es cero: una escalera descendente no se regala', () => {
    // `reaches` en descendente pregunta `valor <= umbral`, así que un cero de respaldo concedía «Exterminatus»
    // entero —cinco escalones excepcionales— y la marca de agua lo dejaba puesto para siempre.
    const rota = { ...library(), get p(): never { throw new Error('boom'); } } as unknown as TabData;
    const states = evaluateAchievements(
      { games: rota, social: NO_SOCIAL, device: NO_DEVICE, now: NOW },
      '',
    );
    const byId = new Map(states.map((state) => [state.id, state]));
    expect(byId.get('estanteria-cero-50')?.level).toBe(0);
    expect(byId.get('estanteria-cero-1')?.level).toBe(0);
    // Y hacia arriba sigue siendo cero, que es lo correcto ahí.
    expect(byId.get('completados-10')?.level).toBe(0);
  });
});

describe('la fecha que no ha llegado', () => {
  /**
   * UNA FECHA QUE NO HA LLEGADO NO SE PINTA. Lo que sale de `years` se fecha en el 31 de diciembre de su año
   * —toda la precisión que da el dato— así que un logro del año EN CURSO nacía con una fecha futura: la fila
   * decía «31 dic 2026» y el listado, que ordena por día de más reciente a más antiguo, la ponía por delante de
   * lo conseguido hoy. Las medallas recién ganadas salían debajo de otras que aún no tocan.
   *
   * `parseMirror` ya hacía esta poda al LEER el espejo, así que lo de menos es el arreglo: lo que faltaba era que
   * las dos caras dijeran lo mismo. El logro se queda; lo que se cae es el día.
   */
  it('un logro fechado en el futuro se queda, y sin fecha', () => {
    const esteAno = new Date(NOW).getFullYear();
    const games = library({ c: [game({ id: 1, years: [esteAno - 6, esteAno] })] });
    const states = evaluate(games);

    // Dos vueltas: el logro está.
    expect(states.get('rejugados-1')?.level).toBe(1);
    // Y su fecha sería el 31 de diciembre de este año, que no ha llegado: se pinta sin día.
    expect(states.get('rejugados-1')?.unlockedAt).toBe(0);

    // La misma escalera con la vuelta en un año PASADO sí se fecha, que es la mitad que no se toca.
    const pasado = library({ c: [game({ id: 1, years: [esteAno - 6, esteAno - 1] })] });
    expect(evaluate(pasado).get('rejugados-1')?.unlockedAt).toBe(new Date(esteAno - 1, 11, 31, 12).getTime());
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
    expect(full.points).toBe(7410);
    expect(full.level).toBe(46);
  });

  it('cada escalón suma una vez', () => {
    const uno = summarize([{ id: 'completados-400', level: 1, value: 400, next: null, unlockedAt: 0 }]);
    expect(uno.earned).toBe(1);
    expect(uno.points).toBe(25); // un raro, una vez
  });

  /**
   * EL DENOMINADOR ES LO ABIERTO, NO EL CATÁLOGO ENTERO. Un escalón que nadie ha visto todavía no es una tarea
   * pendiente, es una que aún no ha empezado; contarlo hacía que ampliar el catálogo le bajara el porcentaje de
   * golpe a todo el mundo sin que nadie hubiera perdido nada.
   */
  it('la fracción se mide contra lo que está abierto, no contra las 304', () => {
    const uno = summarize([{ id: 'completados-400', level: 1, value: 400, next: null, unlockedAt: 0 }]);
    // Muy por debajo del catálogo: de cada escalera solo está abierto lo alcanzado y el siguiente.
    expect(uno.total).toBeLessThan(SCORING_ACHIEVEMENTS.length / 2);

    // Y CRECE CUANDO LA COMUNIDAD ABRE. La frontera va en una escalera donde quien mira NO tiene nada —si fuera
    // por debajo de su propio progreso no cambiaría nada, porque uno abre con lo suyo—: de «Guerra de consolas»
    // solo estaría abierto el primer escalón, y con alguien que ha llegado al 12 se abren seis.
    const conApertura = summarize(
      [{ id: 'completados-400', level: 1, value: 400, next: null, unlockedAt: 0 }],
      { plataformas: 'plataformas-12' },
    );
    expect(conApertura.total).toBeGreaterThan(uno.total);
    // El numerador no se mueve: sigue teniendo un solo logro.
    expect(conApertura.earned).toBe(1);

    // LO CONSEGUIDO CUENTA SIEMPRE, esté abierto o no: un logro que tienes y no sale ni arriba ni abajo no existe.
    expect(uno.earned).toBe(1);
  });

  /** Con el catálogo entero conseguido, lo abierto ES el catálogo entero: la fracción cierra en 100 %. */
  it('completarlo todo sigue siendo el 100 % y el techo del nivel', () => {
    const todos = SCORING_ACHIEVEMENTS.map((def) => ({ id: def.id, level: 1, value: 0, next: null, unlockedAt: 0 }));
    const full = summarize(todos);
    expect(full.total).toBe(SCORING_ACHIEVEMENTS.length);
    expect(full.percent).toBe(100);
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

  /**
   * LAS DOS GUARDAS DE LA LISTA CONGELADA (`mirrorOrder.ts`). El orden de los bits ya NO se deriva del catálogo,
   * y eso es lo que permite insertar un umbral intermedio sin reescribir la vitrina de nadie. El precio es que
   * hay dos listas que pueden desincronizarse, y son estos dos tests los que lo impiden:
   *
   *  - un escalón publicable que no esté en la lista NO SE PUBLICARÍA, en silencio;
   *  - un `id` en la lista que ya no exista en el catálogo significa que alguien borró un logro en vez de
   *    retirarlo, que es justo lo que el §6.4 prohíbe.
   *
   * Cuando este test falle al añadir un logro nuevo, la solución es UNA: su `id` al final de `MIRROR_IDS`.
   */
  it('todo escalón publicable tiene su bit, y al final de la lista', () => {
    const publicables = ACHIEVEMENTS.filter((def) => def.family !== 'onboarding').map((def) => def.id);
    const enLaLista = new Set(MIRROR_ORDER);
    const olvidados = publicables.filter((id) => !enLaLista.has(id));
    expect(olvidados, `añade estos ids AL FINAL de MIRROR_IDS: ${olvidados.join(', ')}`).toEqual([]);
  });

  it('la lista no tiene bits huérfanos ni repetidos', () => {
    const existentes = new Set(ACHIEVEMENTS.map((def) => def.id));
    const huerfanos = MIRROR_ORDER.filter((id) => !existentes.has(id));
    expect(huerfanos, `estos ids ya no están en el catálogo: ${huerfanos.join(', ')}`).toEqual([]);
    expect(new Set(MIRROR_ORDER).size).toBe(MIRROR_ORDER.length);
    // Y ni un «primer paso»: no se publican jamás.
    expect(MIRROR_ORDER.some((id) => id.startsWith('paso-'))).toBe(false);
  });

  /**
   * EL ORDEN, CLAVADO. Es lo único que de verdad protege las vitrinas ya publicadas: cualquier reordenación —o
   * una inserción a mitad de lista— cambia lo que significa cada bit, y ningún otro test lo notaría. Si este
   * falla y no has añadido nada al final, lo que has hecho rompe los espejos de todo el mundo.
   */
  it('los primeros bits son los que eran, y la lista tiene la longitud que tenía', () => {
    expect(MIRROR_ORDER.length).toBe(404);
    expect(MIRROR_ORDER.slice(0, 4)).toEqual([
      'completados-10', 'completados-25', 'completados-50', 'completados-75',
    ]);
    expect(MIRROR_ORDER[MIRROR_ORDER.length - 1]).toBe('vocabulario-75');
  });

  /**
   * COMPATIBILIDAD HACIA ATRÁS DE LA AMPLIACIÓN. Las catorce escaleras nuevas se declaran a MITAD de `LADDERS`
   * —al final de su familia, como manda la regla 2— y eso corre la posición de todo lo que va detrás en el
   * catálogo. Que no pase nada depende de dos decisiones que hay que poder romper con un test delante:
   *
   *  - el ORDEN DE LOS BITS no sale de `LADDERS`, sale de `mirrorOrder.ts`, donde los nuevos van AL FINAL;
   *  - la MARCA DE AGUA se guarda por `id` (`completados-10:1`) y no por índice.
   *
   * Sin la primera, cada espejo ya publicado pasaría a decir otra cosa. Sin la segunda, la marca de agua de todo
   * el mundo se desalinearía y le retiraría —o le regalaría— logros en silencio.
   */
  it('los bits de antes de la ampliación siguen donde estaban', () => {
    expect(MIRROR_ORDER.indexOf('completados-10')).toBe(0);
    expect(MIRROR_ORDER.indexOf('buena-cosecha-30')).toBe(305);
    expect(MIRROR_ORDER.indexOf('marmota-2')).toBe(306);
  });

  it('una marca de agua de antes de la ampliación no se desalinea', () => {
    // Biblioteca VACÍA: lo único que puede sostener estos logros es la marca de agua.
    const states = evaluate(library(), 'completados-10:1,buena-cosecha-5:1,tesis-1:1');
    expect(states.get('completados-10')?.level).toBe(1);
    expect(states.get('buena-cosecha-5')?.level).toBe(1);
    expect(states.get('tesis-1')?.level).toBe(1);
    // Y no ha regalado ni un escalón de los nuevos, que es la otra mitad del mismo riesgo.
    expect(states.get('marmota-2')?.level).toBe(0);
    expect(states.get('biblioteca-25')?.level).toBe(0);
    expect(states.get('arqueologia-5')?.level).toBe(0);
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

  /**
   * LO QUE PUBLICA ESTA VERSIÓN LO SIGUE LEYENDO LA ANTERIOR, y esto es lo único que de verdad protege a quien
   * no ha actualizado: el espejo viaja al directorio social y lo lee el cliente que sea.
   *
   * Se comprueba haciendo de LECTOR VIEJO a mano —decodificando el bitmap y mirando solo los 306 bits que
   * conocía la versión anterior— porque `parseMirror` importa el orden actual y no se le puede pasar otro. Las
   * dos mitades del contrato quedan fijadas: los bits de antes significan lo mismo, y la cola de fechas de un
   * escalón NUEVO cae en un índice que el lector viejo no tiene y que su propio código ignora (`if (!item)`).
   */
  it('un espejo de esta versión lo lee sin romperse un cliente de la anterior', () => {
    const BITS_DE_ANTES = 306;
    const viejos = ['completados-50', 'criterio-100', 'buena-cosecha-30'];
    const nuevos = ['marmota-3', 'vocabulario-75', 'palabra-40'];
    const estados = [...viejos, ...nuevos].map((id) => ({
      id, level: 1, value: 0, next: null, unlockedAt: Date.parse('2026-03-12T10:00:00.000Z'),
    }));
    const list = packAchievements(estados);

    // El lector viejo: base64url → bytes → los 306 primeros bits, con SU lista de ids.
    const [, encoded] = list.split('~')[0].split(':');
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
    const suLista = MIRROR_ORDER.slice(0, BITS_DE_ANTES);
    const loQueVe = suLista.filter((_id, index) => {
      const byte = bytes[index >> 3];
      return byte !== undefined && Boolean(byte & (0x80 >> (index & 7)));
    });

    // Ve los suyos, exactamente, y ni uno de los nuevos —que están fuera de su lista—.
    expect(loQueVe.sort()).toEqual([...viejos].sort());

    // Y la cola de fechas de un escalón nuevo apunta a un índice que él no tiene: lo salta, no lo confunde con
    // otro logro. Los índices de la cola van en base 36.
    const indicesDeLaCola = (list.split('~')[1] || '').split(',')
      .map((entrada) => parseInt(entrada.replace('!', '').split('.')[0], 36));
    expect(indicesDeLaCola.some((indice) => indice >= BITS_DE_ANTES), 'la siembra debería incluir un escalón nuevo').toBe(true);
    expect(indicesDeLaCola.every((indice) => Number.isFinite(indice))).toBe(true);
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

  it('lo conseguido esta mañana llega CON su fecha', () => {
    // El día se codifica en el calendario local del dueño y se reconstruye a mediodía UTC: sin margen, un logro
    // de esta mañana se leía como futuro, se quedaba sin fecha y por tanto fuera del feed, que se salta lo que no
    // puede situar.
    const manana = Date.parse('2026-09-06T07:30:00.000Z');
    const list = packAchievements([
      { id: 'completados-10', level: 1, value: 10, next: null, unlockedAt: manana },
    ]);
    const [item] = parseMirror(list, manana);
    expect(item.unlockedAt).toBeGreaterThan(0);
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

  /**
   * ⚑ SIN SUELO DE MUESTRA. Lo hubo —veinte espejos, «con siete personas el 14 % es una persona»— y describía
   * bien la cifra sacando la conclusión contraria: con dos personas el porcentaje es 0, 50 o 100, y eso es lo
   * que hay. Lo que hacía el suelo era apagar la función durante los primeros meses de una comunidad pequeña.
   * Lo que sostiene la honestidad de la cifra es el DENOMINADOR, que la pantalla pinta siempre.
   */
  it('mide desde el primer espejo, sin esperar a tener veinte', () => {
    const dos = measureRarity([mirrorOf(['completados-10']), mirrorOf(['plataformas-3'])]);
    expect(dos?.sample).toBe(2);
    expect(dos?.percent.get('completados-10')).toBe(50);
    expect(dos?.percent.get('plataformas-3')).toBe(50);
    // Y con uno solo: el 100 % de una persona, que es exactamente lo que dice su denominador.
    expect(measureRarity([mirrorOf(['completados-10'])])?.percent.get('completados-10')).toBe(100);
  });

  /** Lo único que no se puede medir es la nada: sin un solo espejo, `null` (y no «el 0 % de cero personas»). */
  it('sin ningún espejo no hay medición', () => {
    expect(measureRarity([])).toBeNull();
    expect(measureRarity(['', ''])).toBeNull();
    // Ni con un `minSample` a cero, que dividiría por cero: el suelo real es un espejo.
    expect(measureRarity([], 0)).toBeNull();
  });

  it('con una muestra grande cuenta cuántos lo tienen', () => {
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

/**
 * EL SUELO DE LAS FECHAS. Es lo que permite fechar lo conseguido «antes de que hubiera con qué fecharlo» sin
 * inventarse nada: ningún logro puede ser anterior al primer juego que entró en la biblioteca.
 */
describe('el día en que empieza la biblioteca', () => {
  it('es el sello de entrada más antiguo, mire la lista que mire', () => {
    const games = library({
      c: [game({ id: 1, enteredAt: { c: NOW } })],
      p: [game({ id: 2, enteredAt: { p: NOW - 5000 } })],
      v: [game({ id: 3, enteredAt: { v: NOW - 200 } })],
    });
    expect(libraryStart(games)).toBe(NOW - 5000);
  });

  it('sin un solo sello es cero, y entonces no hay suelo que pintar', () => {
    expect(libraryStart(library({ c: [game({ id: 1 })] }))).toBe(0);
    expect(libraryStart(library())).toBe(0);
  });
});
