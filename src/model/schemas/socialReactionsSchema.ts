// Schema Zod del fichero de «me gusta» del gist social (`SOCIAL_REACTIONS_FILENAME`). Canal PÚBLICO, así que es una
// allowlist ESTRICTA, igual que `socialGistSchema`: cualquier campo de más hace fallar la validación ANTES de subir.
// Solo corre al escribir el propio; la lectura del de otro va por `normalizeReactions`, sin Zod.
import { z } from 'zod';
import {
  SOCIAL_ID_MAX,
  SOCIAL_REACTION_TOMBSTONES_MAX,
  SOCIAL_REACTIONS_MAX,
} from '../../core/constants/socialLimits';
import { REACTIONS_FILE_VERSION } from '../../core/social/reactions';

const reaction = z.strictObject({
  on: z.enum(['activity', 'post']),
  // Pseudónimo público del autor; nunca el uid de Firebase (no hay forma de distinguirlos por la forma, pero el
  // escritor solo recibe `profileId`).
  to: z.string().min(1).max(SOCIAL_ID_MAX),
  item: z.string().min(1).max(SOCIAL_ID_MAX),
  kind: z.literal('like'),
  at: z.number().positive(),
  del: z.literal(true).optional(),
});

export const socialReactionsSchema = z.strictObject({
  v: z.literal(REACTIONS_FILE_VERSION),
  updatedAt: z.number(),
  items: z.array(reaction).max(SOCIAL_REACTIONS_MAX + SOCIAL_REACTION_TOMBSTONES_MAX),
});

/** Valida el fichero de reacciones antes de escribir. Lanza con detalle si hay campos extra o tipos inválidos. */
export function assertValidSocialReactions(data: unknown): void {
  const result = socialReactionsSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join('; ');
    throw new Error(`No se han guardado tus «me gusta»: hay datos con un formato inesperado. Detalle: ${issues}`);
  }
}
