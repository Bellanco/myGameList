// F4 — mensajes de LISTA del canal social: proyección de los sellos `enteredAt`.
//
// Lo que se comprueba aquí, por orden de importancia:
//  1. Que la proyección es idempotente y estable: la misma biblioteca da los mismos mensajes con las mismas
//     fechas, publicando una vez o cien. Es lo que permite publicar a rebufo de otra escritura.
//  2. Que el ALTA de un juego no publica mensaje: solo se cuenta lo que va de una lista a otra.
//  3. Que las listas OCULTAS no publican mensaje. Es la misma promesa que el ajuste de visibilidad ya hacía.
//  4. Que el campo `enteredAt` en crudo sigue sin poder llegar al gist, por mucho mensaje que se publique.
//  5. Que los mensajes no le roban el sitio a las reseñas ni se pierden en el round-trip del gist.
import { describe, expect, it } from 'vitest';
import { deriveMoveActivity, MOVE_ACTIVITY_MAX, reconcileMoveActivity, reviewActorsByGame, type SocialMoveEntry } from '../../src/core/social/moveActivity';
import {
  mergeSocialGistData,
  syncMoveActivity,
  upsertReviewActivity,
  type SocialGistData,
} from '../../src/model/repository/socialGistRepository';
import { assertNoSocialPrivateFields } from '../../src/model/repository/socialProjection';
import { assertValidSocialGist } from '../../src/model/schemas/socialGistSchema';
import type { GameItem, TabData } from '../../src/model/types/game';

const P = 1_700_000_000_000; // apuntado
const E = 1_740_000_000_000; // empezado
const C = 1_780_000_000_000; // terminado
/** Año LOCAL del sello de completado: es el que `years` tiene que incluir para que el mensaje se publique. */
const ANIO_C = new Date(C).getFullYear();

function game(extra: Partial<GameItem> & { id: number }): GameItem {
  return {
    _ts: C,
    name: `Game ${extra.id}`,
    platforms: ['Steam'],
    genres: ['RPG'],
    steamDeck: false,
    review: '',
    // Por defecto, terminado en el año de su sello: es el caso corriente («lo he pasado y lo he apuntado»). Los
    // tests que ejercitan el filtro pasan su propio `years`.
    years: [ANIO_C],
    ...extra,
  };
}

function tabData(lists: Partial<Record<'c' | 'v' | 'e' | 'p', GameItem[]>>): TabData {
  return { c: [], v: [], e: [], p: [], ...lists, deleted: [], updatedAt: 0 };
}

function baseGist(): SocialGistData {
  return {
    profile: {
      name: 'Autor',
      private: false,
      visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true },
      sharedLists: {},
    },
    activity: [],
    posts: [],
    moves: [],
    updatedAt: 1000,
    schemaVersion: 2,
  };
}

