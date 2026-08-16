// Schema Zod del artículo público que se guarda al compartir una reseña con enlace (canal PÚBLICO, ver
// docs/plan-compartir-resenas.md). Es una allowlist ESTRICTA: solo los campos permitidos y todos acotados.
//
// POR QUÉ IMPORTA MÁS QUE UN ESQUEMA NORMAL: esta es la ÚNICA puerta por la que el texto completo de una reseña
// sale del ámbito privado del usuario. Todo lo que entre aquí lo va a leer cualquiera que tenga el enlace, sin
// sesión y sin ser su amigo. Un campo de más colado por un bug aguas arriba (el `hours` que el componente de
// detalle sí recibe, un `uid` arrastrado del perfil, la foto) sería una fuga, no una molestia. Falla cerrado.
//
// Se valida DOS VECES: en el cliente antes de enviar y en la Pages Function antes de guardar. La segunda es la
// que cuenta —el cliente es manipulable—, pero la primera convierte un bug nuestro en un error inmediato en
// desarrollo en vez de en una fuga en producción.
//
// OJO CON EL ARRANQUE: Zod NO forma parte del bundle de arranque (ver `BOOT_PAYLOAD_BUDGET_KB` en
// scripts/ci-validate.js y el `loadSocialGistValidator` del canal social). Este módulo se carga BAJO DEMANDA, al
// compartir; no importarlo de forma estática desde ningún módulo del arranque.
import { z } from 'zod';
import { POST_HARD_CEILING } from '../../core/constants/tiers';

// Cotas generosas: nunca rechazan datos válidos, pero impiden que un payload manipulado publique una página de
// megabytes o mil plataformas inventadas.
const NAME_MAX = 500;
const NICK_MAX = 500;
const TAG_MAX = 200; // cada plataforma/género/punto fuerte o débil
const TAG_COUNT_MAX = 50;
const REVIEW_MAX = POST_HARD_CEILING; // 100.000, la misma cota que el saneador de publicaciones

const tagList = z.array(z.string().max(TAG_MAX)).max(TAG_COUNT_MAX);
const timestamp = z.number().int().nonnegative();

export const sharedReviewSchema = z.strictObject({
  v: z.literal(1),
  gameId: z.number().int(),
  gameName: z.string().max(NAME_MAX),
  // La nota fina 0–100 y su espejo 0–5, exactamente igual que en el canal social. `null` = sin nota.
  grade: z.number().min(0).max(100).nullable(),
  rating: z.number().min(0).max(5).nullable(),
  review: z.string().max(REVIEW_MAX),
  platforms: tagList,
  genres: tagList,
  strengths: tagList,
  weaknesses: tagList,
  authorNick: z.string().max(NICK_MAX),
  reviewedAt: timestamp,
  createdAt: timestamp,
  expiresAt: timestamp,
});

/**
 * Campos que NO pueden aparecer jamás en un artículo público, ni en la raíz ni anidados.
 *
 * Duplica en parte lo que ya garantiza `strictObject` (que rechaza cualquier clave desconocida), y es a
 * propósito: la lista dice en voz alta QUÉ es lo que no puede salir y por qué, para quien añada un campo dentro
 * de seis meses. Es la misma pareja allowlist + denylist que protege el gist social.
 *
 * `review` NO está aquí, al contrario que en `SOCIAL_PRIVATE_FIELDS`: compartir es justamente publicarlo.
 */
const SHARE_FORBIDDEN_FIELDS = [
  // Privados del juego: describen hábitos o valoraciones que no se comparten al publicar una reseña.
  'hours', 'score', 'steamDeck', 'retry', 'replayable', 'enteredAt', 'gradedAt',
  // Identidad: nada que permita saber QUIÉN es el autor más allá del nick que él eligió.
  'uid', 'email', 'authorUid', 'authorProfileId', 'profileId', 'actorProfileId',
  'gistId', 'gamesGistId', 'socialGistId', 'token',
  // Foto: se decidió que no viaja en el artículo (ocultarla al pintar no evitaría nada).
  'authorPhoto', 'photoURL', 'avatarHash',
];

/** Guarda de privacidad: lanza si algún campo prohibido aparece en lo que se va a publicar. */
export function assertNoShareForbiddenFields(obj: unknown, path = ''): void {
  if (!obj || typeof obj !== 'object') return;
  for (const field of SHARE_FORBIDDEN_FIELDS) {
    if (field in (obj as Record<string, unknown>)) {
      throw new Error(`Campo prohibido '${field}' en ${path || 'root'}: un artículo público no debe contenerlo`);
    }
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    assertNoShareForbiddenFields(value, path ? `${path}.${key}` : key);
  }
}

/** Valida el artículo antes de publicarlo. Lanza con detalle si hay campos extra, prohibidos o tipos inválidos. */
export function assertValidSharedReview(data: unknown): void {
  assertNoShareForbiddenFields(data);
  const result = sharedReviewSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join('; ');
    throw new Error(`Artículo compartido inválido (schema): ${issues}`);
  }
}

/**
 * Lectura tolerante para la página pública: devuelve el artículo o `null` si no valida. Aquí NO se lanza porque
 * un artículo corrupto o de una versión futura no debe romper la página de un visitante: se le enseña el mismo
 * mensaje que si el enlace hubiera caducado.
 */
export function parseSharedReview(data: unknown): z.infer<typeof sharedReviewSchema> | null {
  const result = sharedReviewSchema.safeParse(data);
  return result.success ? result.data : null;
}
