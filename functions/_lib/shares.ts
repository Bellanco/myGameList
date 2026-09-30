// Crear, renovar y retirar enlaces. Es la única pieza que escribe en KV, para que las tres claves de un enlace
// (artículo, propietario e índice) no puedan quedar descuadradas por dos endpoints que hagan las cosas distinto.
// El índice de sugeridos (`relidx:{uid}`) lo mantiene `relatedIndex.ts`, y se le llama desde aquí por lo mismo.
import { assertValidSharedReview } from '../../src/model/schemas/shareSchema';
import { shareExpiresAt, type ShareQuota } from '../../src/core/constants/tiers';
import { newToken } from './http';
import { ownerKey, shareKey, userShareKey, type KVNamespace, type ShareIndexMetadata } from './keys';
import { entryFromArticle, updateRelatedIndex } from './relatedIndex';

/**
 * Lo que el cliente propone publicar.
 *
 * Fíjate en lo que NO está: ni `authorNick`, ni `createdAt`, ni `expiresAt`, ni la versión. Todo eso lo pone el
 * servidor. El nick sale del perfil de Firestore leído con el token de quien publica, así que nadie puede firmar
 * una reseña con el nombre de otro; y la caducidad sale de su rango, así que la cuota es una barrera y no una
 * sugerencia.
 */
export interface ShareDraft {
  gameId: number;
  gameName: string;
  grade: number | null;
  rating: number | null;
  review: string;
  platforms: string[];
  genres: string[];
  strengths: string[];
  weaknesses: string[];
  reviewedAt: number;
}

const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const numberOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/**
 * Normaliza el cuerpo recibido a un borrador. Coge SOLO los campos esperados: cualquier otra cosa que venga en el
 * JSON se queda fuera aquí mismo, antes de que el esquema tenga siquiera que rechazarla.
 */
export function draftFromBody(body: Record<string, unknown>): ShareDraft | null {
  const gameId = Number(body.gameId);
  const review = typeof body.review === 'string' ? body.review : '';
  const gameName = typeof body.gameName === 'string' ? body.gameName : '';
  if (!Number.isFinite(gameId) || !gameName.trim() || !review.trim()) {
    return null;
  }
  return {
    gameId,
    gameName,
    grade: numberOrNull(body.grade),
    rating: numberOrNull(body.rating),
    review,
    platforms: list(body.platforms),
    genres: list(body.genres),
    strengths: list(body.strengths),
    weaknesses: list(body.weaknesses),
    reviewedAt: Number(body.reviewedAt) || 0,
  };
}

export interface PublishResult {
  token: string;
  expiresAt: number;
  renewed: boolean;
}

/**
 * Publica (o renueva) un enlace y devuelve su token.
 *
 * RENOVAR EN VEZ DE DUPLICAR: si el usuario ya tenía compartida esa misma reseña, se reescribe sobre el MISMO
 * token con la caducidad nueva. Así no se le gasta cuota por corregir una errata, y el enlace que ya pasó a sus
 * amigos sigue funcionando en vez de morir en silencio mientras uno nuevo circula en paralelo.
 */
export async function publishShare(input: {
  kv: KVNamespace;
  uid: string;
  draft: ShareDraft;
  nick: string;
  quota: ShareQuota;
  now: number;
  existingToken?: string | null;
  /** Los tokens vivos del autor según su listado, que quien publica ya tiene: con ellos se repara el índice. */
  liveTokens?: readonly string[];
}): Promise<PublishResult> {
  const { kv, uid, draft, nick, quota, now } = input;
  const token = input.existingToken || newToken();
  const expiresAt = shareExpiresAt(quota, now);

  const article = {
    v: 1 as const,
    gameId: draft.gameId,
    gameName: draft.gameName,
    grade: draft.grade,
    rating: draft.rating,
    review: draft.review,
    platforms: draft.platforms,
    genres: draft.genres,
    strengths: draft.strengths,
    weaknesses: draft.weaknesses,
    authorNick: nick,
    reviewedAt: draft.reviewedAt,
    createdAt: now,
    expiresAt,
  };

  // Segunda validación, la que de verdad cuenta: el cliente es manipulable. Lanza si se coló un campo privado o
  // de identidad, y quien llama responde 400 sin escribir nada.
  assertValidSharedReview(article);

  const metadata: ShareIndexMetadata = {
    gameId: draft.gameId,
    gameName: draft.gameName.slice(0, 200), // la metadata de KV está acotada a 1 KB por clave
    createdAt: now,
    expiresAt,
  };
  const expirationTtl = Math.max(60, Math.floor((expiresAt - now) / 1000));

  // El artículo primero: si algo fallara a mitad, es preferible un artículo sin índice (invisible en la pantalla
  // de gestión, pero caduca solo) que un índice que promete un enlace que no existe.
  await kv.put(shareKey(token), JSON.stringify(article), { expirationTtl });
  await kv.put(ownerKey(token), uid, { expirationTtl });
  await kv.put(userShareKey(uid, token), JSON.stringify(metadata), { expirationTtl, metadata });
  // Lo último, y sin poder fallar: un índice sin actualizar solo cuesta sugerencias (ver `relatedIndex.ts`).
  await updateRelatedIndex(
    kv,
    uid,
    { live: input.liveTokens ? [...input.liveTokens, token] : undefined, add: entryFromArticle(token, article) },
    now,
  );

  return { token, expiresAt, renewed: Boolean(input.existingToken) };
}

/**
 * Retira enlaces de un autor: borra las tres claves de cada uno y actualiza su índice de sugeridos UNA vez.
 * Idempotente — borrar lo ya borrado no es un error.
 *
 * Por qué de golpe y no enlace a enlace: el índice es un solo valor que se lee, se cambia y se escribe, y KV no
 * tiene escrituras atómicas. Retirar diez en paralelo con una actualización por cada uno haría que se pisaran
 * entre sí y que sobrevivieran filas de enlaces ya borrados. `everything` es el «retirar todos» (borrado de cuenta,
 * veto con purga): entonces el índice se vacía entero, aunque tuviera alguna fila que el listado ya no conocía.
 */
export async function removeShares(
  kv: KVNamespace,
  uid: string,
  tokens: readonly string[],
  options: { everything?: boolean } = {},
): Promise<void> {
  await Promise.all(
    tokens.flatMap((token) => [kv.delete(shareKey(token)), kv.delete(ownerKey(token)), kv.delete(userShareKey(uid, token))]),
  );
  await updateRelatedIndex(kv, uid, options.everything ? { live: [] } : { remove: tokens }, Date.now());
}

/** Dueño de un enlace, o `null` si ya no existe. */
export async function readOwner(kv: KVNamespace, token: string): Promise<string | null> {
  return kv.get(ownerKey(token));
}