describe('F4 — proyección de los mensajes de lista', () => {
  it('publica un mensaje por cada lista por la que pasó el juego, no solo por la actual', () => {
    const games = tabData({ c: [game({ id: 7, name: 'Hollow Knight', enteredAt: { p: P, e: E, c: C } })] });

    const moves = deriveMoveActivity(games);

    // Próximos es por donde entró en la biblioteca: eso fue darlo de alta, no moverlo.
    expect(moves.map((entry) => entry.tab)).toEqual(['c', 'e']); // del más reciente al más antiguo
    expect(moves.map((entry) => entry.at)).toEqual([C, E]);
    expect(moves.every((entry) => entry.gameName === 'Hollow Knight' && entry.gameId === 7)).toBe(true);
    expect(moves.map((entry) => entry.id)).toEqual(['7:c', '7:e']);
  });

  // ── MOVIMIENTOS, NO ALTAS ────────────────────────────────────────────────────────────────────────────────
  it('un juego que acaba de entrar en la biblioteca no anuncia nada, en la lista que sea', () => {
    // Un solo sello = está donde lo pusieron y no se ha movido. Vale para las cuatro listas, completados incluida
    // (con su año en regla, que aquí no es lo que falla).
    const games = tabData({
      c: [game({ id: 1, enteredAt: { c: C } })],
      v: [game({ id: 2, enteredAt: { v: E } })],
      e: [game({ id: 3, enteredAt: { e: E } })],
      p: [game({ id: 4, enteredAt: { p: P } })],
    });

    expect(deriveMoveActivity(games)).toEqual([]);
  });

  it('moverlo después sí cuenta: el alta calla, el movimiento habla', () => {
    const alta = tabData({ p: [game({ id: 5, enteredAt: { p: P } })] });
    expect(deriveMoveActivity(alta)).toEqual([]);

    // El mismo juego, ya empezado: sale el mensaje del movimiento y solo ese.
    const movido = tabData({ e: [game({ id: 5, enteredAt: { p: P, e: E } })] });
    expect(deriveMoveActivity(movido).map((entry) => entry.id)).toEqual(['5:e']);
  });

  it('la lista de entrada se decide con TODOS los sellos, también los de las listas ocultas', () => {
    // Entró por la vergüenza (oculta) y luego se empezó. Si la lista oculta no contara como entrada, «comenzó»
    // pasaría por alta y se perdería el único mensaje publicable que hay aquí.
    const games = tabData({ e: [game({ id: 6, enteredAt: { v: P, e: E } })] });

    expect(deriveMoveActivity(games, { hiddenTabs: ['v'] }).map((entry) => entry.id)).toEqual(['6:e']);
  });

  it('es idempotente: proyectar dos veces la misma biblioteca da exactamente lo mismo', () => {
    const games = tabData({
      c: [game({ id: 1, enteredAt: { p: P, c: C } })],
      e: [game({ id: 2, enteredAt: { e: E } })],
    });

    expect(deriveMoveActivity(games)).toEqual(deriveMoveActivity(games));
  });

  it('las listas ocultas no publican mensaje, ni siquiera de un juego que hoy está a la vista', () => {
    // El juego está en completados (visible) pero pasó por la vergüenza, que su dueño esconde.
    const games = tabData({ c: [game({ id: 3, enteredAt: { v: P, c: C } })] });

    const moves = deriveMoveActivity(games, { hiddenTabs: ['v'] });

    expect(moves.map((entry) => entry.tab)).toEqual(['c']);
    expect(moves.some((entry) => entry.tab === 'v')).toBe(false);
  });

  it('un juego que hoy vive en una lista oculta sigue contando lo que hizo en las visibles', () => {
    const games = tabData({ v: [game({ id: 4, enteredAt: { p: P, e: E, v: C } })] });

    const moves = deriveMoveActivity(games, { hiddenTabs: ['v'] });

    // Cuenta que lo empezó; no cuenta —ni deja deducir— que acabó en la lista escondida.
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ tab: 'e', at: E });
  });

  it('descarta lo que no es publicable: sin sello, sin nombre, sin id y con fechas imposibles', () => {
    const games = tabData({
      c: [
        game({ id: 5, enteredAt: undefined }), // juego anterior a los sellos
        game({ id: 6, name: '   ', enteredAt: { c: C } }),
        game({ id: 0, enteredAt: { c: C } }),
        game({ id: 8, enteredAt: { c: 0, e: -1, p: Number.NaN, v: 1e18 } }), // 1e18 = fuera del rango de Date
      ],
    });

    expect(deriveMoveActivity(games)).toEqual([]);
  });

  it('el cupo se queda con los mensajes más recientes', () => {
    const games = tabData({
      c: Array.from({ length: 10 }, (_, index) => game({
        id: index + 1,
        years: [new Date(P).getFullYear()], // el sello de estos es del año de P, y `years` tiene que acompañarlo
        enteredAt: { p: P - 1000, c: P + index * 1000 }, // el alta primero: si no, el de completados no es un movimiento
      })),
    });

    const moves = deriveMoveActivity(games, { max: 3 });

    expect(moves.map((entry) => entry.gameId)).toEqual([10, 9, 8]);
  });

  // ── El filtro que separa JUGAR de CATALOGAR ──────────────────────────────────────────────────────────────
  it('un juego terminado hace años y catalogado hoy NO anuncia que se ha terminado', () => {
    const hoy = Date.now();
    const games = tabData({
      c: [game({ id: 20, name: 'Un clásico', years: [2019], enteredAt: { p: P, c: hoy } })],
    });

    // El movimiento a completados es de hoy, pero se pasó en 2019: no hay nada que anunciar.
    expect(deriveMoveActivity(games)).toEqual([]);
  });

  it('lo terminado en el año del sello sí se publica', () => {
    const games = tabData({ c: [game({ id: 21, years: [ANIO_C], enteredAt: { p: P, c: C } })] });

    expect(deriveMoveActivity(games).map((entry) => entry.tab)).toEqual(['c']);
  });

  it('una rejugada cuenta: basta con que `years` incluya el año del sello', () => {
    const games = tabData({ c: [game({ id: 22, years: [2019, ANIO_C], enteredAt: { p: P, c: C } })] });

    expect(deriveMoveActivity(games)).toHaveLength(1);
  });

  it('sin años no se anuncia: el mensaje afirma una fecha que no se puede sostener', () => {
    const games = tabData({ c: [game({ id: 23, years: [], enteredAt: { p: P, c: C } })] });

    expect(deriveMoveActivity(games)).toEqual([]);
  });

  it('el filtro es SOLO de completados: empezar un juego viejo sí es actividad de hoy', () => {
    // Un juego de 1998 que se apuntó y hoy se empieza: empezarlo ocurre hoy, aunque el juego tenga treinta años y
    // no tenga ni un año declarado.
    const games = tabData({ e: [game({ id: 24, years: [], enteredAt: { p: P, e: E } })] });

    expect(deriveMoveActivity(games).map((entry) => entry.tab)).toEqual(['e']);
  });

  it('el tope por defecto acota lo que se publica en una biblioteca grande', () => {
    const games = tabData({
      c: Array.from({ length: 200 }, (_, index) => game({ id: index + 1, enteredAt: { p: P + index, e: E + index, c: C + index } })),
    });

    // 200 juegos × (3 listas - el alta) = 400 mensajes candidatos.
    expect(deriveMoveActivity(games)).toHaveLength(MOVE_ACTIVITY_MAX);
  });
});

