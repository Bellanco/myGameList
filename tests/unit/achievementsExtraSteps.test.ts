// §6.4bis — AMPLIAR EL CATÁLOGO SIN DESPLEGAR: un umbral nuevo de una escalera que ya existe, decidido en el
// panel, tiene que ser un logro COMPLETO —se evalúa, cuenta en la fracción y viaja en el espejo— y no puede
// desplazar ni un bit de lo ya publicado.
//
// Se prueba el camino entero y no las piezas por separado porque el riesgo está justo en las juntas: el catálogo
// se muta en su sitio, así que lo que hay que fijar es que TODO lo que lo lee vea lo mismo después.
import { afterEach, describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS_BY_ID,
  ACHIEVEMENTS_BY_LADDER,
  SCORING_ACHIEVEMENTS,
  applyExtraSteps,
  catalogEpoch,
} from '../../src/core/achievements/catalog';
import { MIRROR_ORDER, packAchievements, parseMirror } from '../../src/core/achievements/pack';
import { summarize } from '../../src/core/achievements/summary';
import { evaluateAchievements } from '../../src/core/achievements/evaluate';
import type { AchievementState } from '../../src/core/achievements/types';
import type { TabData } from '../../src/model/types/game';

const NOW = Date.parse('2026-09-09T10:00:00.000Z');

/** Un umbral que no está declarado en el código: «Créditos finales» declara 100 y 150, no 125. */
const EXTRA = { completados: [125] } as const;

const estado = (id: string, unlockedAt = 0): AchievementState =>
  ({ id, level: 1, value: 0, next: null, unlockedAt });

/** Biblioteca con N juegos terminados, sellados hoy (el sello es lo que fecha el logro). */
function biblioteca(cuantos: number): TabData {
  return {
    c: Array.from({ length: cuantos }, (_unused, index) => ({
      id: index + 1,
      name: `Juego ${index + 1}`,
      _ts: NOW,
      enteredAt: { c: NOW },
      platforms: [],
      genres: [],
      steamDeck: false,
      review: '',
    })),
    v: [], e: [], p: [], deleted: [], updatedAt: NOW,
  } as unknown as TabData;
}

// El catálogo es de módulo: cada test lo deja como estaba para no contagiar a los demás.
afterEach(() => applyExtraSteps());

describe('el catálogo se amplía con los umbrales del panel', () => {
  it('el escalón entra en su sitio, con su id, su romano y su grado', () => {
    applyExtraSteps(EXTRA);

    const def = ACHIEVEMENTS_BY_ID.get('completados-125');
    expect(def, 'el escalón nuevo existe en el catálogo').toBeTruthy();
    expect(def?.step).toBe(125);
    // Sexto escalón de la escalera (10, 25, 50, 75, 100, 125): el romano y el grado salen de la POSICIÓN.
    expect(def?.grade).toBe(6);
    expect(def?.labels.name).toBe('Créditos finales VI');
    // Y al de encima le corre el romano, que es el único efecto que insertar un escalón no puede evitar.
    expect(ACHIEVEMENTS_BY_ID.get('completados-150')?.labels.name).toBe('Créditos finales VII');
    // La escalera lo lista en orden y puntúa como los demás.
    expect((ACHIEVEMENTS_BY_LADDER.get('completados') || []).map((entry) => entry.step))
      .toEqual([10, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500]);
    expect(SCORING_ACHIEVEMENTS.some((entry) => entry.id === 'completados-125')).toBe(true);
  });

  it('vuelve al catálogo del código al quitarlo, y la seña de reconstrucción avanza', () => {
    const antes = catalogEpoch();
    applyExtraSteps(EXTRA);
    expect(catalogEpoch()).toBeGreaterThan(antes);

    applyExtraSteps();
    expect(ACHIEVEMENTS_BY_ID.has('completados-125')).toBe(false);
    expect(ACHIEVEMENTS_BY_ID.get('completados-150')?.labels.name).toBe('Créditos finales VI');
  });

  it('un umbral ya declarado en el código no se duplica, y lo raro se ignora', () => {
    applyExtraSteps({ completados: [50, 0, -3, 1.5, 50], escalera_inventada: [10] });

    const escalones = (ACHIEVEMENTS_BY_LADDER.get('completados') || []).map((entry) => entry.step);
    expect(escalones.filter((step) => step === 50)).toHaveLength(1);
    expect(escalones).toEqual([10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500]);
  });

  it('el evaluador lo concede, y la fracción lo cuenta', () => {
    applyExtraSteps(EXTRA);

    const states = evaluateAchievements(
      {
        games: biblioteca(130),
        social: { friends: 0, postWeeks: 0, profileCreatedAt: 0 },
        device: { hasSync: false, rouletteUsedAt: 0, themeChanged: false },
        now: NOW,
      },
      '',
    );
    const nuevo = states.find((state) => state.id === 'completados-125');
    expect(nuevo?.level, '130 terminados pasan el umbral de 125').toBe(1);
    // Y cuenta en las dos cifras: numerador y denominador, como cualquier otro escalón.
    const conExtra = summarize(states);
    applyExtraSteps();
    const sinExtra = summarize(states.filter((state) => state.id !== 'completados-125'));
    expect(conExtra.earned).toBe(sinExtra.earned + 1);
    expect(conExtra.total).toBe(sinExtra.total + 1);
  });
});

