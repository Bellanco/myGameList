import { describe, expect, it } from 'vitest';
import { normalizeData } from '../../src/model/repository/localRepository';
import type { GameItem, TabData } from '../../src/model/types/game';

// `_ts` es a la vez reloj del merge CRDT y "fecha de modificación" que ve el usuario (la pestaña Reseñas la
// muestra, y el canal social la publica). `forceTimestamp: true` sellaba TODA la biblioteca con la fecha del
// import, así que una importación borraba la fecha de los 200 juegos de golpe. `bumpChangedAgainst` consigue lo
// que la importación necesitaba —que lo importado gane el merge— tocando solo lo que de verdad cambia.

const VIEJO = Date.parse('2026-05-13T07:19:00.000Z');

function game(input: Partial<GameItem> & { id: number; name: string }): GameItem {
  return {
    platforms: [], genres: [], steamDeck: false, review: '', score: 0, years: [],
    strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0,
    _ts: VIEJO,
    ...input,
  } as GameItem;
}

function lists(partial: Partial<TabData>): TabData {
  return { c: [], v: [], e: [], p: [], deleted: [], updatedAt: VIEJO, ...partial };
}

describe('normalizeData — bumpChangedAgainst', () => {
  it('conserva el `_ts` de los juegos que llegan idénticos', () => {
    const actual = lists({ c: [game({ id: 1, name: 'Celeste', review: 'genial', score: 5 })] });
    const importado = lists({ c: [game({ id: 1, name: 'Celeste', review: 'genial', score: 5 })] });

    const out = normalizeData(importado, { bumpChangedAgainst: actual });

    expect(out.c[0]._ts).toBe(VIEJO);
  });

  it('estrena `_ts` solo en los juegos con contenido distinto', () => {
    const antes = Date.now();
    const actual = lists({
      c: [
        game({ id: 1, name: 'Celeste', review: 'genial', score: 5 }),
        game({ id: 2, name: 'Hades', review: 'muy bueno', score: 4 }),
      ],
    });
    const importado = lists({
      c: [
        game({ id: 1, name: 'Celeste', review: 'genial', score: 5 }), // idéntico
        game({ id: 2, name: 'Hades', review: 'obra maestra', score: 5 }), // reseña cambiada
      ],
    });

    const out = normalizeData(importado, { bumpChangedAgainst: actual });

    expect(out.c[0]._ts).toBe(VIEJO);
    expect(out.c[1]._ts).toBeGreaterThanOrEqual(antes);
  });

  it('un juego que no estaba en la referencia estrena `_ts` (gana el merge)', () => {
    const antes = Date.now();
    const out = normalizeData(
      lists({ c: [game({ id: 7, name: 'Nuevo', review: 'x', _ts: VIEJO })] }),
      { bumpChangedAgainst: lists({}) },
    );

    expect(out.c[0]._ts).toBeGreaterThanOrEqual(antes);
  });

  it('cambiar de pestaña cuenta como cambio: el merge tiene que ver el movimiento', () => {
    const antes = Date.now();
    const actual = lists({ c: [game({ id: 1, name: 'Celeste', review: 'genial' })] });
    const importado = lists({ v: [game({ id: 1, name: 'Celeste', review: 'genial' })] });

    const out = normalizeData(importado, { bumpChangedAgainst: actual });

    expect(out.v[0]._ts).toBeGreaterThanOrEqual(antes);
  });

  it('sin opciones conserva los `_ts` existentes y `forceTimestamp` los sella todos', () => {
    const antes = Date.now();
    const entrada = lists({ c: [game({ id: 1, name: 'Celeste' }), game({ id: 2, name: 'Hades' })] });

    expect(normalizeData(entrada).c.map((g) => g._ts)).toEqual([VIEJO, VIEJO]);

    const forzado = normalizeData(entrada, { forceTimestamp: true });
    forzado.c.forEach((g) => expect(g._ts).toBeGreaterThanOrEqual(antes));
  });

  it('`_ts` ausente o inválido sigue recibiendo la fecha de normalización', () => {
    const antes = Date.now();
    const out = normalizeData(
      lists({ c: [{ id: 1, name: 'Sin ts' } as unknown as GameItem] }),
      { bumpChangedAgainst: lists({}) },
    );

    expect(out.c[0]._ts).toBeGreaterThanOrEqual(antes);
  });
});
