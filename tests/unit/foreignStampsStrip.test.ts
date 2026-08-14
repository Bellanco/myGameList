// Los sellos de OTRA persona no entran en este aparato.
//
// El filtro de visibilidad los quita al pintar, pero eso llega tarde para un camino concreto: lo que devuelve la
// lectura del gist ajeno se guarda tal cual en la caché de perfiles (`putCachedProfileGames`), así que filtrarlo
// solo en pantalla dejaría el registro de a qué horas usa la app otra persona escrito en el IndexedDB de quien la
// mira. Por eso se limpian en la LECTURA, y esto lo fija.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readForeignGamesGist } from '../../src/model/repository/gistRepository';
import type { TabData } from '../../src/model/types/game';

const TOKEN = 'ghp_' + 'a'.repeat(36);
const GIST_ID = 'b'.repeat(32);

/** Un gist ajeno en formato plano, escrito por alguien que SÍ tiene la versión con sellos. */
function foreignGist(): TabData {
  return {
    c: [
      {
        id: 1,
        _ts: 1_780_000_000_000,
        name: 'Hollow Knight',
        platforms: ['Steam'],
        genres: ['Metroidvania'],
        steamDeck: false,
        review: '',
        score: 5,
        grade: 96,
        years: [2024],
        listedAt: 1_780_000_000_000,
        enteredAt: { p: 1_700_000_000_000, e: 1_740_000_000_000, c: 1_780_000_000_000 },
        gradedAt: 1_780_000_000_000,
      },
    ],
    v: [],
    e: [],
    p: [],
    deleted: [],
    updatedAt: 1_780_000_000_000,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lectura del gist de listados de otra persona', () => {
  it('descarta sus sellos antes de devolverlos (y, por tanto, antes de cachearlos)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ files: { 'myGames.json': { content: JSON.stringify(foreignGist()) } } }), {
            status: 200,
            headers: { etag: 'W/"etag-1"' },
          }),
      ),
    );

    const read = await readForeignGamesGist(TOKEN, GIST_ID);
    const game = (read.data as TabData).c[0];

    expect(game.enteredAt).toBeUndefined();
    expect(game.gradedAt).toBeUndefined();
  });

  it('lo que sí es del juego llega intacto', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ files: { 'myGames.json': { content: JSON.stringify(foreignGist()) } } }), {
            status: 200,
            headers: { etag: 'W/"etag-1"' },
          }),
      ),
    );

    const read = await readForeignGamesGist(TOKEN, GIST_ID);
    const game = (read.data as TabData).c[0];

    expect(game.name).toBe('Hollow Knight');
    expect(game.years).toEqual([2024]);
    expect(game.grade).toBe(96);
    expect(game.listedAt).toBe(1_780_000_000_000);
  });
});
