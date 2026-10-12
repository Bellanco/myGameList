// Schema Zod del artículo público que se guarda al compartir una reseña con enlace (canal PÚBLICO, ver
// docs/plan-compartir-resenas.md). Es una allowlist ESTRICTA: solo los campos permitidos y todos acotados.
//
// POR QUÉ IMPORTA MÁS QUE UN ESQUEMA NORMAL: esta es la ÚNICA puerta por la que el texto completo de una reseña
// sale del ámbito privado del usuario. Todo lo que entre aquí lo va a leer cualquiera que tenga el enlace, sin
// sesión y sin ser su amigo. Un campo de más colado por un bug aguas arriba (el `hours` que el componente de
// detalle sí recibe, un `uid` arrastrado del perfil, la foto) sería una fuga, no una molestia. Falla cerrado.
//
// QUIÉN LO USA: la Pages Function, antes de escribir en KV. El cliente NO valida antes de enviar, y es a
// propósito: sería una comprobación redundante —el servidor rechaza igual— a cambio de arrastrar Zod al flujo de
// compartir. La validación que cuenta es la del servidor, porque el cliente es manipulable.
//
// OJO CON EL ARRANQUE: Zod NO forma parte del bundle de arranque (ver `BOOT_CRITICAL_BUDGET_KB` en
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

// EL RESUMEN DEL AÑO COMPARTIDO (`kind: 'year'`, ver docs/plan-resumen-del-ano.md). Lo que publica
// `core/stats/publicYearSummary`, cerrado igual de estricto: sin la comparación con quien mira (`common: null`), sin
// cita (`quote` vacía), con precisión de mes (los extremos no llevan día y no hay `days`) y con listados acotados.
const YEAR_LIST_MAX = 30; // `PUBLIC_YEAR_SUMMARY_LIMITS.ranked`, con la misma holgura que el resto de cotas
const name = z.string().max(NAME_MAX);
const grade = z.number().min(0).max(100);
const count = z.number().int().nonnegative();
const month = z.number().int().min(0).max(11);
const months = z.array(count).length(12);
const ranked = z.array(z.strictObject({ name: z.string().max(TAG_MAX), count })).max(YEAR_LIST_MAX);
const year = z.number().int().min(2000).max(2100);
const edge = z.strictObject({ month, names: z.array(name).max(10) });

export const publicYearSummarySchema = z.strictObject({
  year,
  count,
  covers: z.array(z.strictObject({ name, platforms: tagList })).max(9),
  avgGrade: grade.nullable(),
  withReview: count,
  platforms: ranked,
  best: z
    .strictObject({
      name,
      grade,
      genre: z.string().max(TAG_MAX).nullable(),
      platform: z.string().max(TAG_MAX).nullable(),
      platforms: tagList,
      quote: z.literal(''),
    })
    .nullable(),
  podium: z.array(z.strictObject({ name, grade })).max(2),
  genres: z
    .array(z.strictObject({ name: z.string().max(TAG_MAX), count, avgGrade: grade.nullable(), bestName: name }))
    .max(YEAR_LIST_MAX),
  when: z
    .strictObject({
      precision: z.literal('month'),
      months,
      topMonths: z.array(month).max(12),
      topCount: count,
      dated: count,
      undated: count,
      first: edge,
      last: edge,
    })
    .nullable(),
  strengths: ranked,
  weaknesses: ranked,
  previous: z
    .strictObject({
      year,
      count,
      avgGrade: grade.nullable(),
      months: months.nullable(),
      undated: count,
      genreRise: z.strictObject({ name: z.string().max(TAG_MAX), from: count, to: count }).nullable(),
    })
    .nullable(),
  common: z.null(),
  palmares: z
    .strictObject({ rank: z.number().int().min(0).max(5), seasonName: name, place: z.number().int().positive().max(100_000).nullable() })
    .nullable(),
});

export const sharedYearSummarySchema = z.strictObject({
  v: z.literal(1),
  kind: z.literal('year'),
  year,
  summary: publicYearSummarySchema,
  authorNick: z.string().max(NICK_MAX),
  createdAt: timestamp,
  updatedAt: timestamp,
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

/** Valida el resumen del año antes de publicarlo. Misma doble guarda que la reseña: denylist y esquema estricto. */
export function assertValidSharedYearSummary(data: unknown): void {
  assertNoShareForbiddenFields(data);
  const result = sharedYearSummarySchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join('; ');
    throw new Error(`Resumen compartido inválido (schema): ${issues}`);
  }
}

// NO hay aquí una función de LECTURA tolerante, y es deliberado: la página pública comprueba por su cuenta que
// el artículo es de la versión que sabe pintar (`publicShareRepository`), sin arrastrar Zod a un chunk que se
// quiere mínimo. Este módulo es solo para ESCRIBIR, que es donde la validación tiene consecuencias.
