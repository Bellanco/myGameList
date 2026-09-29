/**
 * EL MOTOR DE LA GUÍA DE PRIMEROS PASOS: qué misiones hay, qué pasos tiene cada una y cuál toca enseñar AHORA.
 *
 * La guía no navega por nadie. Como la de las aplicaciones de banca, dice dónde tocar y espera en la pantalla
 * siguiente, así que la pregunta que resuelve este fichero no es «¿cuál es el paso siguiente?», sino «¿qué paso
 * de la misión en marcha tiene sentido EN ESTA PANTALLA, con lo que ya se ha hecho?». De ahí las tres piezas:
 *
 * - `screen`: en qué pantalla (o situación) tiene sentido el paso.
 * - `done`: la señal REAL de que ya está hecho —hay un juego, la sincronización está conectada—, y no un «he
 *   pulsado Siguiente». Así un paso de acción se cumple haciendo la acción, y quien ya la tenía hecha no la ve.
 * - `detour`: pasos que pueden volver a salir aunque la misión ya vaya por delante. Son los de «vuelve a tal
 *   sitio»: si alguien se va a otra pantalla a mitad de misión, la guía le dice cómo volver en vez de callarse.
 *
 * Puro y sin DOM: lo que ve cada paso llega en `TourContext`, que arma quien pinta la guía.
 */
import { MAIN_MISSIONS, MISSION_IDS, type MissionId, type TourState } from './tourState';

export interface TourContext {
  /** `pathname` actual. */
  path: string;
  /** Juegos en todas las listas. */
  gameCount: number;
  /** ¿Hay sincronización con GitHub configurada? */
  syncConnected: boolean;
  socialStatus: 'pending' | 'active' | 'inactive';
  /** ¿Está desplegado el menú de Ajustes de la barra inferior? */
  settingsMenuOpen: boolean;
  /** Juegos esperando en la bandeja de importados. */
  inboxCount: number;
}

/**
 * - `info`: se explica algo y se sigue con «Siguiente».
 * - `action`: hay que hacerlo; no hay «Siguiente», el paso se cumple con su señal (`done`).
 * - `nav`: hay que ir a otro sitio; se cumple llegando.
 * - `done`: la celebración de una acción recién hecha. Solo sale justo después de hacerla (ver `settleStep`).
 * - `invite`: la hoja de invitar a un amigo.
 */
export type StepKind = 'info' | 'action' | 'nav' | 'done' | 'invite';

export type StepId =
  | 'to-lists' | 'lists' | 'add' | 'added'
  | 'to-settings' | 'to-data' | 'sync' | 'synced'
  | 'library-offer' | 'library-import' | 'library-inbox'
  | 'to-social' | 'coop-sync' | 'gateway' | 'profile' | 'invite';

export interface TourStep {
  id: StepId;
  kind: StepKind;
  /**
   * Selector del control señalado, o varios por orden de preferencia (gana el primero que exista). Sin él —o si
   * no aparece— la burbuja sale sin flecha.
   */
  anchor?: string | readonly string[];
  screen(ctx: TourContext): boolean;
  done?(ctx: TourContext): boolean;
  /** Puede volver a salir por debajo del paso en curso (ver la cabecera). */
  detour?: boolean;
  /** Cuenta en el «2/3» de la burbuja. Los desvíos y las celebraciones no. */
  counted?: boolean;
}

export interface Mission {
  id: MissionId;
  steps: readonly TourStep[];
}

const LIST_PATHS = new Set(['/completados', '/abandonados', '/en-curso', '/proximos']);
const DATA_PATH = '/ajustes/datos';

const isLists = (ctx: TourContext) => LIST_PATHS.has(ctx.path);
const isData = (ctx: TourContext) => ctx.path === DATA_PATH;
const isSocial = (ctx: TourContext) => ctx.path === '/social' || ctx.path.startsWith('/social/');
const synced = (ctx: TourContext) => ctx.syncConnected;
/** El botón de conectar con GitHub y, en un build sin OAuth (que no lo tiene), la tarjeta entera. */
const SYNC_ANCHOR = ['[data-tour="sync-connect"]', '[data-tour="sync-card"]'] as const;
const socialActive = (ctx: TourContext) => ctx.socialStatus === 'active';

