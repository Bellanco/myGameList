import { TAB_IDS, type GameItem, type TabData, type TabId } from '../../model/types/game';
import { ADMIN_ONLY_TIER, type ProfileTier } from '../constants/tiers';
import type { StatsBlock } from './types';
import type { SocialSharedGame } from '../../model/repository/socialGistRepository';

/**
 * Estadísticas de un AMIGO: qué se puede enseñar, de qué listas y con qué datos.
 *
 * Todo lo de aquí es puro. La PANTALLA es la misma que la del panel propio (ver `StatsPanel`) y el cálculo es el
 * mismo `computeStats`: aquí solo se decide qué datos se le dan y qué bloques se le dejan pintar.
 *
 * Hay DOS niveles de datos, y no es lo mismo (ver `friendStatsData`):
 *  - `public`: la proyección que el gist social publica —nombre, géneros, plataformas, nota y años—. Lo que no
 *    viaja por ese canal (horas, fecha de llegada, razones de abandono) no se enseña porque no está.
 *  - `full`: los juegos del gist de listados del amigo, que el hub ya baja al abrir su perfil y que llegan
 *    filtrados por SUS ajustes de privacidad (ver `applyProfileVisibility`). Reservado a la administración.
 *
 * En ninguno de los dos niveles se pintan sus RESEÑAS: tienen su propio apartado en el perfil, y repetirlas aquí
 * —cifra, puntos fuertes y débiles, citas del podio— sería decir dos veces lo mismo en la misma pantalla.
 */

/**
 * Bloques del panel que pueden verse de otra persona: los mismos que el panel propio, salvo el de reseñas (que
 * aquí nunca se pinta, ver arriba). El backlog solo sale con datos completos, porque se deriva de la fecha de
 * llegada a la lista y la proyección pública no la publica.
 */
/**
 * La CONSTANCIA queda fuera igual que las reseñas, y por un motivo más fuerte: se calcula con `enteredAt` y
 * `reviewedAt`, dos sellos privados cuyos CAMPOS no viajan por el canal social (ver `SOCIAL_PRIVATE_FIELDS`).
 * Aunque un rango los tuviera permitidos, el dato no llega, y montar el bloque solo enseñaría un vacío.
 *
 * F4 no cambia esto. El canal publica ahora la actividad de listas, pero es una proyección con recortes por
 * diseño —solo la PRIMERA entrada a cada lista, nunca las ocultas, y con cupo— así que reconstruir con ella un
 * mapa de constancia daría un dibujo incompleto que se leería como inactividad. Un hueco falso es peor que un
 * bloque ausente.
 */
export type FriendStatsBlock = Exclude<StatsBlock, 'reviews' | 'activity'>;

/**
 * QUÉ VE CADA RANGO. Manda el rango de QUIEN MIRA.
 *
 * Bronce se queda en los cuatro bloques de retrato —quién es en su biblioteca y qué juega—; plata y oro ven
 * además cómo puntúa y cuánto termina; mithril ve EL PANEL COMPLETO, el mismo que tiene en su propio perfil.
 *
 * Es una regla de PRODUCTO y la aplica el cliente, como la cadencia del feed o el límite de publicación: quien
 * manipule su copia puede saltársela, y lo único que conseguiría es ver datos que su amigo ya le ha publicado.
 */
const GENERAL_BLOCKS: readonly FriendStatsBlock[] = [
  'top',
  'years',
  'radar',
  'genres',
  'grades',
  'ratio',
  // Cómo se mueve su gusto y cómo reparte las notas: los dos salen de `genres`, `grade` y `years`, que el canal
  // social YA publica, así que no destapan nada que su dueño no haya compartido.
  'genreRanks',
  'demand',
];

/** El panel entero: lo que ve la administración, y el orden en que se pinta lo decide `StatsPanel`. */
const ALL_BLOCKS: readonly FriendStatsBlock[] = [...GENERAL_BLOCKS, 'backlog', 'shame', 'wishlist', 'replay'];

const TIER_BLOCKS: Record<ProfileTier, readonly FriendStatsBlock[]> = {
  // Bronce se queda en el retrato: quién es en su biblioteca y qué juega. La evolución del gusto entra aquí
  // porque es la misma pregunta contada en el tiempo, no un dato más fino.
  bronze: ['top', 'years', 'radar', 'genres', 'genreRanks'],
  silver: GENERAL_BLOCKS,
  gold: GENERAL_BLOCKS,
  mithril: ALL_BLOCKS,
};

/** Cuántos bloques da el rango más alto: sirve para saber si al que mira le queda algo por desbloquear. */
export const FRIEND_STATS_MAX_BLOCKS = TIER_BLOCKS.mithril.length;

export function friendStatsBlocks(tier: ProfileTier): readonly FriendStatsBlock[] {
  return TIER_BLOCKS[tier] || TIER_BLOCKS.bronze;
}

/** ¿Puede este rango cambiar de periodo (General y un año concreto) en el panel de un amigo? */
export function friendStatsHasYearTabs(tier: ProfileTier): boolean {
  return tier === ADMIN_ONLY_TIER;
}

/** Nivel de datos con el que se calcula el panel de otra persona (ver la cabecera del módulo). */
export type FriendStatsData = 'public' | 'full';

