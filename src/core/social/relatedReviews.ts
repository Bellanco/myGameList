// Reseñas RELACIONADAS: las que se ofrecen al final de una reseña abierta para poder seguir leyendo.
//
// Tres motivos, y el orden entre ellos no es un gusto sino lo que cada uno vale para quien acaba de leer:
//
//   1. MISMO JUEGO. Otra persona hablando de lo que acabas de leer. Es el motivo con más valor —comparar dos
//      opiniones sobre lo mismo es media razón de tener un espacio social— y el único de cobertura completa.
//   2. MÁS DE ESTA PERSONA. Quien te ha convencido (o no) escribiendo esto tiene más escrito. Siempre hay
//      material, y es la navegación natural hacia su perfil.
//   3. MISMO GÉNERO. El más débil de los tres y, además, el de cobertura irregular (ver más abajo).
//
// EL CRUCE ES POR NOMBRE, NO POR ID. El `id` de un juego se asigna por biblioteca (`max(ids)+1` en
// `useGameListViewModel.saveDraft`), así que el juego 42 de una amistad no tiene nada que ver con el 42 propio.
// El único identificador que significa lo mismo en dos aparatos distintos es el título, y de reconocerlo escrito
// de dos maneras se encarga `gameTitleKey`, que tiene que ser la MISMA función con la que el recolector indexe
// los juegos o el cruce falla en silencio.
//
// Los GÉNEROS, en cambio, se comparan con `normalizeName` a secas. No son títulos: nadie escribe «Acción
// Remastered» ni «The Acción», y aplicarles las reglas de los títulos solo añadiría formas de equivocarse.
//
// LOS GÉNEROS NO VIAJAN POR EL CANAL. Una entrada de actividad lleva juego, nota y adelanto de texto, y las
// listas compartidas quedan vacías para perfiles ajenos a propósito (decisión E3 de privacidad). Los géneros
// solo se conocen de la biblioteca propia y de los listados de la amistad que se haya abierto, así que este
// módulo NO los busca: los recibe ya indexados y trata la ausencia como lo normal que es. Un candidato sin
// géneros conocidos no puede relacionarse por ese motivo; los otros dos siguen funcionando.
//
// PRIVACIDAD. No hay nada que decidir aquí: el directorio solo lee el gist social de las amistades y el propio
// (`useSocialDirectory`), de modo que todo lo que puede llegar como candidato ya era visible para quien mira.
// Este módulo no amplía el alcance de nada; reordena lo que ya se podía leer.
//
// PURO: sin reloj, sin E/S y sin estado. Recibe los candidatos aplanados y devuelve una lista ordenada.
import { gameTitleKey } from '../utils/gameTitleKey';
import { normalizeName } from '../roulette/roulette';
import { isPublishableTimestamp } from './moveActivity';

/** Por qué se ofrece una reseña. Es también lo que rotula el chip que la acompaña. */
export type RelatedReason = 'same-game' | 'same-author' | 'genre';

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
  reason: RelatedReason;
  /** Género que motivó la relación; solo con `reason: 'genre'`, y con la grafía del ANCLA (es la que rotula). */
  genre?: string;
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
  /** Tope por motivo, por lo mismo: que ninguno de los tres se lleve el bloque él solo. */
  maxPerReason?: number;
}

const DEFAULT_LIMIT = 6;
const DEFAULT_MAX_PER_AUTHOR = 2;
const DEFAULT_MAX_PER_REASON = 3;

/** Puntuación base de cada motivo. La distancia entre ellas es la jerarquía descrita en la cabecera. */
const SCORE_SAME_GAME = 100;
const SCORE_SAME_AUTHOR = 60;
const SCORE_GENRE = 40;
/** Cada género compartido de más acerca dos juegos, pero nunca hasta alcanzar al motivo de encima. */
const SCORE_GENRE_EXTRA = 5;
const SCORE_GENRE_EXTRA_MAX = 15;

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
 * Cada candidato se queda con UN motivo, el de más peso de los que cumple: quien ha reseñado el mismo juego se
 * ofrece por eso aunque además comparta género, porque es lo que mejor explica por qué está ahí.
 *
 * Las cuotas se aplican al recorrer la lista YA ordenada, no antes: así el bloque se llena siempre con lo mejor
 * disponible y un autor (o un motivo) solo cede el sitio cuando ya ha puesto lo suyo.
 */
export function rankRelatedReviews(
  anchor: RelatedReviewAnchor,
  candidates: readonly RelatedReviewCandidate[],
  genresByName: ReadonlyMap<string, readonly string[]> = new Map(),
  options: RankRelatedOptions = {},
): RelatedReview[] {
  const limit = Math.max(0, options.limit ?? DEFAULT_LIMIT);
  const maxPerAuthor = Math.max(1, options.maxPerAuthor ?? DEFAULT_MAX_PER_AUTHOR);
  const maxPerReason = Math.max(1, options.maxPerReason ?? DEFAULT_MAX_PER_REASON);
  const anchorNameKey = gameTitleKey(anchor.gameName);
  if (limit === 0 || !anchorNameKey) {
    return [];
  }

  const anchorAuthor = authorKey(anchor);
  // Los géneros del ancla pueden venir dados (la pantalla del detalle ya los tiene) o salir del índice. La
  // grafía se conserva para rotular el chip: al lector le sirve «Acción», no la clave con la que se comparó.
  const anchorGenres = (anchor.genres?.length ? anchor.genres : genresByName.get(anchorNameKey)) || [];
  const anchorGenreLabels = new Map<string, string>();
  for (const genre of anchorGenres) {
    const key = normalizeName(String(genre || ''));
    if (key && !anchorGenreLabels.has(key)) {
      anchorGenreLabels.set(key, String(genre).trim());
    }
  }

  const scored: RelatedReview[] = [];

  for (const candidate of dedupeCandidates(candidates)) {
    const nameKey = gameTitleKey(candidate.gameName);
    const sameAuthor = authorKey(candidate) === anchorAuthor;
    const sameGame = nameKey === anchorNameKey;
    // La reseña abierta no se ofrece a sí misma. Es el mismo autor hablando del mismo juego: tras el dedupe, la
    // única entrada que puede cumplir las dos condiciones a la vez.
    if (sameAuthor && sameGame) {
      continue;
    }

    if (sameGame) {
      scored.push({ ...candidate, reason: 'same-game', score: SCORE_SAME_GAME });
      continue;
    }
    if (sameAuthor) {
      scored.push({ ...candidate, reason: 'same-author', score: SCORE_SAME_AUTHOR });
      continue;
    }

    // Género: solo si se conocen los dos lados. Lo normal es que no se conozcan (los géneros no viajan por el
    // canal), y por eso la ausencia no es un fallo: este candidato simplemente no entra por aquí.
    const shared = genreKeys(genresByName.get(nameKey));
    // Se recorren los géneros DEL ANCLA y no los del candidato porque el bloque cuelga de la reseña abierta: con
    // varios géneros en común, el chip tiene que rotular el primero de ella, que es desde donde se lee.
    const matched = [...anchorGenreLabels.entries()].filter(([key]) => shared.has(key));
    if (matched.length === 0) {
      continue;
    }
    const extra = Math.min((matched.length - 1) * SCORE_GENRE_EXTRA, SCORE_GENRE_EXTRA_MAX);
    scored.push({ ...candidate, reason: 'genre', genre: matched[0][1], score: SCORE_GENRE + extra });
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