describe('y viaja en el espejo por su id, sin tocar ni un bit', () => {
  it('se publica y se lee, con su fecha', () => {
    applyExtraSteps(EXTRA);
    const dia = Date.parse('2026-08-31T12:00:00.000Z');

    const list = packAchievements([estado('completados-50', dia), estado('completados-125', dia)]);
    // El escalón nuevo NO tiene bit —no está en el orden congelado— y va por su `id` en la cola.
    expect(MIRROR_ORDER).not.toContain('completados-125');
    expect(list).toContain('~#completados-125.');

    const back = parseMirror(list, NOW);
    expect(back.map((item) => item.id).sort()).toEqual(['completados-125', 'completados-50']);
    expect(back.find((item) => item.id === 'completados-125')?.unlockedAt).toBe(dia);
  });

  /**
   * EL BITMAP SIGUE DICIENDO LO MISMO, que es la línea que hace todo esto seguro: la cabecera y los bits de un
   * espejo con un escalón de configuración son idénticos a los de uno sin él.
   */
  it('el mapa de bits de lo publicado no se mueve', () => {
    const soloCodigo = packAchievements([estado('completados-50')]);
    applyExtraSteps(EXTRA);
    const conExtra = packAchievements([estado('completados-50'), estado('completados-125')]);

    expect(conExtra.split('~')[0]).toBe(soloCodigo.split('~')[0]);
  });

  /**
   * UN CLIENTE QUE NO CONOCE EL UMBRAL LO IGNORA EN SILENCIO (§6.4), y es lo que hace que esto no rompa a nadie:
   * el que no ha leído la configuración —o la leyó cuando ese umbral ya no estaba— lee el resto del espejo igual.
   */
  it('quien no tiene ese escalón en su catálogo lee el resto igual', () => {
    applyExtraSteps(EXTRA);
    const list = packAchievements([estado('completados-50'), estado('completados-125')]);

    applyExtraSteps(); // el catálogo del código, sin el umbral del panel
    const back = parseMirror(list, NOW);
    expect(back.map((item) => item.id)).toEqual(['completados-50']);
  });

  /** Los primeros pasos siguen sin salir del aparato (§5.3): no tienen bit, y la puerta nueva no los publica. */
  it('los primeros pasos no se publican por la puerta nueva', () => {
    const list = packAchievements([estado('paso-primer-juego-1'), estado('completados-50')]);
    expect(list).not.toContain('#paso-');
    expect(parseMirror(list, NOW).map((item) => item.id)).toEqual(['completados-50']);
  });
});
