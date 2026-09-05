// GET /api/share/related/:token — los análisis que se sugieren al pie de un enlace público.
//
// SIN SESIÓN, igual que el artículo: quien abre un enlace compartido no tiene por qué tener cuenta.
//
// QUÉ SE SUGIERE. Otros enlaces públicos DEL MISMO AUTOR, y de esos solo los que hablan del mismo juego, de la
// misma saga o comparten género con el que se está leyendo. Nada de otras personas: el bloque de relacionados
// que mezcla firmas vive en el espacio social, donde hay una amistad que lo justifica, y esta página la abre un
// desconocido. Aquí la única relación que existe es «lo ha escrito quien firma lo que estás leyendo».
//
// POR QUÉ FILTRA EL SERVIDOR Y NO EL CLIENTE. Porque el filtro es también el límite de lo que se enseña: mandar
// la lista entera de enlaces del autor para que el navegador se quedara con tres la dejaría igualmente a la
// vista en la respuesta. Lo que no se sugiere, no sale de aquí.
//
// QUÉ NO VIAJA. Ni el uid del autor —que este endpoint sí conoce, porque lo necesita para encontrar sus otros
// enlaces— ni el texto completo de ninguna reseña: solo un adelanto. Para leer una entera se abre SU enlace,
// que es el gesto que su autor autorizó al publicarla.
//
// EL ORDEN lo pone `rankRelatedReviews`, el mismo módulo que ordena el bloque del hub social, con la señal de
// autor apagada (`ignoreAuthorLink`): aquí todas las candidatas son de la misma firma, así que premiarla no
// distinguiría a ninguna y además metería en el bloque análisis suyos que no tienen nada que ver.
import { rankRelatedReviews, type RelatedReviewCandidate } from '../../../../src/core/social/relatedReviews';
import { gameTitleKey } from '../../../../src/core/utils/gameTitleKey';
import { SHARE_MAX_ACTIVE_CEILING } from '../../../../src/core/constants/tiers';
import { isValidToken, json } from '../../../_lib/http';
import { drainPages, shareKey, userSharePrefix, type Env, type ShareIndexMetadata } from '../../../_lib/keys';
import { readOwner } from '../../../_lib/shares';

/**
 * Cuántas tarjetas se devuelven como mucho.
 *
 * El bloque las pinta en rejilla y enseña las que llenen filas enteras, así que esto es la reserva de la que
 * tira: seis dan dos filas de tres en una pantalla ancha y tres en el móvil. Es también el techo de exposición
 * —desde un enlace no se puede enumerar todo lo que esa persona tiene publicado, solo lo que de verdad se
 * parece a lo que se está leyendo, y como mucho esto.
 */
const RELATED_LIMIT = 6;

/** Adelanto del texto: el mismo recorte que el canal social (ver `buildReviewSnippet` en `socialProjection`). */
const SNIPPET_MAX_CHARS = 160;