/** Los dos pasos de «ve a Ajustes › Datos», que comparten la nube y Playnite. */
function toDataSteps(done?: (ctx: TourContext) => boolean): TourStep[] {
  return [
    {
      id: 'to-settings',
      kind: 'nav',
      anchor: '[data-tour="nav-settings"]',
      screen: (ctx) => !isData(ctx) && !ctx.settingsMenuOpen,
      done,
      detour: true,
      counted: true,
    },
    {
      id: 'to-data',
      kind: 'nav',
      anchor: '[data-tour="menu-data"]',
      screen: (ctx) => ctx.settingsMenuOpen,
      done,
      detour: true,
      counted: true,
    },
  ];
}

export const MISSIONS: Readonly<Record<MissionId, Mission>> = {
  'first-game': {
    id: 'first-game',
    steps: [
      { id: 'to-lists', kind: 'nav', anchor: '[data-tour="nav-lists"]', screen: (ctx) => !isLists(ctx), detour: true },
      { id: 'lists', kind: 'info', anchor: '[data-tour="tabs"]', screen: isLists, counted: true },
      { id: 'add', kind: 'action', anchor: '[data-tour="add-game"]', screen: isLists, done: (ctx) => ctx.gameCount > 0, counted: true },
      // La fila recién guardada. Es el primer renglón de la tabla, sea cual sea la forma elegida.
      { id: 'added', kind: 'done', anchor: '.main-row, .grid-row', screen: isLists, counted: true },
    ],
  },
  cloud: {
    id: 'cloud',
    steps: [
      ...toDataSteps(synced),
      { id: 'sync', kind: 'action', anchor: SYNC_ANCHOR, screen: isData, done: synced, counted: true },
      // En cualquier pantalla: al volver de autorizar en GitHub la aplicación deja a cada uno donde empezó.
      { id: 'synced', kind: 'done', screen: () => true },
    ],
  },
  library: {
    id: 'library',
    steps: [
      ...toDataSteps(),
      {
        id: 'library-offer',
        kind: 'info',
        anchor: '[data-tour="import-card"]',
        screen: isData,
        done: (ctx) => ctx.inboxCount > 0,
      },
      {
        id: 'library-import',
        kind: 'action',
        anchor: 'label[for="import-library-settings"]',
        screen: isData,
        done: (ctx) => ctx.inboxCount > 0,
      },
      // Importar lleva solo a la bandeja: ahí se explica qué hacer con lo que ha llegado.
      { id: 'library-inbox', kind: 'done', anchor: '.import-screen', screen: (ctx) => ctx.path === '/bandeja' },
    ],
  },
  coop: {
    id: 'coop',
    steps: [
      {
        id: 'to-social',
        kind: 'nav',
        anchor: '[data-tour="nav-social"]',
        // Mientras se conecta GitHub desde Datos no se dice «vuelve a Social»: ahí manda `coop-sync`.
        screen: (ctx) => !isSocial(ctx) && !(isData(ctx) && !ctx.syncConnected),
        detour: true,
      },
      {
        // Lo social pide GitHub primero. Quien se saltó la nube llega aquí desde la pasarela.
        id: 'coop-sync',
        kind: 'nav',
        anchor: SYNC_ANCHOR,
        screen: (ctx) => isData(ctx) && !ctx.syncConnected,
        done: synced,
        detour: true,
      },
      {
        id: 'gateway',
        kind: 'action',
        anchor: '.hub-gateway-stage.is-current',
        screen: (ctx) => ctx.path === '/social' && !socialActive(ctx),
        done: socialActive,
        counted: true,
      },
      {
        id: 'profile',
        kind: 'action',
        anchor: '#hub-profile-name',
        screen: (ctx) => ctx.path.startsWith('/social/profile') && !socialActive(ctx),
        done: socialActive,
        counted: true,
      },
      { id: 'invite', kind: 'invite', screen: (ctx) => isSocial(ctx) && socialActive(ctx), counted: true },
    ],
  },
};

/**
 * EL PASO EN EL QUE SE QUEDA LA MISIÓN, saltando lo que ya está hecho.
 *
 * Una acción hecha JUSTO en el paso en el que se estaba se celebra: el paso siguiente de tipo `done` se queda. Si
 * en cambio ya venía hecha —quien repite la guía con juegos en sus listas, o quien conectó GitHub por su cuenta—,
 * se salta sin fiesta, que celebrar algo que no se acaba de hacer suena a disco rayado.
 *
 * Devuelve un índice igual o mayor que `step`; igual a `steps.length` si la misión ya no tiene nada que enseñar.
 */