describe('F4 — sincronización con el gist social', () => {
  // Apuntado (alta, no publica), empezado y terminado: dos mensajes.
  const games = tabData({ c: [game({ id: 1, name: 'Celeste', enteredAt: { p: P, e: E, c: C } })] });

  it('escribe los mensajes derivados y es no-op a la segunda (misma referencia)', () => {
    const data = baseGist();
    const derived = deriveMoveActivity(games);

    const next = syncMoveActivity(data, derived, 2000);
    expect(next).not.toBe(data);
    expect(next.moves).toHaveLength(2);
    expect(next.updatedAt).toBe(2000);

    // Segunda pasada sin cambios: se devuelve el MISMO objeto para que no se reescriba el gist.
    expect(syncMoveActivity(next, deriveMoveActivity(games), 3000)).toBe(next);
  });

  it('reemplaza: un juego borrado o una lista que pasa a oculta retiran su mensaje', () => {
    const publicado = syncMoveActivity(baseGist(), deriveMoveActivity(games), 2000);
    expect(publicado.moves).toHaveLength(2);

    // Su dueño esconde «en curso»: el mensaje de esa lista desaparece del canal sin pasada aparte.
    const conListaOculta = syncMoveActivity(publicado, deriveMoveActivity(games, { hiddenTabs: ['e'] }), 3000);
    expect(conListaOculta.moves?.map((entry) => entry.tab)).toEqual(['c']);

    // Juego borrado: sin sellos locales no queda mensaje ninguno.
    const vacio = syncMoveActivity(conListaOculta, [], 4000);
    expect(vacio.moves).toEqual([]);
  });

  it('conserva la fecha ya publicada si la derivada es POSTERIOR (re-siembra de un cliente antiguo)', () => {
    const publicado = syncMoveActivity(baseGist(), deriveMoveActivity(games), 2000);

    // Un cliente viejo pisó los sellos y `normalizeGame` los resembró desde `listedAt`: la fecha derivada es más
    // nueva que la real. La publicada manda.
    const resembrado = tabData({ c: [game({ id: 1, name: 'Celeste', enteredAt: { p: P, e: C, c: C } })] });
    const next = syncMoveActivity(publicado, deriveMoveActivity(resembrado), 3000);

    expect(next.moves?.find((entry) => entry.tab === 'e')?.at).toBe(E);
  });

  it('un nombre nuevo del juego sí actualiza el mensaje ya publicado', () => {
    const publicado = syncMoveActivity(baseGist(), deriveMoveActivity(games), 2000);
    const renombrado = tabData({ c: [game({ id: 1, name: 'Celeste Classic', enteredAt: { p: P, e: E, c: C } })] });

    const next = syncMoveActivity(publicado, deriveMoveActivity(renombrado), 3000);

    expect(next).not.toBe(publicado);
    expect(next.moves?.every((entry) => entry.gameName === 'Celeste Classic')).toBe(true);
  });

  it('no toca la actividad, ni las publicaciones, ni el perfil', () => {
    const conResena = upsertReviewActivity(baseGist(), {
      actorProfileId: 'p1',
      actorName: 'Autor',
      gameId: 1,
      gameName: 'Celeste',
      reviewText: 'Una reseña',
      rating: 5,
      timestamp: 1500,
    });

    const next = syncMoveActivity(conResena, deriveMoveActivity(games), 2000);

    expect(next.activity).toEqual(conResena.activity);
    expect(next.posts).toEqual(conResena.posts);
    expect(next.profile).toEqual(conResena.profile);
  });
});