interface StoredArticle {
  gameName?: unknown;
  grade?: unknown;
  rating?: unknown;
  review?: unknown;
  genres?: unknown;
  reviewedAt?: unknown;
  createdAt?: unknown;
  expiresAt?: unknown;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const asNumber = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/**
 * El TTL de KV borra solo, pero no al instante. Se comprueba igual, por lo mismo que en el endpoint del
 * artículo: un enlace caducado no debe seguir vivo unas horas por un detalle del almacén, y menos aún colarse
 * como sugerencia de otro que sí lo está.
 */
const isExpired = (article: StoredArticle, now: number): boolean => {
  const expiresAt = asNumber(article.expiresAt);
  return expiresAt !== null && expiresAt > 0 && expiresAt < now;
};

export async function onRequestGet(context: { request: Request; env: Env; params: { token: string } }): Promise<Response> {
  // Lista vacía y no un 404: «no hay nada que sugerir» es el caso NORMAL (un autor con un solo enlace, o con
  // varios que no se parecen entre sí), no un error, y el pie de la página simplemente no se pinta.
  // Caché corta, como el artículo: el autor puede retirar cualquiera de estos enlaces en cualquier momento.
  const empty = () => json({ items: [] }, 200, { 'Cache-Control': 'public, max-age=60' });

  const token = String(context.params.token || '');
  if (!isValidToken(token) || !context.env?.SHARES) {
    return empty();
  }
  const kv = context.env.SHARES;
  const now = Date.now();

  const anchor = (await kv.get(shareKey(token), 'json')) as StoredArticle | null;
  const anchorName = anchor ? text(anchor.gameName) : '';
  if (!anchor || !anchorName || isExpired(anchor, now)) {
    return empty();
  }

  // De quién es el enlace. Es la ÚNICA razón por la que este endpoint lee `owner:{token}`, y el uid se queda
  // aquí: no viaja en la respuesta ni en ninguna de las tarjetas.
  const owner = await readOwner(kv, token);
  if (!owner) {
    return empty();
  }

  const prefix = userSharePrefix(owner);
  const indexKeys = await drainPages<ShareIndexMetadata>((cursor) =>
    kv.list<ShareIndexMetadata>({ prefix, cursor }),
  );
  const others = indexKeys
    .map((key) => key.name.slice(prefix.length))
    .filter((other) => other !== token && isValidToken(other))
    // Techo de lecturas por petición: nadie puede tener más enlaces activos que esto (ver `resolveShareQuota`),
    // así que en la práctica no recorta nada; está para que un índice descuadrado no dispare las lecturas.
    .slice(0, SHARE_MAX_ACTIVE_CEILING);

  const articles = await Promise.all(
    others.map(async (other) => [other, (await kv.get(shareKey(other), 'json')) as StoredArticle | null] as const),
  );

  const candidates: RelatedReviewCandidate[] = [];
  // Índice de géneros por título, que es como `rankRelatedReviews` los cruza. Aquí SÍ se conocen —viajan en el
  // artículo público—, al revés que en el hub social, donde no pasan por el canal.
  const genresByName = new Map<string, string[]>();

  for (const [other, article] of articles) {
    if (!article || isExpired(article, now)) {
      continue;
    }
    const gameName = text(article.gameName);
    const review = text(article.review);
    if (!gameName || !review.trim()) {
      continue;
    }
    const genres = list(article.genres);
    if (genres.length > 0) {
      genresByName.set(gameTitleKey(gameName), genres);
    }
    candidates.push({
      // El token hace de clave: es lo que identifica la tarjeta y, en el cliente, su dirección (`/r/{token}`).
      key: other,
      // El `id` de un juego es de cada biblioteca y no significa nada fuera de ella; el cruce va por nombre.
      gameId: 0,
      gameName,
      // La firma se deja vacía a propósito: todas son del mismo autor y su nombre ya está en el artículo que se
      // está leyendo. Que no puntúe lo garantiza `ignoreAuthorLink`, no este campo.
      authorId: '',
      authorName: '',
      isOwn: false,
      rating: asNumber(article.rating) ?? 0,
      grade: asNumber(article.grade),
      snippet: review.slice(0, SNIPPET_MAX_CHARS).trimEnd(),
      // `reviewedAt` puede venir a 0 (una ficha sin fecha); entonces vale el sello de publicación, que lo pone
      // siempre el servidor. Sin uno de los dos, `rankRelatedReviews` descarta la candidata.
      updatedAt: asNumber(article.reviewedAt) || asNumber(article.createdAt) || 0,
    });
  }

  const ranked = rankRelatedReviews(
    { gameName: anchorName, authorId: '', isOwn: false, genres: list(anchor.genres) },
    candidates,
    genresByName,
    { limit: RELATED_LIMIT, maxPerReason: RELATED_LIMIT, ignoreAuthorLink: true },
  );

  return json(
    {
      items: ranked.map((entry) => ({
        token: entry.key,
        gameName: entry.gameName,
        grade: entry.grade,
        rating: entry.rating || null,
        snippet: entry.snippet,
        reviewedAt: entry.updatedAt,
      })),
    },
    200,
    { 'Cache-Control': 'public, max-age=60' },
  );
}
