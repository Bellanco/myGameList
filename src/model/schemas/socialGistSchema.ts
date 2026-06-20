// Schema Zod del gist social (canal PÚBLICO). Es una allowlist ESTRICTA: solo los campos permitidos.
// Complementa a `assertNoSocialPrivateFields` (denylist) con una garantía positiva — cualquier campo extra
// (p.ej. un `review`/`score`/`hours` filtrado por un bug) hace fallar la validación ANTES de subir el gist.
// Modernización (Fase 6.1): integridad + privacidad verificadas en runtime con Zod.
import { z } from 'zod';

const tabId = z.enum(['c', 'v', 'e', 'p']);

const idName = z.strictObject({
  id: z.number(),
  name: z.string(),
});

const sharedGame = z.strictObject({
  id: z.number(),
  name: z.string(),
  platforms: z.array(z.string()),
  genres: z.array(z.string()),
  rating: z.number(),
  snippet: z.string(),
});

const visibility = z.strictObject({
  hiddenTabs: z.array(tabId),
  hideReplayable: z.boolean(),
  hideRetry: z.boolean(),
  hideGameTime: z.boolean(),
});

const profile = z.strictObject({
  name: z.string(),
  private: z.boolean(),
  favoriteGames: z.array(idName),
  recommendations: z.array(idName),
  visibility,
  // sharedLists es Partial<Record<TabId, SharedGame[]>>: claves 'c'|'v'|'e'|'p', subconjunto permitido.
  sharedLists: z.record(z.string(), z.array(sharedGame)),
});

const recommendation = z.strictObject({
  id: z.number(),
  fromUid: z.string(),
  gameId: z.number(),
  gameName: z.string(),
  rating: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const activity = z.strictObject({
  id: z.string(),
  key: z.string(),
  type: z.enum(['recommendation', 'review']),
  actorUid: z.string(),
  actorName: z.string(),
  gameId: z.number(),
  gameName: z.string(),
  rating: z.number(),
  recommendationText: z.string(),
  snippet: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const socialGistSchema = z.strictObject({
  profile,
  recommendations: z.array(recommendation),
  activity: z.array(activity),
  updatedAt: z.number(),
});

/** Valida la proyección social antes de escribir. Lanza con detalle si hay campos extra o tipos inválidos. */
export function assertValidSocialGist(data: unknown): void {
  const result = socialGistSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join('; ');
    throw new Error(`Gist social inválido (schema): ${issues}`);
  }
}
