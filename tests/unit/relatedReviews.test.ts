// Reseñas relacionadas: lo que se ofrece al final de una reseña abierta.
//
// Lo que se comprueba aquí, por orden de importancia:
//  1. Que el cruce entre bibliotecas se hace por NOMBRE y no por id, que es la única clave que significa lo
//     mismo en dos aparatos distintos (el id de juego se asigna por biblioteca).
//  2. Que la reseña abierta nunca se recomienda a sí misma, incluso cuando la propia llega con dos
//     identificadores de autor distintos (biblioteca local vs. pseudónimo del gist).
//  3. Que la jerarquía de motivos se respeta: mismo juego > mismo autor > mismo género.
//  4. Que las cuotas impiden que un autor prolífico —o un solo motivo— se lleve el bloque entero.
//  5. Que la falta de géneros, de texto o de una fecha válida no rompe nada: son casos NORMALES en este canal.
import { describe, expect, it } from 'vitest';
import {
  rankRelatedReviews,
  type RelatedReviewAnchor,
  type RelatedReviewCandidate,
} from '../../src/core/social/relatedReviews';
import { gameTitleKey } from '../../src/core/utils/gameTitleKey';

const T = 1_780_000_000_000;

function candidate(extra: Partial<RelatedReviewCandidate> & { key: string }): RelatedReviewCandidate {
  return {
    gameId: 1,
    gameName: 'Elden Ring',
    authorId: 'ana',
    authorName: 'Ana',
    isOwn: false,
    rating: 4,
    grade: 87,
    snippet: 'Un mundo que respeta al jugador.',
    updatedAt: T,
    ...extra,
  };
}

function anchor(extra: Partial<RelatedReviewAnchor> = {}): RelatedReviewAnchor {
  return { gameName: 'Elden Ring', authorId: 'luis', isOwn: false, ...extra };
}

/** Índice de géneros como lo construye el recolector: por la MISMA clave con la que se cruzan los nombres. */
function genres(entries: Record<string, string[]>): Map<string, string[]> {
  return new Map(Object.entries(entries).map(([name, list]) => [gameTitleKey(name), list]));
}

describe('rankRelatedReviews — cruce por nombre', () => {
  it('casa el mismo juego escrito con otras mayúsculas y espacios', () => {
    const result = rankRelatedReviews(anchor(), [candidate({ key: 'a', gameName: '  ELDEN RING ' })]);

    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('same-game');
  });

  it('ignora el id del juego: dos bibliotecas numeran distinto el mismo título', () => {
    // Mismo nombre, ids sin relación (uno de cada biblioteca): tiene que relacionarlos igual.
    const result = rankRelatedReviews(anchor(), [candidate({ key: 'a', gameId: 999, gameName: 'Elden Ring' })]);

    expect(result[0]?.reason).toBe('same-game');
  });

  it('no relaciona títulos distintos aunque compartan id', () => {
    const result = rankRelatedReviews(anchor(), [candidate({ key: 'a', gameId: 1, gameName: 'Hollow Knight' })]);

    expect(result).toEqual([]);
  });

  // Las reglas de casado son de `gameTitleKey` y allí se prueban una a una; aquí solo se comprueba que llegan
  // hasta el final, que es lo que se rompería si alguien cambiase la clave en un sitio y no en el otro.
  it('reconoce el mismo juego escrito de otra manera', () => {
    const result = rankRelatedReviews(
      { gameName: 'The Witcher 3: Wild Hunt — Game of the Year Edition', authorId: 'luis', isOwn: false },
      [candidate({ key: 'a', gameName: 'Witcher 3 Wild Hunt' })],
    );

    expect(result[0]?.reason).toBe('same-game');
  });

  it('sigue sin fundir un remake con su original', () => {
    const result = rankRelatedReviews(
      { gameName: 'Final Fantasy VII', authorId: 'luis', isOwn: false },
      [candidate({ key: 'a', gameName: 'Final Fantasy VII Remake' })],
    );

    expect(result).toEqual([]);
  });
});

