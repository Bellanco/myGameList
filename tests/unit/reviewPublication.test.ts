import { describe, expect, it } from 'vitest';
import { decideReviewPublication, type PreviousReviewState } from '../../src/core/social/reviewPublication';
import type { TabId } from '../../src/model/types/game';

/**
 * La decisión de publicar reseña en el canal social.
 *
 * Vivía dentro de `handleSaveDraft`, en `App.tsx`, que no tiene ni un test: era la parte con más ramas del
 * fichero con menos cobertura de todo el proyecto, y ahí se colocó el bug del id (la reseña se podía colgar de
 * otro juego sin error ni rastro). Estos casos son la red que faltaba.
 */

const previo = (parcial: Partial<NonNullable<PreviousReviewState>>): PreviousReviewState => ({
  name: 'Hollow Knight',
  review: '',
  score: 0,
  grade: 0,
  ...parcial,
});

const siguiente = (parcial: Partial<{ name: string; review: string; score: number; grade: number | null }> = {}) => ({
  name: 'Hollow Knight',
  review: 'Una obra maestra.',
  score: 5,
  grade: 96,
  ...parcial,
});

describe('decideReviewPublication — sin reseña publicable', () => {
  it('en «próximos» no se publica, aunque el borrador traiga texto', () => {
    const d = decideReviewPublication({ tab: 'p', previous: undefined, next: siguiente() });
    expect(d.kind).toBe('none');
  });

  it('en «próximos» SÍ se retira si el juego venía con reseña publicada', () => {
    const d = decideReviewPublication({ tab: 'p', previous: previo({ review: 'Lo dejé a medias.' }), next: siguiente() });
    expect(d.kind).toBe('unpublish');
  });

  it('vaciar el texto retira la reseña que había', () => {
    const d = decideReviewPublication({
      tab: 'c',
      previous: previo({ review: 'Me gustó mucho.' }),
      next: siguiente({ review: '   ' }),
    });
    expect(d.kind).toBe('unpublish');
  });

  it('vaciar el texto Y renombrar a la vez también retira: es el caso de la entrada fantasma', () => {
    const d = decideReviewPublication({
      tab: 'c',
      previous: previo({ review: 'Me gustó.', name: 'Nombre viejo' }),
      next: siguiente({ review: '', name: 'Nombre nuevo' }),
    });
    expect(d.kind).toBe('unpublish');
  });

  it('sin texto y sin reseña previa NO se toca el gist (retirar la nada cuesta una escritura)', () => {
    const d = decideReviewPublication({ tab: 'c', previous: previo({ review: '' }), next: siguiente({ review: '' }) });
    expect(d.kind).toBe('none');
  });

  it('un alta sin texto tampoco toca nada', () => {
    const d = decideReviewPublication({ tab: 'c', previous: undefined, next: siguiente({ review: '' }) });
    expect(d.kind).toBe('none');
  });
});