export function settleStep(mission: Mission, step: number, ctx: TourContext): number {
  const { steps } = mission;
  let index = step;
  while (index < steps.length) {
    const current = steps[index];
    if (current.kind === 'done' || current.kind === 'invite' || !current.done?.(ctx)) break;
    const justDone = current.kind === 'action' && index === step;
    index += 1;
    if (!justDone) {
      while (index < steps.length && steps[index].kind === 'done') index += 1;
    }
  }
  return index;
}

/**
 * QUÉ PASO SE ENSEÑA EN ESTA PANTALLA, o `null` si ninguno tiene sentido aquí (la guía se queda plegada en su
 * botón hasta que se vuelva a un sitio donde sí).
 *
 * 1. El paso en curso, si es de esta pantalla.
 * 2. Uno POSTERIOR que sí lo sea: quien se adelanta —llega a Datos por su cuenta— no tiene que deshacer camino.
 *    Las celebraciones no cuentan: solo salen justo después de su acción.
 * 3. Un desvío anterior: quien se ha ido a otra pantalla a mitad de misión recibe el «vuelve a…».
 */
export function pickStep(mission: Mission, step: number, ctx: TourContext): number | null {
  const { steps } = mission;
  const current = steps[step];
  if (!current) return null;
  if (current.screen(ctx)) return step;
  for (let index = step + 1; index < steps.length; index += 1) {
    const later = steps[index];
    if (later.kind !== 'done' && !later.done?.(ctx) && later.screen(ctx)) return index;
  }
  for (let index = 0; index < step; index += 1) {
    const earlier = steps[index];
    if (earlier.detour && !earlier.done?.(ctx) && earlier.screen(ctx)) return index;
  }
  return null;
}

/** Posición del paso en el «2/3» de su misión, o `null` si no cuenta. */
export function stepCounter(mission: Mission, step: number): { position: number; total: number } | null {
  const counted = mission.steps.filter((candidate) => candidate.counted);
  const target = mission.steps[step];
  if (!target?.counted) return null;
  return { position: counted.indexOf(target) + 1, total: counted.length };
}

/* ── Transiciones ──────────────────────────────────────────────────────────────────────────────────────────── */

function pendingMissions(state: TourState): MissionId[] {
  return MISSION_IDS.filter((id) => !state.completed.includes(id) && !state.skipped.includes(id));
}

/** Siguiente misión por hacer, o `finale` si ya no queda ninguna PRINCIPAL (Playnite no retiene el final). */
function moveOn(state: TourState): TourState {
  const pending = pendingMissions(state);
  if (!pending.some((id) => MAIN_MISSIONS.includes(id))) {
    return { ...state, status: 'finale', mission: null, step: 0 };
  }
  return { ...state, status: 'active', mission: pending[0], step: 0 };
}

export function startTour(state: TourState): TourState {
  if (state.mission && pendingMissions(state).includes(state.mission)) return { ...state, status: 'active' };
  return moveOn(state);
}

/** Da la misión en curso por cumplida y pasa a la siguiente. */
export function completeMission(state: TourState): TourState {
  if (!state.mission) return moveOn(state);
  const completed = state.completed.includes(state.mission) ? state.completed : [...state.completed, state.mission];
  return moveOn({ ...state, completed });
}

export function skipMission(state: TourState): TourState {
  if (!state.mission) return moveOn(state);
  const skipped = state.skipped.includes(state.mission) ? state.skipped : [...state.skipped, state.mission];
  return moveOn({ ...state, skipped });
}

/** «Siguiente» sobre el paso `step`: el de después, o la misión cumplida si era el último. */
export function advanceStep(state: TourState, step: number): TourState {
  if (!state.mission) return state;
  const next = step + 1;
  if (next >= MISSIONS[state.mission].steps.length) return completeMission(state);
  return { ...state, step: Math.max(state.step, next) };
}

/** Empieza (o repite) una misión elegida en la lista. */
export function chooseMission(state: TourState, mission: MissionId): TourState {
  return {
    ...state,
    status: 'active',
    mission,
    step: 0,
    completed: state.completed.filter((id) => id !== mission),
    skipped: state.skipped.filter((id) => id !== mission),
  };
}

/** Misiones principales cumplidas, para el «1 de 3» del botón plegado. */
export function mainProgress(state: TourState): { done: number; total: number } {
  return { done: MAIN_MISSIONS.filter((id) => state.completed.includes(id)).length, total: MAIN_MISSIONS.length };
}