describe('rankRelatedReviews — la reseña abierta no se ofrece a sí misma', () => {
  it('excluye al mismo autor hablando del mismo juego', () => {
    const result = rankRelatedReviews(
      anchor({ authorId: 'ana' }),
      [candidate({ key: 'a', authorId: 'ana', gameName: 'Elden Ring' })],
    );

    expect(result).toEqual([]);
  });

  it('excluye la propia aunque el id de autor no coincida (biblioteca local vs. pseudónimo del gist)', () => {
    // Es el caso real: la misma reseña llega como `own-3` desde las listas y como `perfil-abc` desde el canal.
    // Si se comparasen los identificadores, la reseña abierta aparecería recomendándose a sí misma.
    const result = rankRelatedReviews(
      anchor({ authorId: 'own-3', isOwn: true }),
      [candidate({ key: 'a', authorId: 'perfil-abc', isOwn: true, gameName: 'Elden Ring' })],
    );

    expect(result).toEqual([]);
  });

  it('sí ofrece al mismo autor cuando habla de OTRO juego', () => {
    const result = rankRelatedReviews(
      anchor({ authorId: 'ana' }),
      [candidate({ key: 'a', authorId: 'ana', gameName: 'Hollow Knight' })],
    );

    expect(result[0]?.reason).toBe('same-author');
  });
});

describe('rankRelatedReviews — jerarquía de motivos', () => {
  it('mismo juego primero, y el género por delante del mero hecho de ser la misma firma', () => {
    // El género (30) pesa más que el autor (25) a propósito: que alguien haya escrito de otro juego del género
    // que estás leyendo dice más que compartir firma y nada más.
    const result = rankRelatedReviews(
      anchor({ authorId: 'luis' }),
      [
        candidate({ key: 'genero', authorId: 'ana', gameName: 'Nioh 2' }),
        candidate({ key: 'autor', authorId: 'luis', gameName: 'Hollow Knight' }),
        candidate({ key: 'juego', authorId: 'ana', gameName: 'Elden Ring' }),
      ],
      genres({ 'Elden Ring': ['Acción', 'RPG'], 'Nioh 2': ['Acción'] }),
    );

    expect(result.map((entry) => entry.key)).toEqual(['juego', 'genero', 'autor']);
  });

  it('un candidato que cumple dos motivos se ofrece por el de más peso', () => {
    // Ana ha reseñado el mismo juego Y comparte género con él: se ofrece por «mismo juego», que es lo que mejor
    // explica por qué está ahí.
    const result = rankRelatedReviews(
      anchor({ authorId: 'luis' }),
      [candidate({ key: 'a', authorId: 'ana', gameName: 'Elden Ring' })],
      genres({ 'Elden Ring': ['Acción'] }),
    );

    expect(result[0].reason).toBe('same-game');
  });

  it('a igual motivo, primero la más reciente', () => {
    const result = rankRelatedReviews(anchor(), [
      candidate({ key: 'vieja', authorId: 'ana', updatedAt: T - 1000 }),
      candidate({ key: 'nueva', authorId: 'bea', updatedAt: T }),
    ]);

    expect(result.map((entry) => entry.key)).toEqual(['nueva', 'vieja']);
  });
});

