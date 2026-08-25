// Decisión PURA de qué hacer con el canal social al guardar un juego: publicar la reseña, retirarla o no tocar
// nada. Sin React, sin red, sin acceso al gist.
//
// POR QUÉ EXISTE. Esto vivía dentro de `handleSaveDraft`, en `App.tsx`: 281 líneas con CERO cobertura de test, y
// esta era la parte con más ramas de todas. Ahí ya se colocó un bug —el id sobre el que se publicaba se predecía
// repitiendo la regla de alta del ViewModel, así que una reseña podía colgarse de otro juego sin error ni
// rastro—, y no había ninguna prueba que pudiera haberlo cazado. La decisión son cinco comparaciones y tres
// resultados posibles: es exactamente la clase de lógica que pertenece a `core/` y se comprueba en una tabla.
//
// LO QUE NO DECIDE: el ID del juego. Ese lo devuelve el guardado (`saveDraft`), y es a propósito: predecirlo fue
// el bug. Aquí solo se responde "qué hay que hacer", no "sobre qué".

import { resolveGrade } from '../utils/scoreScale';
import type { GameItem, TabId } from '../../model/types/game';

/** El juego tal y como estaba antes del guardado. `undefined` = es un alta. */
export type PreviousReviewState = Pick<GameItem, 'name' | 'review' | 'score' | 'grade'> | undefined;

/** Lo que el usuario acaba de guardar (el borrador, ya con la lista de destino aparte). */
export interface NextReviewState {
  name: string;
  review: string;
  score: number;
  grade?: number | null;
}

/**
 * Qué hacer con el canal social.
 *
 * `publish` lleva el contenido YA NORMALIZADO (recortado y con la nota resuelta) para que quien llama no vuelva a
 * calcularlo: si lo hiciera, habría otra vez dos copias de la misma regla, que es el defecto que trajo a este
 * módulo a existir.
 */
export type ReviewPublication =
  | { kind: 'none' }
  | { kind: 'unpublish' }
  | {
      kind: 'publish';
      payload: {
        name: string;
        review: string;
        score: number;
        grade: number;
        /**
         * Solo cambiar el TEXTO (re)publica en el feed y lo recoloca. Cambiar únicamente la nota o el nombre
         * sincroniza una reseña ya publicada dejándola en su sitio.
         */
        reviewChanged: boolean;
      };
    };

/** Lista sin reseña publicable: en «próximos» un juego no se ha jugado, así que no hay reseña que publicar. */
const UNPUBLISHABLE_TAB: TabId = 'p';

const trimmed = (value: string | undefined): string => (value || '').trim();

export function decideReviewPublication(input: {
  /** Lista DESTINO del guardado (no la de origen: al mover un juego, manda dónde acaba). */
  tab: TabId;
  previous: PreviousReviewState;
  next: NextReviewState;
}): ReviewPublication {
  const review = trimmed(input.next.review);
  const previousReview = trimmed(input.previous?.review);

  // Sin reseña publicable: o la lista no admite reseña, o el usuario ha dejado el texto vacío.
  if (input.tab === UNPUBLISHABLE_TAB || !review) {
    // Si el juego TENÍA reseña publicada, se retira: si no, el feed se queda con una entrada fantasma con el
    // título y el fragmento viejos (el caso claro es vaciar el texto y renombrar el juego a la vez). Si nunca la
    // tuvo, no hay nada que retirar y se evita una escritura del gist para nada.
    return previousReview ? { kind: 'unpublish' } : { kind: 'none' };
  }

  const score = Number(input.next.score || 0);
  const grade = resolveGrade(input.next);
  const name = trimmed(input.next.name);

  const reviewChanged = previousReview !== review;
  const scoreChanged = Number(input.previous?.score || 0) !== score;
  // La nota fina puede cambiar SIN mover las estrellas (73 → 77 siguen siendo 4★), así que se compara la nota
  // efectiva y no el espejo: si no, esa edición no llegaba nunca al canal.
  const gradeChanged = resolveGrade(input.previous || {}) !== grade;
  const nameChanged = trimmed(input.previous?.name) !== name;

  if (!reviewChanged && !scoreChanged && !gradeChanged && !nameChanged) {
    return { kind: 'none' };
  }

  return { kind: 'publish', payload: { name, review, score, grade, reviewChanged } };
}
