import { describe, expect, it } from 'vitest';
import { normalizeHours } from '../../src/core/utils/normalize';
import { normalizeData } from '../../src/model/repository/localRepository';
import { mergeImportedIntoGame } from '../../src/core/import/staging';
import type { GameItem, TabData } from '../../src/model/types/game';
import type { ImportedGame } from '../../src/model/types/import';

/**
 * Un 0 en las horas es la casilla SIN RELLENAR, no una afirmación ("lo jugué cero horas"). Guardarlo como dato
 * escondía el hueco detrás de un valor falso: el detalle pintaba "0 horas" y las medias de las estadísticas
 * contaban un juego que nadie había cronometrado. La regla vive en `normalizeHours` y la aplican todas las
 * puertas por las que entran horas: la lectura del gist, el formulario y la bandeja de importados.
 */
function game(extra: Partial<GameItem> & { id: number }): GameItem {
  return { _ts: 1000, name: `Game ${extra.id}`, platforms: ['Steam'], genres: ['RPG'], steamDeck: false, review: '', ...extra };
}

function tabData(c: GameItem[]): TabData {
  return { c, v: [], e: [], p: [], deleted: [], updatedAt: 0 };
}

describe('normalizeHours', () => {
  it('conserva las horas anotadas', () => {
    expect(normalizeHours(12.5)).toBe(12.5);
    expect(normalizeHours('0,5'.replace(',', '.'))).toBe(0.5);
  });

  it('devuelve null para el hueco en cualquiera de sus formas', () => {
    expect(normalizeHours(0)).toBeNull();
    expect(normalizeHours(null)).toBeNull();
    expect(normalizeHours(undefined)).toBeNull();
    expect(normalizeHours('')).toBeNull();
    expect(normalizeHours('nada')).toBeNull();
    expect(normalizeHours(-3)).toBeNull();
  });
});

describe('horas a 0 ya guardadas', () => {
  it('se leen como «sin horas» (limpia los juegos que lo llevaran del formato viejo)', () => {
    const out = normalizeData(tabData([game({ id: 1, hours: 0 }), game({ id: 2, hours: 40 })]));

    expect(out.c[0].hours).toBeNull();
    expect(out.c[1].hours).toBe(40);
  });
});

describe('importación', () => {
  const imported: ImportedGame = {
    id: 1,
    name: 'Halo',
    platforms: [],
    genres: [],
    sources: ['playnite'],
    hours: 5,
    grade: null,
    importedAt: 0,
  };

  it('las horas del importado rellenan el 0 del juego que ya está en las listas', () => {
    expect(mergeImportedIntoGame(game({ id: 1, hours: 0 }), imported).hours).toBe(5);
  });

  it('pero no pisan unas horas de verdad', () => {
    expect(mergeImportedIntoGame(game({ id: 1, hours: 12 }), imported).hours).toBe(12);
  });
});