describe('rankRelatedReviews — género', () => {
  it('el género basta para entrar a quien no comparte ni juego ni autor', () => {
    const result = rankRelatedReviews(
      anchor({ genres: ['Acción'] }),
      [candidate({ key: 'a', gameName: 'Nioh 2' })],
      genres({ 'Nioh 2': ['acción'] }),
    );

    expect(result[0].reason).toBe('genre');
  });

  it('el género SUMA al vínculo en vez de competir con él', () => {
    // Dos reseñas de la misma persona: la que además comparte género con lo que estás leyendo va delante. Antes
    // el género solo se miraba en quien no entraba por otra vía, así que aquí no cambiaba nada.
    const result = rankRelatedReviews(
      anchor({ authorId: 'luis', genres: ['Acción'] }),
      [
        candidate({ key: 'sin-genero', authorId: 'luis', gameName: 'Celeste' }),
        candidate({ key: 'con-genero', authorId: 'luis', gameName: 'Nioh 2', updatedAt: T - 5000 }),
      ],
      genres({ 'Nioh 2': ['Acción'], Celeste: ['Plataformas'] }),
    );

    expect(result.map((entry) => entry.key)).toEqual(['con-genero', 'sin-genero']);
  });

  it('el mismo juego sigue por delante del mismo autor aunque este comparta género', () => {
    // El refuerzo del género no puede saltarse la jerarquía: 100 contra 60+20.
    const result = rankRelatedReviews(
      anchor({ authorId: 'luis', genres: ['Acción'] }),
      [
        candidate({ key: 'autor-genero', authorId: 'luis', gameName: 'Nioh 2' }),
        candidate({ key: 'mismo-juego', authorId: 'ana', gameName: 'Elden Ring' }),
      ],
      genres({ 'Nioh 2': ['Acción'] }),
    );

    expect(result.map((entry) => entry.key)).toEqual(['mismo-juego', 'autor-genero']);
  });

  it('puntúa por encima al que comparte más géneros', () => {
    const result = rankRelatedReviews(
      anchor({ genres: ['Acción', 'RPG'] }),
      [
        candidate({ key: 'uno', gameName: 'Nioh 2', authorId: 'ana' }),
        candidate({ key: 'dos', gameName: 'Dark Souls', authorId: 'bea' }),
      ],
      genres({ 'Nioh 2': ['Acción'], 'Dark Souls': ['Acción', 'RPG'] }),
    );

    expect(result.map((entry) => entry.key)).toEqual(['dos', 'uno']);
  });

  it('sin índice de géneros no relaciona por género, y no revienta', () => {
    // Es el caso CORRIENTE: los géneros no viajan por el canal social, así que del juego de una amistad que no
    // esté en tus listas no se sabe el género. Los otros dos motivos tienen que seguir funcionando.
    const result = rankRelatedReviews(anchor({ authorId: 'luis' }), [
      candidate({ key: 'genero', authorId: 'ana', gameName: 'Nioh 2' }),
      candidate({ key: 'autor', authorId: 'luis', gameName: 'Hollow Knight' }),
    ]);

    expect(result.map((entry) => entry.key)).toEqual(['autor']);
  });

  it('los géneros del ancla salen del índice cuando no vienen dados', () => {
    const result = rankRelatedReviews(
      anchor(),
      [candidate({ key: 'a', gameName: 'Nioh 2' })],
      genres({ 'Elden Ring': ['Acción'], 'Nioh 2': ['Acción'] }),
    );

    expect(result[0]?.reason).toBe('genre');
  });
});

// Tu propia opinión ya la conoces: a igualdad de lo demás va detrás de la de otra persona. Pero sobre el MISMO
// juego sí interesa comparar, y cuando no hay nada de nadie más tus reseñas siguen saliendo.
describe('rankRelatedReviews — lo tuyo resta, menos en el mismo juego', () => {
  it('del mismo género, la de otra persona va por delante de la tuya', () => {
    const result = rankRelatedReviews(
      anchor({ genres: ['Acción'] }),
      [
        candidate({ key: 'mia', authorId: 'yo', isOwn: true, gameName: 'Nioh 2' }),
        candidate({ key: 'ajena', authorId: 'ana', gameName: 'Sekiro', updatedAt: T - 5000 }),
      ],
      genres({ 'Nioh 2': ['Acción'], Sekiro: ['Acción'] }),
    );

    // La ajena gana pese a ser MÁS ANTIGUA: no lo decide la fecha, lo decide el descuento.
    expect(result.map((entry) => entry.key)).toEqual(['ajena', 'mia']);
  });

  it('sobre el mismo juego, la tuya sigue arriba: ahí sí quieres comparar', () => {
    const result = rankRelatedReviews(
      anchor({ authorId: 'luis', genres: ['Acción'] }),
      [
        candidate({ key: 'mia-mismo-juego', authorId: 'yo', isOwn: true, gameName: 'Elden Ring' }),
        candidate({ key: 'ajena-autor-genero', authorId: 'luis', gameName: 'Nioh 2' }),
      ],
      genres({ 'Nioh 2': ['Acción'] }),
    );

    expect(result[0].key).toBe('mia-mismo-juego');
  });

  it('si no hay nada de nadie más, tus reseñas salen igual: restar las baja, no las elimina', () => {
    const result = rankRelatedReviews(
      anchor({ genres: ['Acción'] }),
      [candidate({ key: 'mia', authorId: 'yo', isOwn: true, gameName: 'Nioh 2' })],
      genres({ 'Nioh 2': ['Acción'] }),
    );

    expect(result.map((entry) => entry.key)).toEqual(['mia']);
  });

  it('leyendo lo tuyo, otra reseña tuya no cobra el premio de autor: solo el descuento', () => {
    const result = rankRelatedReviews(
      anchor({ authorId: 'yo', isOwn: true }),
      [candidate({ key: 'mia', authorId: 'yo', isOwn: true, gameName: 'Hollow Knight' })],
    );

    expect(result[0].score).toBe(-15);
  });
});

