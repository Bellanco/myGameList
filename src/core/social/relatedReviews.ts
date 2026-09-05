// Reseñas RELACIONADAS: las que se ofrecen al final de una reseña abierta para poder seguir leyendo.
//
// TRES VÍNCULOS Y UN REFUERZO, y el orden entre ellos no es un gusto sino lo que cada uno vale para quien acaba
// de leer:
//
//   1. MISMO JUEGO. Otra persona hablando de lo que acabas de leer. Es el vínculo con más valor —comparar dos
//      opiniones sobre lo mismo es media razón de tener un espacio social— y el único de cobertura completa.
//   2. MISMA SAGA. Otra entrega de lo que acabas de leer: «Persona 3 Reloaded» bajo «Persona 5 Royal». Es lo más
//      parecido al mismo juego que existe sin serlo —quien lee sobre una saga quiere leer sobre la saga—, y de
//      reconocerla se encarga `sharedSagaName`, que solo la da por buena cuando el nombre compartido nombra algo
//      de verdad (ni números, ni artículos, ni pronombres).
//   3. MÁS DE ESTA PERSONA. Quien te ha convencido (o no) escribiendo esto tiene más escrito. Siempre hay
//      material, y es la navegación natural hacia su perfil.
//   4. EL GÉNERO SUMA A LOS ANTERIORES en vez de competir con ellos: entre dos análisis del mismo autor, sube el
//      del género que estás leyendo. Y a quien no tiene ninguno de los otros vínculos, el género le basta para
//      entrar. Cobertura irregular (ver más abajo).
//
// EL CRUCE ES POR NOMBRE, NO POR ID. El `id` de un juego se asigna por biblioteca (`max(ids)+1` en
// `useGameListViewModel.saveDraft`), así que el juego 42 de una amistad no tiene nada que ver con el 42 propio.
// El único identificador que significa lo mismo en dos aparatos distintos es el título, y de reconocerlo escrito
// de dos maneras se encarga `gameTitleKey`, que tiene que ser la MISMA función con la que el recolector indexe
// los juegos o el cruce falla en silencio. La saga se cruza por lo mismo y con la misma clave: es el prefijo de
// palabras que dos títulos comparten.
//
// Los GÉNEROS, en cambio, se comparan con `normalizeName` a secas. No son títulos: nadie escribe «Acción
// Remastered» ni «The Acción», y aplicarles las reglas de los títulos solo añadiría formas de equivocarse.
//
// LOS GÉNEROS NO VIAJAN POR EL CANAL. Una entrada de actividad lleva juego, nota y adelanto de texto, y las
// listas compartidas quedan vacías para perfiles ajenos a propósito (decisión E3 de privacidad). Los géneros
// solo se conocen de la biblioteca propia y de los listados de la amistad que se haya abierto, así que este
// módulo NO los busca: los recibe ya indexados y trata la ausencia como lo normal que es. Un candidato sin
// géneros conocidos no puede relacionarse por ese motivo; los otros siguen funcionando.
//
// PRIVACIDAD. No hay nada que decidir aquí: el directorio solo lee el gist social de las amistades y el propio
// (`useSocialDirectory`), de modo que todo lo que puede llegar como candidato ya era visible para quien mira.
// Este módulo no amplía el alcance de nada; reordena lo que ya se podía leer.
//
// PURO: sin reloj, sin E/S y sin estado. Recibe los candidatos aplanados y devuelve una lista ordenada.
import { gameTitleKey } from '../utils/gameTitleKey';
import { sharedSagaName } from '../utils/gameSaga';
import { normalizeName } from '../roulette/roulette';
import { isPublishableTimestamp } from './moveActivity';

/** Por qué se ofrece una reseña. Es también lo que rotula el chip que la acompaña. */
export type RelatedReason = 'same-game' | 'saga' | 'same-author' | 'genre';

/**
 * Reseña candidata, ya aplanada desde su origen: el canal social (actividad del directorio) o la biblioteca
 * local. Este módulo no sabe de cuál viene ninguna, y esa es la idea: las reseñas propias SIN publicar valen
 * como candidatas igual que las publicadas —son tuyas y solo las ves tú— y entran por la misma puerta.
 */