describe('F4 — qué se retira y qué se conserva del canal', () => {
  const publicado = (id: string, gameId: number, tab: 'c' | 'e', at: number): SocialMoveEntry =>
    ({ id, gameId, gameName: `Juego ${gameId}`, tab, at });

  it('con el juego delante, lo que la proyección no produce se retira', () => {
    // Es lo que limpia lo publicado antes del filtro de «jugar, no catalogar»: el juego existe (no es huérfano),
    // pero sus sellos y sus años ya no sostienen ese mensaje.
    const resultado = reconcileMoveActivity({
      derived: [],
      published: [publicado('40:c', 40, 'c', C)],
      knownGameIds: new Set([40]),
      localUpdatedAt: C + 1000,
    });

    expect(resultado).toEqual([]);
  });

  it('sin el juego delante y con el mensaje más nuevo que los listados, se conserva', () => {
    // Biblioteca parcial (sync de juegos aún en camino): este dispositivo no puede borrar lo que no conoce.
    const resultado = reconcileMoveActivity({
      derived: [],
      published: [publicado('50:e', 50, 'e', C)],
      knownGameIds: new Set(),
      localUpdatedAt: C - 1000,
    });

    expect(resultado.map((entry) => entry.id)).toEqual(['50:e']);
  });

  it('sin el juego delante y con listados posteriores, se retira (huérfano de verdad)', () => {
    const resultado = reconcileMoveActivity({
      derived: [],
      published: [publicado('60:e', 60, 'e', C)],
      knownGameIds: new Set(),
      localUpdatedAt: C + 1000,
    });

    expect(resultado).toEqual([]);
  });

  it('en modo «solo altas» (publicación a rebufo) no retira nada', () => {
    // La publicación a rebufo pasa el conjunto vacío y `localUpdatedAt: 0`: no audita, solo añade.
    const resultado = reconcileMoveActivity({
      derived: [],
      published: [publicado('70:c', 70, 'c', C)],
      knownGameIds: new Set(),
      localUpdatedAt: 0,
    });

    expect(resultado.map((entry) => entry.id)).toEqual(['70:c']);
  });

  it('una lista oculta se retira aunque no se conozca el juego', () => {
    const resultado = reconcileMoveActivity({
      derived: [],
      published: [publicado('80:c', 80, 'c', C)],
      knownGameIds: new Set(),
      hiddenTabs: ['c'],
      localUpdatedAt: 0,
    });

    expect(resultado).toEqual([]);
  });
});

