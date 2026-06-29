// Schema Zod del gist social (canal PÚBLICO). Es una allowlist ESTRICTA: solo los campos permitidos.
// Complementa a `assertNoSocialPrivateFields` (denylist) con una garantía positiva — cualquier campo extra
// (p.ej. un `review`/`score`/`hours` filtrado por un bug) hace fallar la validación ANTES de subir el gist.
// Modernización (Fase 6.1): integridad + privacidad verificadas en runtime con Zod.
import { z } from 'zod';

const tabId = z.enum(['c', 'v', 'e', 'p']);

// ST8 — cotas de longitud/rango (defensa positiva): un bug aguas arriba o un gist construido a mano no puede
// publicar texto sin límite ni un rating fuera de rango. Generosas: nunca rechazan datos válidos actuales.
const NAME_MAX = 500;
const SNIPPET_MAX = 200; // el snippet real es ≤160 (SNIPPET_MAX_CHARS); margen por trimEnd/legacy
const TEXT_MAX = 5000;
const ratingSchema = z.number().min(0).max(5);

const idName = z.strictObject({
  id: z.number(),
  name: z.string().max(NAME_MAX),
});

const sharedGame = z.strictObject({
  id: z.number(),
  name: z.string().max(NAME_MAX),
  platforms: z.array(z.string()),
  genres: z.array(z.string()),
  rating: ratingSchema,
  snippet: z.string().max(SNIPPET_MAX),
});

const visibility = z.strictObject({
  hiddenTabs: z.array(tabId),
  hideReplayable: z.boolean(),
  hideRetry: z.boolean(),
  hideGameTime: z.boolean(),
  showPhoto: z.boolean(),
});

const profile = z.strictObject({
  name: z.string().max(NAME_MAX),
  private: z.boolean(),
  favoriteGames: z.array(idName),
  // ST3: `profile.recommendations` eliminado (código muerto). La lectura tolera gists viejos que lo lleven.
  visibility,
  // sharedLists es Partial<Record<TabId, SharedGame[]>>: claves 'c'|'v'|'e'|'p', subconjunto permitido.
  sharedLists: z.record(z.string(), z.array(sharedGame)),
  // Foto de perfil pública (opcional): solo presente si el usuario la comparte. URL http(s) acotada.
  photoURL: z.string().max(2048).optional(),
});

const activity = z.strictObject({
  id: z.string(),
  key: z.string(),
  type: z.enum(['recommendation', 'review']),
  actorProfileId: z.string(), // 6.2b: pseudónimo público (antes `actorUid`)
  actorName: z.string().max(NAME_MAX),
  gameId: z.number(),
  gameName: z.string().max(NAME_MAX),
  rating: ratingSchema,
  recommendationText: z.string().max(TEXT_MAX),
  snippet: z.string().max(SNIPPET_MAX),
  createdAt: z.number(),
  updatedAt: z.number(),
});

// F3 — publicación de texto libre (noticias/enlaces). Allowlist estricta: solo estos campos. El texto va cotado;
// los hipervínculos se derivan del propio texto al renderizar (no hay HTML ni campo de enlaces).
const post = z.strictObject({
  id: z.string(),
  authorProfileId: z.string(),
  authorName: z.string().max(NAME_MAX),
  text: z.string().max(TEXT_MAX),
  createdAt: z.number(),
  updatedAt: z.number(),
});

// A6 (gated): índice de chunking del gist social. Aditivo y opcional → un ancla con overflow de `sharedLists`
// (gistId null = mismo gist) valida; los gists planos sin chunking siguen validando igual.
const chunkRef = z.strictObject({
  chunkId: z.string(),
  gistId: z.string().nullable(),
  sizeKB: z.number(),
  updatedAt: z.number(),
});
const chunkIndex = z.strictObject({
  strategy: z.literal('size'),
  maxChunkKB: z.number(),
  chunks: z.array(chunkRef),
});

export const socialGistSchema = z.strictObject({
  profile,
  // ST3: `recommendations` top-level eliminado (código muerto; se fusionaba en activity). La lectura tolera gists viejos.
  activity: z.array(activity),
  // F3 (aditivo, Opción B): opcional → gists sin posts siguen validando; clientes viejos ignoran el campo en lectura.
  posts: z.array(post).optional(),
  updatedAt: z.number(),
  schemaVersion: z.number(), // 6.2b: 2 = identidad por profileId
  // A6 (gated): presente solo cuando la escritura multi-fichero está activa y hay overflow de sharedLists.
  chunkIndex: chunkIndex.optional(),
});

/** Valida la proyección social antes de escribir. Lanza con detalle si hay campos extra o tipos inválidos. */
export function assertValidSocialGist(data: unknown): void {
  const result = socialGistSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join('; ');
    throw new Error(`Gist social inválido (schema): ${issues}`);
  }
}