export interface RelatedReviewCandidate {
  /** Clave estable de render y último desempate del orden. Única entre todos los candidatos. */
  key: string;
  gameId: number;
  gameName: string;
  /**
   * Autor. Para las ajenas, el `actorProfileId` del gist (el pseudónimo público, NO el id de la entrada del
   * directorio, que para una amistad es su uid de Firebase). Para las propias da igual lo que ponga: la
   * identidad propia se compara por `isOwn` (ver `authorKey`).
   */
  authorId: string;
  authorName: string;
  /** ¿Es una reseña propia? Decide la identidad de autor y, fuera de aquí, la ruta con la que se abre. */
  isOwn: boolean;
  rating: number;
  grade: number | null;
  /** Adelanto del texto. Sin texto no hay reseña que ofrecer, así que un candidato vacío se descarta. */
  snippet: string;
  updatedAt: number;
  /**
   * ¿El texto es el COMPLETO (biblioteca local) o el adelanto de ≤160 del canal?
   *
   * Solo se usa para deduplicar: una reseña propia llega por las dos puertas —la local con el texto entero y la
   * del canal con el recorte— y la publicación es POSTERIOR a haberla escrito, así que decidir por recencia se
   * quedaría siempre con la versión mutilada.
   */
  full?: boolean;
}

/** La reseña que se está leyendo. Es de quien parte la relación, y queda fuera de sus propios resultados. */
export interface RelatedReviewAnchor {
  gameName: string;
  authorId: string;
  isOwn: boolean;
  /**
   * Géneros de la reseña abierta. Si no vienen, se buscan en el índice por nombre: en el detalle del feed la
   * pantalla ya los tiene resueltos y en otros sitios no.
   */
  genres?: readonly string[];
}

export interface RelatedReview extends RelatedReviewCandidate {
  /**
   * El vínculo con la reseña abierta. NO se enseña: la tarjeta ya lleva el título y el autor, que es de donde
   * sale el «mismo juego», el «otra de la saga» o el «otra suya» sin necesidad de escribirlo. Existe para que
   * las cuotas puedan repartir el bloque entre tipos de vínculo.
   *
   * Cuando una reseña cumple varios, lleva el de MÁS PESO (mismo juego → saga → autor → género): es el que
   * mejor explica por qué está ahí y el que decide contra qué cuota cuenta.
   */
  reason: RelatedReason;
  score: number;
}

export interface RankRelatedOptions {
  /** Cuántas reseñas devuelve el bloque. */
  limit?: number;
  /**
   * Tope por autor. Sin él, una amistad prolífica copaba el bloque entero por «más de esta persona» y la lista
   * mezclada dejaba de estar mezclada.
   */
  maxPerAuthor?: number;
  /** Tope por motivo, por lo mismo: que ninguno de ellos se lleve el bloque él solo. */
  maxPerReason?: number;
  /**
   * La FIRMA no cuenta: ni puntúa, ni mete a nadie en la lista por sí sola, ni reparte cuota.
   *
   * Existe para la página pública de un enlace compartido (`/r/:token`), donde todos los candidatos son del
   * MISMO autor por definición —solo se sugieren otros análisis suyos— y por tanto la firma no distingue a
   * ninguno de los demás: premiarla subiría a todos por igual (que es no hacer nada con más números) y, peor,
   * dejaría entrar en el bloque cualquier análisis suyo aunque no tenga nada que ver con lo que se está
   * leyendo. Con esto, ahí solo relacionan el juego, la saga y el género, que es lo que de verdad informa.
   *
   * El tope por autor se desactiva con la misma llave y por el mismo motivo: si la firma no es una dimensión,
   * repartir cuota por ella dejaría el bloque en `maxPerAuthor` tarjetas.
   */
  ignoreAuthorLink?: boolean;
}

/* ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
   LOS MANDOS DEL BLOQUE. Todo lo que decide QUÉ sale y EN QUÉ ORDEN está aquí y en ningún otro sitio: para
   cambiar el criterio no hay que tocar una línea de lógica, solo estos números.

   La puntuación de una reseña es la suma de cuatro cosas:

       puntos = vínculo de juego (mismo juego o misma saga) + premio de autor + refuerzo de género
                + descuento por ser tuya

   y la lista se ordena de más a menos. Con los valores de abajo, el orden que sale es:

       mismo juego + género ......... 130      · tuya: 115
       saga + autor + género ........ 115      · tuya:  75
       mismo juego .................. 100      · tuya:  85
       saga + género ................. 90      · tuya:  75
       saga + autor .................. 85      · tuya:  45
       saga .......................... 60      · tuya:  45
       mismo autor + género .......... 55      · tuya:  15
       género ........................ 30      · tuya:  15   (+10 por género extra en común, hasta +20)
       mismo autor ................... 25      · tuya: -15

   Tres decisiones que explican esos números:

   · LA SAGA PESA CASI COMO EL MISMO JUEGO (60 contra 100) Y MUCHO MÁS QUE LA FIRMA. Otra entrega de la saga que
     estás leyendo habla casi de lo mismo: comparte mundo, sistema y a menudo la discusión entera. Por eso
     `saga + género` (90) se pone por delante de cualquier cosa que solo comparta autor (55 como mucho).
   · EL GÉNERO PESA MÁS QUE EL AUTOR (30 contra 25). Que alguien haya escrito de otro juego del género que estás
     leyendo dice más que el mero hecho de ser la misma firma.
   · LO TUYO RESTA, MENOS EN EL MISMO JUEGO. Tu propia opinión ya la conoces, así que en igualdad de condiciones
     va detrás de la de otra persona; pero sobre el MISMO juego sí interesa comparar, y ahí los 100 del vínculo
     dejan tu reseña arriba de sobra. Cuando no hay nada de nadie más, las tuyas siguen saliendo: restar las
     baja, no las elimina.

   Subir `SCORE_GENRE` por encima de 75 haría que «mismo autor + género» adelantara a «mismo juego»; ponerlo a 0
   deja el género sin efecto. Subir `SCORE_SAGA` por encima de 100 pondría otra entrega de la saga por delante de
   otra opinión sobre el mismo juego, que es justo lo que no se quiere; ponerlo a 0 deja la saga sin efecto y el
   bloque vuelve a relacionar solo por juego, autor y género.
   ──────────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** Otra persona ha reseñado el MISMO juego que estás leyendo. El vínculo de más valor. */
const SCORE_SAME_GAME = 100;
/**
 * Otra entrega de la MISMA SAGA. Lo más cerca del mismo juego que se puede estar sin serlo, y por eso pesa más
 * que el género y que la firma juntos: quien lee sobre «Persona 5» quiere leer sobre Persona.
 *
 * No se cobra sobre el mismo juego, donde la saga coincide por definición y no añade información: sumarlo allí
 * subiría a TODAS las del mismo juego por igual, que es no hacer nada con más números.
 */
const SCORE_SAGA = 60;
/**
 * Otra reseña de QUIEN FIRMA la que estás leyendo. Solo lo cobran las AJENAS: es un premio por seguir leyendo a
 * esa persona, y eso no significa nada cuando la persona eres tú (una reseña tuya en ese caso se queda con el
 * descuento de abajo y nada más).
 */
const SCORE_SAME_AUTHOR = 25;
/**
 * Descuento por ser TUYA la reseña que se ofrece. Tu opinión ya la conoces, así que a igualdad de todo lo demás
 * va detrás de la de otra persona. No la excluye: si no hay nada de nadie más, tus reseñas siguen apareciendo.
 */
const SCORE_OWN = -15;

/**
 * El género SUMA, no clasifica.
 *
 * Antes era el tercer motivo y funcionaba como los otros dos: excluyente, y solo se miraba en quien no fuera ni
 * del mismo juego ni del mismo autor. Con eso, compartir género no servía absolutamente de nada en las reseñas
 * que ya entraban por otra vía —de dos análisis de la misma persona, el del género que estás leyendo salía igual
 * de arriba que el de un juego que no tiene nada que ver—, y eso es justo lo contrario de lo que el género
 * aporta: no es una manera de entrar en la lista, es una razón para estar más arriba dentro de ella.
 *
 * Así, `mismo juego + mismo género` (130) va por delante de `mismo juego` (100), y `más de esta persona + mismo
 * género` (55) por delante de `más de esta persona` (25); y quien SOLO comparte género sigue entrando, que es lo
 * que era antes. La saga se suma igual y por el mismo motivo.
 */
const SCORE_GENRE = 30;
/** Cada género compartido DE MÁS (el primero ya va en `SCORE_GENRE`): 2 géneros 40, 3 géneros 50, y ahí el tope. */
const SCORE_GENRE_EXTRA = 10;
const SCORE_GENRE_EXTRA_MAX = 20;

/**
 * Cuántas candidatas devuelve el ranking. NO es lo que se ve: el bloque las pinta en rejilla y enseña las que
 * llenen filas completas según el ancho, así que este número es la RESERVA de la que tira. Conviene que sobren
 * —una pantalla ancha con cinco columnas quiere diez para dos filas— y las que no caben no cuestan nada.
 */
const DEFAULT_LIMIT = 15;
/**
 * Tope por autor. Sin él, una amistad prolífica copaba el bloque entero por «más de esta persona» y la lista
 * mezclada dejaba de estar mezclada. Bajarlo a 1 da más variedad de gente; subirlo, más de quien más escribe.
 */