describe('F4 — a quién apunta el enlace del juego', () => {
  // El bug que fija: el detalle de una reseña se resuelve comparando con el `actorProfileId` del gist, y el feed
  // tenía a mano otro identificador de la misma persona (el de la entrada del directorio, que para una amistad es
  // su uid de Firebase). Con ese, el enlace abría una pantalla que no encontraba nada.
  const actividad = [
    { type: 'review', gameId: 7, actorProfileId: 'pseudonimo-del-gist' },
    { type: 'review', gameId: 9, actorProfileId: 'pseudonimo-del-gist' },
    { type: 'recommendation', gameId: 11, actorProfileId: 'pseudonimo-del-gist' },
  ];

  it('indexa por juego el actor de las RESEÑAS', () => {
    const actores = reviewActorsByGame(actividad);

    expect(actores.get(7)).toBe('pseudonimo-del-gist');
    expect(actores.get(9)).toBe('pseudonimo-del-gist');
  });

  it('un juego sin reseña no tiene actor: no hay nada que abrir', () => {
    const actores = reviewActorsByGame(actividad);

    expect(actores.has(11)).toBe(false); // era una recomendación, no una reseña
    expect(actores.has(99)).toBe(false); // ni siquiera está
  });

  it('ignora las entradas sin actor (gist manipulado o a medio migrar)', () => {
    const actores = reviewActorsByGame([{ type: 'review', gameId: 7, actorProfileId: '' }]);

    expect(actores.size).toBe(0);
  });
});

describe('F4 — integridad del canal', () => {
  it('el schema estricto acepta el gist con y sin mensajes, y rechaza un campo de más', () => {
    const sinMoves = baseGist();
    delete sinMoves.moves;
    expect(() => assertValidSocialGist(sinMoves)).not.toThrow();

    const conMoves = syncMoveActivity(baseGist(), deriveMoveActivity(tabData({ c: [game({ id: 1, enteredAt: { p: P, c: C } })] })), 2000);
    expect(() => assertValidSocialGist(conMoves)).not.toThrow();

    // Allowlist: un mensaje con un campo extra (aquí, el sello en crudo) no pasa.
    const contaminado = {
      ...conMoves,
      moves: [{ ...(conMoves.moves as SocialMoveEntry[])[0], enteredAt: { c: C } }],
    };
    expect(() => assertValidSocialGist(contaminado)).toThrow(/schema/i);
  });

  it('la guarda de privacidad sigue rechazando el sello en crudo dentro del gist', () => {
    const conMoves = syncMoveActivity(baseGist(), deriveMoveActivity(tabData({ c: [game({ id: 1, enteredAt: { p: P, c: C } })] })), 2000);

    // Lo que se publica (juego, lista, instante) es limpio…
    expect(() => assertNoSocialPrivateFields(conMoves)).not.toThrow();
    // …y el campo del que sale sigue prohibido.
    expect(() => assertNoSocialPrivateFields({ ...conMoves, moves: [{ enteredAt: { c: C } }] })).toThrow(/enteredAt/);
  });

  it('la fusión de dos lecturas del mismo gist une los mensajes y conserva la fecha más antigua', () => {
    const a: SocialGistData = { ...baseGist(), updatedAt: 5000, moves: [{ id: '1:c', gameId: 1, gameName: 'Celeste', tab: 'c', at: C }] };
    const b: SocialGistData = {
      ...baseGist(),
      updatedAt: 4000,
      moves: [
        { id: '1:c', gameId: 1, gameName: 'Celeste', tab: 'c', at: P }, // más antigua: es la real
        { id: '2:e', gameId: 2, gameName: 'Tunic', tab: 'e', at: E },
      ],
    };

    const merged = mergeSocialGistData(a, b);

    expect(merged.moves).toHaveLength(2);
    expect(merged.moves?.find((entry) => entry.id === '1:c')?.at).toBe(P);
    expect(merged.moves?.find((entry) => entry.id === '2:e')?.at).toBe(E);
  });
});
