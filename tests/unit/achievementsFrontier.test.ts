import { describe, expect, it } from 'vitest';
import { frontierKey, mergeFrontiers, ownFrontier } from '../../src/core/achievements/frontier';
import { summarize, summarizeMirror } from '../../src/core/achievements/summary';
import { ACHIEVEMENTS_BY_LADDER, SCORING_ACHIEVEMENTS } from '../../src/core/achievements/catalog';
import { visibleIds } from '../../src/core/achievements/visibility';
import type { AchievementState } from '../../src/core/achievements/types';

const earned = (ids: readonly string[]): Map<string, AchievementState> =>
  new Map(ids.map((id) => [id, { id, level: 1, value: 0, next: null, unlockedAt: 0 }]));

/** Los tres primeros escalones de una escalera, por sus `id`, para no clavar umbrales en el test. */
const steps = (ladder: string): readonly string[] =>
  (ACHIEVEMENTS_BY_LADDER.get(ladder) || []).map((def) => def.id);

describe('la frontera comunitaria que publica el cliente', () => {
  it('es el escalón CONSEGUIDO más alto de cada escalera, y nada de las vacías', () => {
    const completados = steps('completados');
    const frontier = ownFrontier(earned([completados[0], completados[2]]));

    expect(frontier.completados).toBe(completados[2]);
    // Una escalera sin nada conseguido no entra: «no se sabe de nadie» no es «alguien llegó al primero».
    expect(frontier.plataformas).toBeUndefined();
  });

  /**
   * NO PUBLICA LA ZANAHORIA. `openThrough` ya añade el escalón siguiente al aplicar el mapa; si aquí se
   * publicara el que se OFRECE, cada publicación adelantaría dos escalones y la escalera se abriría por delante
   * de donde ha llegado alguien.
   */
  it('publica lo alcanzado, no lo que se ofrece', () => {
    const completados = steps('completados');
    expect(ownFrontier(earned([completados[0]])).completados).toBe(completados[0]);
  });

  it('la unión se queda con el más lejano y nunca retrocede', () => {
    const completados = steps('completados');
    const [primero, , tercero] = completados;

    expect(mergeFrontiers({ completados: tercero }, { completados: primero }).completados).toBe(tercero);
    expect(mergeFrontiers({ completados: primero }, { completados: tercero }).completados).toBe(tercero);
    // Y no se pierde lo que solo trae uno de los dos lados.
    expect(mergeFrontiers({ plataformas: steps('plataformas')[0] }, { completados: primero })).toEqual({
      plataformas: steps('plataformas')[0],
      completados: primero,
    });
  });

  it('un id que este catálogo no conoce no abre nada, y no tapa al que sí', () => {
    const primero = steps('completados')[0];
    // Del lado propio se ignora: puede venir de una versión posterior, y el lado seguro es no abrir.
    expect(mergeFrontiers({}, { completados: 'completados-inventado' })).toEqual({});
    expect(mergeFrontiers({}, { escalera_inventada: primero })).toEqual({});
    // Del lado publicado gana el propio, que sí se puede situar (es lo que hace `openThrough` al aplicarlo).
    expect(mergeFrontiers({ completados: 'completados-inventado' }, { completados: primero }).completados)
      .toBe(primero);
  });

  it('la huella no depende del orden de inserción', () => {
    const a = { completados: 'completados-10', plataformas: 'plataformas-5' };
    const b = { plataformas: 'plataformas-5', completados: 'completados-10' };
    expect(frontierKey(a)).toBe(frontierKey(b));
    expect(frontierKey({})).toBe('');
  });
});

/**
 * EL DENOMINADOR ES COMÚN, y esto es lo que había que arreglar: la regla («en cuanto alguien ve un escalón, queda
 * abierto para todos») estaba escrita y aplicada, pero el mapa que la sostiene solo lo rellenaba el panel a mano,
 * así que cada cliente abría con su propio progreso — quien llevaba 196 medallas contaba sobre 249 y quien
 * empezaba, sobre 55, con el mismo catálogo delante.
 */