const DEFAULT_MAX_PER_AUTHOR = 3;
/** Tope por tipo de vínculo, por lo mismo: que ninguno de ellos se lleve el bloque él solo. */
const DEFAULT_MAX_PER_REASON = 6;

/**
 * Identidad de autor a efectos de comparación.
 *
 * Lo propio se compara por `isOwn` y no por `authorId` porque una reseña propia llega con dos identificadores
 * distintos según la puerta: el pseudónimo público del gist si viene del canal, y lo que ponga el recolector si
 * viene de la biblioteca. Compararlos entre sí dejaría el ancla fuera de su propia exclusión, y la reseña
 * abierta aparecería recomendándose a sí misma.
 *
 * El espacio inicial hace de prefijo imposible: ningún `actorProfileId` empieza por él, así que la identidad
 * propia no puede chocar con la de nadie.
 */
function authorKey(entry: { authorId: string; isOwn: boolean }): string {
  return entry.isOwn ? ' own' : String(entry.authorId || '');
}

/** Géneros comparables: normalizados y sin repetir. La grafía visible se conserva aparte. */
function genreKeys(genres: readonly string[] | undefined): Set<string> {
  const keys = new Set<string>();
  for (const genre of genres || []) {
    const key = normalizeName(String(genre || ''));
    if (key) {
      keys.add(key);
    }
  }
  return keys;
}

/** ¿Es un candidato que valga la pena ofrecer? Con nombre, con texto y con una fecha que `Date` sepa pintar. */
function isOfferable(candidate: RelatedReviewCandidate): boolean {
  return Boolean(
    gameTitleKey(candidate.gameName)
    && String(candidate.snippet || '').trim()
    && isPublishableTimestamp(candidate.updatedAt),
  );
}

/**
 * Cuál de dos versiones de la MISMA reseña se queda. Negativo = gana `a`.
 *
 * El texto completo primero: es el único criterio que no puede decidirse por fecha, porque publicar ocurre
 * después de escribir y la copia publicada es la recortada.
 */
function compareDuplicates(a: RelatedReviewCandidate, b: RelatedReviewCandidate): number {
  if (Boolean(a.full) !== Boolean(b.full)) {
    return a.full ? -1 : 1;
  }
  return b.updatedAt - a.updatedAt || a.key.localeCompare(b.key);
}

/**
 * De los candidatos que hablan del MISMO juego y son del MISMO autor, deja uno solo.
 *
 * Pasa por dos caminos: una reseña propia que llega a la vez por la biblioteca y por el canal, y un mismo autor
 * duplicado al fusionar dos gists sociales (caso que el directorio ya contempla al hidratar).
 */
function dedupeCandidates(candidates: readonly RelatedReviewCandidate[]): RelatedReviewCandidate[] {
  const best = new Map<string, RelatedReviewCandidate>();

  for (const candidate of candidates) {
    if (!isOfferable(candidate)) {
      continue;
    }
    const key = `${authorKey(candidate)}|${gameTitleKey(candidate.gameName)}`;
    const current = best.get(key);
    if (!current || compareDuplicates(candidate, current) < 0) {
      best.set(key, candidate);
    }
  }

  return [...best.values()];
}

/**
 * Reseñas que ofrecer al final de la que se está leyendo, ya ordenadas y recortadas.
 *
 * La puntuación de cada una es su VÍNCULO (mismo juego, misma saga o mismo autor) más lo que sume compartir
 * género. Por eso el género no aparece en `reason` salvo cuando es lo único que hay: no es una manera de entrar
 * en la lista sino una razón para subir dentro de ella, y quien entra solo por él lleva `reason: 'genre'`
 * únicamente para que las cuotas puedan contarlo.
 *
 * Las cuotas se aplican al recorrer la lista YA ordenada, no antes: así el bloque se llena siempre con lo mejor
 * disponible y un autor (o un tipo de vínculo) solo cede el sitio cuando ya ha puesto lo suyo.
 */