describe('rankRelatedReviews — duplicados', () => {
  it('con la misma reseña por las dos puertas se queda con el texto COMPLETO, no con el más reciente', () => {
    // La publicación ocurre DESPUÉS de escribir, así que la copia del canal es a la vez la más nueva y la
    // recortada. Decidir por fecha dejaba siempre el adelanto de 160 caracteres.
    const result = rankRelatedReviews(anchor({ authorId: 'own-1', isOwn: true }), [
      candidate({ key: 'canal', authorId: 'perfil-abc', isOwn: true, gameName: 'Hollow Knight', snippet: 'Recorte…', updatedAt: T + 5000 }),
      candidate({ key: 'local', authorId: 'own-3', isOwn: true, gameName: 'Hollow Knight', snippet: 'Texto completo de la reseña.', full: true, updatedAt: T }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('local');
  });

  it('funde al mismo autor duplicado por la fusión de dos gists', () => {
    const result = rankRelatedReviews(anchor({ authorId: 'luis' }), [
      candidate({ key: 'gist-a', authorId: 'ana', gameName: 'Elden Ring', updatedAt: T - 1000 }),
      candidate({ key: 'gist-b', authorId: 'ana', gameName: 'Elden Ring', updatedAt: T }),
    ]);

    expect(result.map((entry) => entry.key)).toEqual(['gist-b']);
  });
});

// Las cuotas se ejercitan pasando su valor a mano y no confiando en el de por defecto: esos números son mandos
// pensados para retocarse (ver la cabecera del módulo), y una prueba que los fije de tapadillo convierte cada
// ajuste en un test roto que no señala ningún fallo.
describe('rankRelatedReviews — cuotas y tope', () => {
  it('no deja que un autor prolífico copie el bloque', () => {
    const result = rankRelatedReviews(
      anchor({ authorId: 'luis' }),
      ['a', 'b', 'c', 'd'].map((suffix, index) =>
        candidate({ key: `luis-${suffix}`, authorId: 'luis', gameName: `Juego ${suffix}`, updatedAt: T - index })),
      new Map(),
      { maxPerAuthor: 2 },
    );

    expect(result).toHaveLength(2);
  });

  it('reparte entre tipos de vínculo: ninguno se lleva el bloque entero', () => {
    const sameGame = ['ana', 'bea', 'cris', 'dani'].map((author, index) =>
      candidate({ key: `juego-${author}`, authorId: author, gameName: 'Elden Ring', updatedAt: T - index }));

    const result = rankRelatedReviews(anchor({ authorId: 'luis' }), sameGame, new Map(), { maxPerReason: 3 });

    expect(result).toHaveLength(3);
    expect(result.every((entry) => entry.reason === 'same-game')).toBe(true);
  });

  it('respeta el tope total', () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      candidate({ key: `k-${index}`, authorId: `autor-${index}`, gameName: 'Elden Ring', updatedAt: T - index }));

    expect(rankRelatedReviews(anchor(), many, new Map(), { limit: 2, maxPerReason: 10 })).toHaveLength(2);
  });

  it('con tope cero no devuelve nada', () => {
    expect(rankRelatedReviews(anchor(), [candidate({ key: 'a' })], new Map(), { limit: 0 })).toEqual([]);
  });
});

describe('rankRelatedReviews — entradas que no se pueden ofrecer', () => {
  it('descarta las reseñas sin texto', () => {
    expect(rankRelatedReviews(anchor(), [candidate({ key: 'a', snippet: '   ' })])).toEqual([]);
  });

  it('descarta las fechas que Date no sabe representar', () => {
    // Mismo criterio que el feed: un `updatedAt` en micro/nanosegundos ordenaría arriba y coparía el bloque con
    // tarjetas que luego no saben pintar su fecha.
    expect(rankRelatedReviews(anchor(), [candidate({ key: 'a', updatedAt: 1.78e18 })])).toEqual([]);
    expect(rankRelatedReviews(anchor(), [candidate({ key: 'b', updatedAt: 0 })])).toEqual([]);
  });

  it('descarta los candidatos sin nombre de juego', () => {
    expect(rankRelatedReviews(anchor(), [candidate({ key: 'a', gameName: '  ' })])).toEqual([]);
  });

  it('sin nombre en el ancla no hay nada que relacionar', () => {
    expect(rankRelatedReviews(anchor({ gameName: '' }), [candidate({ key: 'a' })])).toEqual([]);
  });
});
