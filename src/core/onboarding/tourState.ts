/**
 * EL ESTADO DE LA GUÍA DE PRIMEROS PASOS, sin nada de su interfaz.
 *
 * Es lo único de la guía que viaja en el arranque, y por eso está separado del motor de pasos (`tourSteps`) y de
 * los textos: `App` solo necesita saber SI hay guía que montar, y eso se decide con el estado. Todo lo demás llega
 * en el chunk perezoso de la guía, y quien no la tiene en marcha no lo descarga nunca.
 *
 * Se guarda en `ONBOARDING_KEY`, por dispositivo (ver el porqué junto a la clave).
 */

/**
 * - `offer`: la tarjeta de bienvenida, en la primera visita o al pedirla desde Ajustes.
 * - `active`: una misión en marcha; la guía señala el paso que toca en la pantalla en la que se esté.
 * - `paused`: plegada en el botón flotante de la izquierda, para retomarla cuando se quiera.
 * - `menu`: la lista de misiones abierta desde ese botón.
 * - `finale`: la tarjeta del final, una sola vez.
 * - `hint`: el OFRECIMIENTO de una sola misión en la pantalla donde se hace («¿Quieres…?»), para quien ya usaba
 *   la aplicación y no tiene lo social o la nube. Ver `canOfferHint`.
 * - `dismissed` / `done`: no se pinta nada. Solo se vuelve a ver pidiéndola desde Ajustes, o con un ofrecimiento
 *   de una misión que todavía no se haya rechazado.
 */
export type TourStatus = 'offer' | 'active' | 'paused' | 'menu' | 'finale' | 'hint' | 'dismissed' | 'done';

/**
 * Las misiones, en el orden en que se proponen. `library` (Playnite) es SECUNDARIA: se ofrece, pero no cuenta
 * para terminar la guía, porque solo sirve a quien juega en un PC con Windows.
 */
export const MISSION_IDS = ['first-game', 'cloud', 'library', 'coop'] as const;
export type MissionId = (typeof MISSION_IDS)[number];

export const MAIN_MISSIONS: readonly MissionId[] = ['first-game', 'cloud', 'coop'];

export interface TourState {
  v: typeof TOUR_VERSION;
  status: TourStatus;
  /** Misión en marcha (o la que se retomará al desplegar la guía). */
  mission: MissionId | null;
  /** Paso más avanzado de esa misión. Los de navegación pueden volver a salir por debajo (ver `tourSteps`). */
  step: number;
  /** Misiones cumplidas en esta vuelta de la guía. */
  completed: MissionId[];
  /** Misiones que se pidió saltar. */
  skipped: MissionId[];
  /** Misiones cuyo ofrecimiento se rechazó («No, gracias»): no se vuelven a ofrecer solas. */
  declined: MissionId[];
  /**
   * Vuelta de UNA sola misión, la que se aceptó en un ofrecimiento: al terminarla la guía se retira en vez de
   * pasar a la siguiente. Quien ya usaba la aplicación vino a hacer eso, no la guía entera.
   */
  single: boolean;
}

export const TOUR_VERSION = 1;

const STATUSES: readonly TourStatus[] = ['offer', 'active', 'paused', 'menu', 'finale', 'hint', 'dismissed', 'done'];

function isMission(value: unknown): value is MissionId {
  return typeof value === 'string' && (MISSION_IDS as readonly string[]).includes(value);
}

function missionList(value: unknown): MissionId[] {
  if (!Array.isArray(value)) return [];
  return MISSION_IDS.filter((id) => value.includes(id));
}

/** Estado recién ofrecido: la tarjeta de bienvenida, sin nada hecho. */
export function offeredTour(): TourState {
  return { v: TOUR_VERSION, status: 'offer', mission: null, step: 0, completed: [], skipped: [], declined: [], single: false };
}

/**
 * Interpreta lo guardado. `null` = no hay guía en este dispositivo (lo normal para quien ya usaba la app), y
 * también cuando lo guardado no se entiende o es de otra versión: una guía rota se da por no ofrecida en vez de
 * pintar un paso que ya no existe.
 */
export function parseTourState(raw: string | null): TourState | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  if (record.v !== TOUR_VERSION) return null;
  if (typeof record.status !== 'string' || !(STATUSES as readonly string[]).includes(record.status)) return null;
  const step = typeof record.step === 'number' && Number.isInteger(record.step) && record.step >= 0 ? record.step : 0;
  return {
    v: TOUR_VERSION,
    status: record.status as TourStatus,
    mission: isMission(record.mission) ? record.mission : null,
    step,
    completed: missionList(record.completed),
    skipped: missionList(record.skipped),
    // Campos que llegaron después: un estado guardado sin ellos es de antes, y vale con sus valores por defecto.
    declined: missionList(record.declined),
    single: record.single === true,
  };
}

export function serializeTourState(state: TourState): string {
  return JSON.stringify(state);
}

/** ¿Hay que montar la guía? Solo en los estados que pintan algo. */
export function isTourVisible(state: TourState | null): boolean {
  return state !== null && state.status !== 'dismissed' && state.status !== 'done';
}

/**
 * ¿Se le puede OFRECER esta misión en su pantalla? A quien no tiene guía en este dispositivo —lo normal para quien
 * ya usaba la aplicación— y a quien la tiene terminada o cerrada, siempre que esa misión no la haya rechazado,
 * saltado ni hecho. Con una guía en marcha, ofrecida o plegada, nunca: ahí manda la guía.
 */
export function canOfferHint(state: TourState | null, mission: MissionId): boolean {
  if (!state) return true;
  if (state.status !== 'dismissed' && state.status !== 'done') return false;
  return !state.declined.includes(mission) && !state.skipped.includes(mission) && !state.completed.includes(mission);
}

/** El ofrecimiento de una misión, sobre lo que ya hubiera guardado. */
export function hintTour(state: TourState | null, mission: MissionId): TourState {
  return { ...(state ?? offeredTour()), status: 'hint', mission, step: 0, single: true };
}