export function rankRelatedReviews(
  anchor: RelatedReviewAnchor,
  candidates: readonly RelatedReviewCandidate[],
  genresByName: ReadonlyMap<string, readonly string[]> = new Map(),
  options: RankRelatedOptions = {},
): RelatedReview[] {
  const limit = Math.max(0, options.limit ?? DEFAULT_LIMIT);
  const authorLinkCounts = options.ignoreAuthorLink !== true;
  // Sin señal de autor no hay cuota de autor que repartir: todos los candidatos son de la misma firma, así que
  // el tope la aplicaría a la lista entera y la dejaría en tres tarjetas.
  const maxPerAuthor = authorLinkCounts ? Math.max(1, options.maxPerAuthor ?? DEFAULT_MAX_PER_AUTHOR) : Infinity;
  const maxPerReason = Math.max(1, options.maxPerReason ?? DEFAULT_MAX_PER_REASON);
  const anchorNameKey = gameTitleKey(anchor.gameName);
  if (limit === 0 || !anchorNameKey) {
    return [];
  }

  const anchorAuthor = authorKey(anchor);
  // Los géneros del ancla pueden venir dados (la pantalla del detalle ya los tiene) o salir del índice.
  const anchorGenres = genreKeys(anchor.genres?.length ? anchor.genres : genresByName.get(anchorNameKey));

  const scored: RelatedReview[] = [];

  for (const candidate of dedupeCandidates(candidates)) {
    const nameKey = gameTitleKey(candidate.gameName);
    const sameAuthor = authorKey(candidate) === anchorAuthor;
    // La firma como VÍNCULO. Se separa de `sameAuthor` porque la exclusión de la reseña abierta sigue
    // necesitando saber que es del mismo autor aunque su firma no puntúe (ver `ignoreAuthorLink`).
    const authorLink = sameAuthor && authorLinkCounts;
    const sameGame = nameKey === anchorNameKey;
    // La reseña abierta no se ofrece a sí misma. Es el mismo autor hablando del mismo juego: tras el dedupe, la
    // única entrada que puede cumplir las dos condiciones a la vez.
    if (sameAuthor && sameGame) {
      continue;
    }

    // Géneros en común. Lo normal es no conocerlos —no viajan por el canal—, y eso no es un fallo: sin ellos la
    // reseña se ordena por su vínculo a secas, que es lo único que se sabe de ella.
    const sharedGenres = [...genreKeys(genresByName.get(nameKey))].filter((key) => anchorGenres.has(key)).length;
    const genreScore = sharedGenres === 0
      ? 0
      : SCORE_GENRE + Math.min((sharedGenres - 1) * SCORE_GENRE_EXTRA, SCORE_GENRE_EXTRA_MAX);

    // Lo tuyo resta siempre: tu opinión ya la conoces. No te deja fuera —cuando no hay nada de nadie más, tus
    // reseñas siguen saliendo—, solo te pone detrás a igualdad de lo demás.
    const ownScore = candidate.isOwn ? SCORE_OWN : 0;

    // El premio de autor es por seguir leyendo a ESA persona, así que no lo cobra lo propio: una reseña tuya se
    // queda con el vínculo de juego y el descuento, y nada más.
    const authorScore = authorLink && !candidate.isOwn ? SCORE_SAME_AUTHOR : 0;

    if (sameGame) {
      // La saga no se suma aquí: sobre el mismo juego coincide por definición y no distingue a nadie.
      scored.push({ ...candidate, reason: 'same-game', score: SCORE_SAME_GAME + genreScore + ownScore });
      continue;
    }
    // Otra entrega de la saga que se está leyendo. Se reconoce sobre la misma clave con la que se cruzan los
    // nombres, y solo cuenta cuando el nombre compartido nombra algo: ver `sharedSagaName`.
    if (sharedSagaName(anchorNameKey, nameKey)) {
      scored.push({ ...candidate, reason: 'saga', score: SCORE_SAGA + authorScore + genreScore + ownScore });
      continue;
    }
    if (authorLink) {
      scored.push({ ...candidate, reason: 'same-author', score: authorScore + genreScore + ownScore });
      continue;
    }
    // Sin vínculo de juego, de saga ni de autor, el género es lo único que puede meterla en la lista.
    if (genreScore > 0) {
      scored.push({ ...candidate, reason: 'genre', score: genreScore + ownScore });
    }
  }

  scored.sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt || a.key.localeCompare(b.key));

  const byAuthor = new Map<string, number>();
  const byReason = new Map<RelatedReason, number>();
  const picked: RelatedReview[] = [];

  for (const entry of scored) {
    if (picked.length >= limit) {
      break;
    }
    const author = authorKey(entry);
    if ((byAuthor.get(author) || 0) >= maxPerAuthor || (byReason.get(entry.reason) || 0) >= maxPerReason) {
      continue;
    }
    byAuthor.set(author, (byAuthor.get(author) || 0) + 1);
    byReason.set(entry.reason, (byReason.get(entry.reason) || 0) + 1);
    picked.push(entry);
  }

  return picked;
}