describe('decideReviewPublication — qué dispara una publicación', () => {
  it('un alta con reseña publica, y `reviewChanged` va en true (entra al feed)', () => {
    const d = decideReviewPublication({ tab: 'c', previous: undefined, next: siguiente() });
    expect(d).toEqual({
      kind: 'publish',
      payload: { name: 'Hollow Knight', review: 'Una obra maestra.', score: 5, grade: 96, reviewChanged: true },
    });
  });

  it('cambiar el TEXTO republica y recoloca (`reviewChanged` en true)', () => {
    const d = decideReviewPublication({
      tab: 'c',
      previous: previo({ review: 'Estaba bien.', score: 5, grade: 96 }),
      next: siguiente({ review: 'Pensándolo mejor, es una obra maestra.' }),
    });
    expect(d.kind).toBe('publish');
    if (d.kind === 'publish') expect(d.payload.reviewChanged).toBe(true);
  });

  it('cambiar solo el NOMBRE sincroniza sin recolocar (`reviewChanged` en false)', () => {
    const d = decideReviewPublication({
      tab: 'c',
      previous: previo({ review: 'Una obra maestra.', score: 5, grade: 96, name: 'Hollow Kn' }),
      next: siguiente(),
    });
    expect(d.kind).toBe('publish');
    if (d.kind === 'publish') expect(d.payload.reviewChanged).toBe(false);
  });

  it('cambiar solo las ESTRELLAS sincroniza sin recolocar', () => {
    const d = decideReviewPublication({
      tab: 'c',
      previous: previo({ review: 'Una obra maestra.', score: 4, grade: 96 }),
      next: siguiente({ score: 5 }),
    });
    expect(d.kind).toBe('publish');
    if (d.kind === 'publish') expect(d.payload.reviewChanged).toBe(false);
  });

  /**
   * El caso que motivó comparar la nota EFECTIVA y no el espejo de estrellas: 73 y 77 son las dos 4★, así que
   * comparando solo `score` esta edición no llegaba nunca al canal social.
   */
  it('cambiar la NOTA FINA sin mover las estrellas también sincroniza', () => {
    const d = decideReviewPublication({
      tab: 'c',
      previous: previo({ review: 'Una obra maestra.', score: 4, grade: 73 }),
      next: siguiente({ score: 4, grade: 77 }),
    });
    expect(d.kind).toBe('publish');
    if (d.kind === 'publish') expect(d.payload.grade).toBe(77);
  });

  it('sin ningún cambio no se escribe nada', () => {
    const d = decideReviewPublication({
      tab: 'c',
      previous: previo({ review: 'Una obra maestra.', score: 5, grade: 96 }),
      next: siguiente(),
    });
    expect(d.kind).toBe('none');
  });

  it('los espacios NO cuentan como cambio, ni en el texto ni en el nombre', () => {
    const d = decideReviewPublication({
      tab: 'c',
      previous: previo({ review: 'Una obra maestra.', score: 5, grade: 96, name: 'Hollow Knight' }),
      next: siguiente({ review: '  Una obra maestra.  ', name: '  Hollow Knight  ' }),
    });
    expect(d.kind).toBe('none');
  });

  it('el contenido sale ya recortado: quien llama no vuelve a normalizarlo', () => {
    const d = decideReviewPublication({
      tab: 'c',
      previous: undefined,
      next: siguiente({ review: '  Con espacios.  ', name: '  Celeste  ' }),
    });
    if (d.kind !== 'publish') throw new Error('debería publicar');
    expect(d.payload.review).toBe('Con espacios.');
    expect(d.payload.name).toBe('Celeste');
  });
});

describe('decideReviewPublication — la nota se resuelve como en el listado', () => {
  it('sin `grade`, la nota se deriva de las estrellas (×20)', () => {
    const d = decideReviewPublication({
      tab: 'c',
      previous: undefined,
      next: { name: 'Celeste', review: 'Precioso.', score: 4, grade: null },
    });
    if (d.kind !== 'publish') throw new Error('debería publicar');
    expect(d.payload.grade).toBe(80);
    expect(d.payload.score).toBe(4);
  });

  it('«sin puntuar» (nota y espejo a 0) publica igual: es una reseña sin nota, no una ausencia de reseña', () => {
    const d = decideReviewPublication({
      tab: 'v',
      previous: undefined,
      next: { name: 'Un juego', review: 'No lo puntúo, pero tengo cosas que decir.', score: 0, grade: 0 },
    });
    if (d.kind !== 'publish') throw new Error('debería publicar');
    expect(d.payload.grade).toBe(0);
  });
});

describe('decideReviewPublication — las cuatro listas', () => {
  // Solo «próximos» bloquea la publicación; las otras tres admiten reseña.
  const conReseña: TabId[] = ['c', 'v', 'e'];

  it.each(conReseña)('la lista «%s» publica con reseña', (tab) => {
    expect(decideReviewPublication({ tab, previous: undefined, next: siguiente() }).kind).toBe('publish');
  });

  it('«p» es la única que no', () => {
    expect(decideReviewPublication({ tab: 'p', previous: undefined, next: siguiente() }).kind).toBe('none');
  });
});