/**
 * CON QUÉ DATOS se calcula. Solo la administración usa los juegos completos del gist de listados; para todo el
 * resto se aplasta a la proyección pública, aunque el hub tenga los juegos enteros en memoria.
 *
 * Que el dato esté cargado no autoriza a pintarlo: el gist de listados se baja para las pestañas de juegos y
 * reseñas del perfil, no para deducir de él las horas de nadie.
 */
export function friendStatsData(tier: ProfileTier): FriendStatsData {
  return tier === ADMIN_ONLY_TIER ? 'full' : 'public';
}

export interface FriendTabsResult {
  /** Listas del amigo que se pueden usar para calcular. */
  tabs: TabId[];
  /**
   * Listas que el amigo SÍ comparte y que quedan fuera porque el espectador esconde las suyas. Es lo que hay
   * que contarle: no está viendo todo, y el motivo es una decisión suya.
   */
  blockedByViewer: TabId[];
}

/**
 * RECIPROCIDAD: lo que escondes, no lo ves.
 *
 * Del amigo llegan solo las listas que él comparte —las que oculta no se publican, así que no hay nada que
 * filtrar por su parte—. Sobre esas, el espectador solo ve aquellas que él mismo tiene a la vista: quien
 * esconde sus completados no mira los completados de nadie, y quien lo esconde todo se queda sin panel.
 *
 * La cuenta de administración (mithril) queda fuera de la regla: ve lo que le llegue, esconda lo que esconda.
 */
export function friendVisibleTabs(
  available: TabId[],
  viewerHiddenTabs: readonly TabId[],
  viewerTier: ProfileTier,
): FriendTabsResult {
  const ordered = TAB_IDS.filter((tab) => available.includes(tab));
  if (viewerTier === ADMIN_ONLY_TIER) {
    return { tabs: ordered, blockedByViewer: [] };
  }

  const hidden = new Set(viewerHiddenTabs);
  return {
    tabs: ordered.filter((tab) => !hidden.has(tab)),
    blockedByViewer: ordered.filter((tab) => hidden.has(tab)),
  };
}

/** Un juego del perfil de otra persona: completo (gist de listados) o su proyección pública (gist social). */
export type FriendGame = GameItem | SocialSharedGame;

/** ¿Este juego viene del gist de listados (y trae, por tanto, los campos privados que su dueño no oculte)? */
function isFullGame(game: FriendGame): game is GameItem {
  return '_ts' in game;
}

/**
 * ¿Han llegado los juegos COMPLETOS de este perfil?
 *
 * El rango dice a qué datos tienes derecho; esto dice qué datos hay. No siempre coinciden: el gist de listados se
 * baja al abrir el perfil de una amistad y puede no estar (sin token, error de red, caché vacía), y ahí el hub se
 * queda con la proyección pública. Sin esta comprobación, la administración vería el panel completo relleno de
 * ceros —cero horas, cero razones de abandono— como si su amistad no anotara nada.
 */
export function friendGamesAreFull(sharedLists: Partial<Record<TabId, FriendGame[]>>): boolean {
  return TAB_IDS.some((tab) => (sharedLists[tab] || []).some(isFullGame));
}

/**
 * Convierte las listas del amigo en la misma estructura que usa el panel propio, para poder pasar por
 * `computeStats` sin una segunda implementación de las estadísticas.
 *
 * Con `level: 'public'` (todos los rangos menos la administración) se queda lo que el canal social publica y el
 * resto se deja en su valor neutro —sin horas, sin fecha de llegada, sin razones—, así que los bloques que
 * dependían de ellos se apagan solos en vez de inventar ceros que parecerían datos.
 *
 * Con `level: 'full'` se conservan los juegos tal como llegaron, que ya vienen pasados por los ajustes de
 * privacidad de su dueño (ver `applyProfileVisibility`).
 *
 * En AMBOS niveles se vacía la reseña y sus etiquetas: es lo que apaga la cifra de reseñas, el bloque de puntos
 * fuertes y débiles y las citas del podio, que en este perfil viven en su propio apartado.
 *
 * `scored` va a `true` cuando hay nota: en el canal social una nota publicada es una nota puesta a propósito,
 * porque la proyección solo escribe la que el usuario tiene.
 */
export function toFriendTabData(
  sharedLists: Partial<Record<TabId, FriendGame[]>>,
  tabs: readonly TabId[],
  level: FriendStatsData = 'public',
): TabData {
  const data: TabData = { c: [], v: [], e: [], p: [], deleted: [], updatedAt: 0 };

  for (const tab of tabs) {
    data[tab] = (sharedLists[tab] || []).map((game): GameItem => {
      if (level === 'full' && isFullGame(game)) {
        return { ...game, review: '', strengths: [], weaknesses: [] };
      }

      const grade = Number(game.grade) > 0 ? Number(game.grade) : null;
      return {
        id: game.id,
        _ts: 0,
        name: game.name,
        platforms: game.platforms,
        genres: game.genres,
        steamDeck: false,
        review: '',
        grade,
        scored: grade !== null,
        years: game.years,
      };
    });
  }

  return data;
}