describe('todos cuentan sobre el mismo catálogo', () => {
  it('publicada la frontera de quien va en cabeza, el que empieza tiene su mismo denominador', () => {
    const veterano = [
      ...steps('completados').slice(0, 6),
      ...steps('plataformas').slice(0, 4),
      ...steps('generos').slice(0, 3),
    ];
    const states = [...earned(veterano).values()];

    // Antes de publicar: dos cifras distintas para el mismo catálogo.
    expect(summarize(states).total).toBeGreaterThan(summarize([]).total);

    // El veterano publica hasta dónde ha llegado…
    const frontier = mergeFrontiers({}, ownFrontier(earned(veterano)));

    // …y a partir de ahí los dos miden lo mismo: lo que cambia es el numerador, no el denominador.
    expect(summarize([], frontier).total).toBe(summarize(states, frontier).total);
    expect(summarize([], frontier).earned).toBe(0);
    expect(summarize(states, frontier).earned).toBe(veterano.length);
  });

  /**
   * Y LA FICHA DE UNA AMISTAD CUENTA IGUAL. Su cifra sale del espejo (`summarizeMirror`), que no recibía la
   * frontera: la ficha de quien empieza decía «0 de 55» mientras su dueño leía «0 de 249» en su aparato.
   */
  it('la cifra de un espejo ajeno es la que esa persona ve en su pantalla', () => {
    const frontier = mergeFrontiers({}, ownFrontier(earned(steps('completados').slice(0, 6))));
    const suyos = new Map([[steps('completados')[0], 1]]);

    const desdeElEspejo = summarizeMirror(suyos, frontier);
    const desdeSuAparato = summarize([...earned([steps('completados')[0]]).values()], frontier);

    expect(desdeElEspejo.total).toBe(desdeSuAparato.total);
    expect(desdeElEspejo.earned).toBe(desdeSuAparato.earned);
    expect(desdeElEspejo.percent).toBe(desdeSuAparato.percent);
  });

  /** Un escalón nuevo alcanzado por alguien sube el denominador de TODOS, que es la promesa del §6.7. */
  it('cuando alguien abre un escalón, la cuenta sube para todo el mundo', () => {
    const seis = steps('completados').slice(0, 6);
    const antes = mergeFrontiers({}, ownFrontier(earned(seis)));
    const despues = mergeFrontiers(antes, ownFrontier(earned([...seis, steps('completados')[6]])));

    expect(summarize([], despues).total).toBe(summarize([], antes).total + 1);
  });
});

/**
 * LO CERRADO NO EXISTE TODAVÍA: ni se pinta ni cuenta. La regla estaba aplicada en el listado y en la fracción,
 * pero los LOGROS GLOBALES del hub recorrían el catálogo entero y pintaban con su «0 %» los escalones a los que
 * no ha llegado nadie — una lista de 402 filas bajo una cabecera que decía «de 249».
 */
describe('lo que está cerrado para todos no sale en ninguna lista', () => {
  it('enseña lo abierto y su zanahoria, y nada por encima', () => {
    const completados = steps('completados');
    const frontier = mergeFrontiers({}, ownFrontier(earned(completados.slice(0, 3))));
    const visible = visibleIds(ACHIEVEMENTS_BY_LADDER.values(), frontier, () => false);

    // Alcanzado por alguien: se ve. Y el siguiente, que es su reto.
    expect(visible.has(completados[2])).toBe(true);
    expect(visible.has(completados[3])).toBe(true);
    // De ahí para arriba no lo ve nadie, ni quien va en cabeza.
    expect(visible.has(completados[4])).toBe(false);
  });

  it('lo que has conseguido se ve siempre, esté abierto o no', () => {
    const completados = steps('completados');
    const mio = completados[5];
    const visible = visibleIds(ACHIEVEMENTS_BY_LADDER.values(), {}, (def) => def.id === mio);

    expect(visible.has(mio)).toBe(true);
    // Y tú también eres «alguien»: tenerlo abre el siguiente.
    expect(visible.has(completados[6])).toBe(true);
    expect(visible.has(completados[7])).toBe(false);
  });

  /** La lista y el denominador cuentan lo mismo: es lo que separaba a la cabecera de los globales de su lista. */
  it('lo visible sin conseguir nada es exactamente lo que cuenta el denominador', () => {
    const frontier = mergeFrontiers({}, ownFrontier(earned([
      ...steps('completados').slice(0, 6),
      ...steps('plataformas').slice(0, 4),
    ])));
    const visible = visibleIds(ACHIEVEMENTS_BY_LADDER.values(), frontier, () => false);
    const puntuables = SCORING_ACHIEVEMENTS.filter((def) => visible.has(def.id));

    expect(puntuables.length).toBe(summarize([], frontier).total);
  });
});
