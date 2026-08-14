// Schema Zod del gist de JUEGOS (canal privado del usuario). Complementa al normalizador a mano de
// `migrateData`/`normalizeData`, que sanea lo que entra pero, por definición, acepta todo lo que nadie se acordó
// de rechazar.
//
// POR QUÉ NO ES UNA COPIA DEL SOCIAL. `socialGistSchema` usa `strictObject` en todo y la escritura ABORTA ante
// cualquier campo extra. Ahí es lo correcto: es un canal PÚBLICO y el riesgo que se ataja es publicar de más.
// Aquí el riesgo es el contrario y la asimetría es deliberada:
//
//   · TIPOS: estrictos. Un `id` que no sea número o un `name` que no sea texto es corrupción, y publicarla es
//     peor que no publicar nada, porque el gist es la fuente de la que beben los DEMÁS dispositivos. Se rechaza.
//   · CAMPOS EXTRA: tolerados (sin `strictObject`). Este gist es del propio usuario y ya contiene todo lo suyo,
//     así que un campo de más no filtra nada. Y fallar cerrado aquí tiene un coste que allí no existe: dejaría al
//     usuario SIN PODER SINCRONIZAR —sus cambios se quedarían solo en el dispositivo— por haber añadido un campo
//     nuevo en `leanGameItem` y no aquí. Un esquema aditivo no puede convertirse en una avería de pérdida de datos.
import { z } from 'zod';

// Cotas generosas: acotan el abuso y un fichero construido a mano, sin llegar nunca a rechazar datos reales.
const NAME_MAX = 500;
const TEXT_MAX = 20000; // el análisis (`review`) es texto largo por diseño
const TAG_MAX = 200;

const tagList = z.array(z.string().max(TAG_MAX));

/**
 * Un juego tal y como lo serializa `leanGameItem` (socialProjection): cinco campos siempre y el resto omitidos
 * cuando están vacíos. Todos los opcionales admiten además `null`, porque los gists antiguos los llevan así.
 */
const gameItem = z.object({
  id: z.number(),
  _ts: z.number(),
  name: z.string().max(NAME_MAX),
  platforms: tagList,
  genres: tagList,
  steamDeck: z.boolean().optional(),
  review: z.string().max(TEXT_MAX).optional(),
  score: z.number().min(0).max(5).nullable().optional(),
  grade: z.number().min(0).max(100).nullable().optional(),
  hours: z.number().nullable().optional(),
  years: z.array(z.number()).optional(),
  strengths: tagList.optional(),
  weaknesses: tagList.optional(),
  reasons: tagList.optional(),
  replayable: z.boolean().optional(),
  retry: z.boolean().optional(),
  scored: z.boolean().optional(),
  _v: z.number().optional(),
  shared: z.boolean().optional(),
  listedAt: z.number().optional(),
  reviewedAt: z.number().optional(),
  // Sellos automáticos. `enteredAt` se valida por clave de lista (no `record`) para que un juego con basura
  // dentro —una clave que no es una lista— se detecte aquí y no llegue al gist.
  enteredAt: z
    .object({ c: z.number().optional(), v: z.number().optional(), e: z.number().optional(), p: z.number().optional() })
    .optional(),
  gradedAt: z.number().optional(),
});

/** Lápida de borrado: el reloj `_ts` es lo que decide el merge, así que es obligatorio. */
const deletedItem = z.object({
  id: z.number(),
  _ts: z.number(),
  deletedAt: z.number().optional(),
});

export const gamesGistSchema = z.object({
  c: z.array(gameItem),
  v: z.array(gameItem),
  e: z.array(gameItem),
  p: z.array(gameItem),
  deleted: z.array(deletedItem),
  updatedAt: z.number(),
});

/** Formatea los problemas de Zod en una línea legible, acotada para que un fallo masivo no llene la consola. */
function describeIssues(issues: readonly z.core.$ZodIssue[], max = 5): string {
  const shown = issues.slice(0, max).map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`);
  const rest = issues.length - shown.length;
  return shown.join('; ') + (rest > 0 ? ` (y ${rest} más)` : '');
}

/**
 * ESCRITURA — falla cerrado. Se llama con el `TabData` ya magro, justo antes de trocear y subir: si lo que
 * íbamos a publicar tiene un tipo corrupto, se aborta la subida y el gist remoto se queda como estaba (bueno).
 */
export function assertValidGamesGist(data: unknown): void {
  const result = gamesGistSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Gist de juegos inválido (schema): ${describeIssues(result.error.issues)}`);
  }
}

/**
 * LECTURA — solo diagnostica; NO toca los datos.
 *
 * Es a propósito, y es la decisión menos obvia de este fichero: la tentación es descartar las entradas que no
 * validan, pero un descarte silencioso ante un esquema mío demasiado estrecho se lleva por delante juegos buenos
 * —y en un dispositivo recién instalado no habría copia local con la que recuperarlos—. El saneado sigue
 * haciéndolo `migrateData`/`normalizeData`, que ya coacciona lo que llega; lo que faltaba era ENTERARSE de que el
 * remoto viene mal, en vez de ingerirlo en silencio. Por eso devuelve el diagnóstico y nunca lanza.
 */
export function inspectGamesGist(data: unknown): { valid: boolean; summary: string; issueCount: number } {
  const result = gamesGistSchema.safeParse(data);
  if (result.success) {
    return { valid: true, summary: '', issueCount: 0 };
  }
  return {
    valid: false,
    summary: describeIssues(result.error.issues),
    issueCount: result.error.issues.length,
  };
}
