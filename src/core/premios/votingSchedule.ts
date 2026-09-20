/**
 * Qué se puede hacer ahora mismo con la edición: votar, esperar o mirar los resultados.
 *
 * UNA EDICIÓN TIENE UNA SOLA FECHA, la de cierre. Se elige al abrirla y de ahí sale el instante que gobierna la
 * app. Hubo tres (apertura, cierre y publicación) y el panel las pedía por separado: demasiadas piezas para un
 * ciclo que es abrir, cerrar y publicar. `opensAtMillis` se sigue respetando si existe, porque las ediciones
 * creadas con el modelo anterior lo llevan guardado; simplemente ya no se pide.
 *
 * CÓMO CONVIVEN LAS FECHAS Y EL INTERRUPTOR:
 *  - Las fechas mandan: fuera de la ventana no vota nadie, aunque el interruptor diga que está abierta.
 *  - `isOpen: false` es un CIERRE FORZADO: adelanta el cierre, pero no puede abrir fuera de plazo. Así el
 *    interruptor nunca contradice al calendario.
 *  - Una fecha ausente no restringe: sin apertura, ya está abierta; sin cierre, no se cierra sola.
 *
 * Todo es PURO y recibe el instante, para poder probarse. La misma lógica de apertura vive replicada en
 * `firestore.rules`, que es donde se cumple de verdad: aquí solo se decide qué pantalla se enseña.
 */
import type { PremiosVotingConfig } from '../../model/types/premios';

/** Estados de la votación de cara al público. */
export const VOTING_STATE = {
  /** Aún no ha llegado la fecha de apertura. */
  SCHEDULED: 'scheduled',
  OPEN: 'open',
  /** Cerrada por fecha o por el interruptor del administrador. */
  CLOSED: 'closed',
} as const;

export type VotingState = (typeof VOTING_STATE)[keyof typeof VOTING_STATE];

/**
 * Momento del ciclo de vida de la edición, que es lo que pinta la pestaña de temporada. Son tres, y de cada uno
 * sale UNA acción:
 *
 *   NONE    → no hay edición en marcha       → «Abrir votación»
 *   OPEN    → se está votando                → «Cerrar ahora»
 *   PENDING → cerrada y sin publicar         → «Publicar en el histórico»
 *
 * Publicar archiva la edición y la deja sin fecha de cierre, así que el ciclo vuelve solo a NONE.
 */
export const SEASON_STAGE = {
  NONE: 'none',
  OPEN: 'open',
  PENDING: 'pending',
} as const;

export type SeasonStage = (typeof SEASON_STAGE)[keyof typeof SEASON_STAGE];

/** ¿Se puede votar ahora mismo? */
export function isVotingOpenNow(
  config: PremiosVotingConfig | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!config) return false;
  if (config.isOpen === false) return false;
  if (config.opensAtMillis !== null && config.opensAtMillis !== undefined && now < config.opensAtMillis) return false;
  if (config.closesAtMillis !== null && config.closesAtMillis !== undefined && now >= config.closesAtMillis) return false;
  return true;
}

/** Estado de la votación para la interfaz: programada, abierta o cerrada. */
export function getVotingState(
  config: PremiosVotingConfig | null | undefined,
  now: number = Date.now(),
): VotingState {
  if (isVotingOpenNow(config, now)) return VOTING_STATE.OPEN;
  if (config?.isOpen !== false && config?.opensAtMillis !== null && config?.opensAtMillis !== undefined && now < config.opensAtMillis) {
    return VOTING_STATE.SCHEDULED;
  }
  return VOTING_STATE.CLOSED;
}

/**
 * Momento del ciclo de vida de la edición.
 *
 * Lo que distingue «no hay edición» de «hay una» es LA FECHA DE CIERRE: abrir una edición la fija y publicarla la
 * borra. No hace falta ninguna marca aparte, que sería un segundo estado que mantener en sincronía.
 */
export function getSeasonStage(
  config: PremiosVotingConfig | null | undefined,
  now: number = Date.now(),
): SeasonStage {
  if (config?.closesAtMillis === null || config?.closesAtMillis === undefined) return SEASON_STAGE.NONE;
  if (isVotingOpenNow(config, now)) return SEASON_STAGE.OPEN;
  return SEASON_STAGE.PENDING;
}

/**
 * ¿Hay resultados publicados que enseñar?
 *
 * No depende de una fecha: publicar es el gesto de ARCHIVAR, y al hacerlo se apunta el id de la edición. Así el
 * visitante resuelve el archivo con UNA lectura por id, sin listar la colección — y eso importa porque una
 * consulta que tropiece con un documento prohibido falla entera.
 */
export function areResultsPublished(config: PremiosVotingConfig | null | undefined): boolean {
  return Boolean(config?.lastPublishedId);
}

/** Días completos que faltan para un instante, redondeando hacia arriba. `null` si no hay fecha. */
export function daysUntil(millis: number | null | undefined, now: number = Date.now()): number | null {
  if (millis === null || millis === undefined) return null;
  return Math.max(0, Math.ceil((millis - now) / (1000 * 3600 * 24)));
}

/** Motivos por los que un día de cierre no vale. Son claves de texto, no mensajes. */
export type ClosingDayError = 'errorClosingDayRequired' | 'errorClosingDayInThePast';

/**
 * Valida el día de cierre al abrir una edición.
 *
 * Se comparan las cadenas `YYYY-MM-DD`, que ordenan igual que las fechas. Se exige que haya día y que no esté en
 * el pasado: una edición que nace cerrada no le sirve a nadie y deja el panel en «pendiente de publicar» nada más
 * crearla.
 */
export function validateClosingDay(
  closesDay: string | null | undefined,
  today: string | null | undefined,
): ClosingDayError | null {
  if (!closesDay) return 'errorClosingDayRequired';
  if (today && closesDay < today) return 'errorClosingDayInThePast';
  return null;
}
