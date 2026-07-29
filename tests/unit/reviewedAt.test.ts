import { describe, expect, it } from 'vitest';
import { leanTabData } from '../../src/model/repository/socialProjection';
import { normalizeData } from '../../src/model/repository/localRepository';
import { resolveReviewedAt } from '../../src/core/utils/reviewDate';
import type { GameItem, TabData } from '../../src/model/types/game';

// `reviewedAt` es la fecha de la RESEÑA, separada del reloj del merge (`_ts`). Nace porque `_ts` lo mueve
// cualquier edición del juego y lo sellaba en bloque la importación de datos, así que no servía como fecha de la
// reseña — que es la que publica el canal social y la que muestran el feed y la pestaña Reseñas.

const RESENA = Date.parse('2026-05-12T11:59:00.000Z');
const OTRO_DIA = Date.parse('2026-07-26T09:00:00.000Z');

function game(input: Partial<GameItem> & { id: number; name: string }): GameItem {
  return {
    platforms: ['PC'], genres: ['Acción'], steamDeck: false, review: '', score: 0, years: [],
    strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0,
    _ts: OTRO_DIA,
    ...input,
  } as GameItem;
}

function lists(partial: Partial<TabData>): TabData {
  return { c: [], v: [], e: [], p: [], deleted: [], updatedAt: OTRO_DIA, ...partial };
}

describe('reviewedAt — fecha propia de la reseña', () => {
  it('sobrevive al round-trip del gist de juegos (serialización magra)', () => {
    // Si `leanGameItem` no lo persistiera, el campo se perdería en el primer sync — el mismo fallo que ya tuvo
    // `listedAt` en su día.
    const out = leanTabData(lists({ c: [game({ id: 1, name: 'Celeste', review: 'genial', reviewedAt: RESENA })] }));

    expect(out.c[0].reviewedAt).toBe(RESENA);
  });

  it('lo conserva `normalizeData`, y `forceTimestamp` NO lo toca', () => {
    const entrada = lists({ c: [game({ id: 1, name: 'Celeste', review: 'genial', reviewedAt: RESENA })] });

    expect(normalizeData(entrada).c[0].reviewedAt).toBe(RESENA);
    // `forceTimestamp` sella `_ts` (reloj del merge) pero la fecha de la reseña es un dato del usuario.
    const forzado = normalizeData(entrada, { forceTimestamp: true });
    expect(forzado.c[0].reviewedAt).toBe(RESENA);
    expect(forzado.c[0]._ts).not.toBe(OTRO_DIA);
  });

  it('no cuenta como cambio de contenido: importar lo mismo con otra fecha de reseña no mueve `_ts`', () => {
    const actual = lists({ c: [game({ id: 1, name: 'Celeste', review: 'genial', reviewedAt: RESENA, _ts: OTRO_DIA })] });
    const importado = lists({ c: [game({ id: 1, name: 'Celeste', review: 'genial', reviewedAt: 123, _ts: OTRO_DIA })] });

    expect(normalizeData(importado, { bumpChangedAgainst: actual }).c[0]._ts).toBe(OTRO_DIA);
  });

  it('un valor inválido o ausente queda sin definir (los lectores caen a `_ts`)', () => {
    const out = normalizeData(
      lists({
        c: [
          game({ id: 1, name: 'Sin fecha', review: 'x' }),
          { ...game({ id: 2, name: 'Fecha basura', review: 'x' }), reviewedAt: -5 } as GameItem,
        ],
      }),
    );

    expect(out.c[0].reviewedAt).toBeUndefined();
    expect(out.c[1].reviewedAt).toBeUndefined();
  });

  it('compatibilidad: un juego de un cliente antiguo (sin el campo) no rompe nada', () => {
    const antiguo = { id: 1, name: 'Celeste', _ts: OTRO_DIA, review: 'genial', platforms: ['PC'], genres: ['Acción'] };
    const out = normalizeData(lists({ c: [antiguo as unknown as GameItem] }));

    expect(out.c[0].reviewedAt).toBeUndefined();
    expect(out.c[0]._ts).toBe(OTRO_DIA);
    // Y al escribir el gist tampoco aparece la clave: no ensucia el formato para los clientes antiguos.
    expect(Object.keys(leanTabData(out).c[0])).not.toContain('reviewedAt');
  });
});

describe('resolveReviewedAt', () => {
  const now = 1_800_000_000_000;

  it('estrena fecha con una reseña nueva', () => {
    expect(resolveReviewedAt({ review: 'genial', previousReview: '', now })).toBe(now);
  });

  it('estrena fecha al reescribir el texto', () => {
    expect(resolveReviewedAt({ review: 'ahora mejor', previousReview: 'genial', previousReviewedAt: RESENA, now })).toBe(now);
  });

  it('conserva la fecha si el texto no cambia (editar la nota no recoloca la reseña)', () => {
    expect(resolveReviewedAt({ review: 'genial', previousReview: 'genial', previousReviewedAt: RESENA, now })).toBe(RESENA);
  });

  it('sin texto no hay fecha', () => {
    expect(resolveReviewedAt({ review: '', previousReview: 'genial', previousReviewedAt: RESENA, now })).toBeUndefined();
  });

  it('mismo texto en un juego sin fecha previa: no se inventa una', () => {
    // Los lectores caen a la fecha publicada y, en su defecto, al `_ts`. Estampar `now` diría que la reseña se
    // escribió hoy, que es justamente el error que este campo viene a evitar.
    expect(resolveReviewedAt({ review: 'genial', previousReview: 'genial', now })).toBeUndefined();
  });
});
