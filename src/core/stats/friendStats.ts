import { TAB_IDS, type GameItem, type TabData, type TabId } from '../../model/types/game';
import { ADMIN_ONLY_TIER, type ProfileTier } from '../constants/tiers';
import type { SocialSharedGame } from '../../model/repository/socialGistRepository';

/**
 * Estadísticas de un AMIGO: qué se puede enseñar, de qué listas y con qué datos.
 *
 * Todo lo de aquí es puro y se calcula sobre lo que el canal social YA publica —nombre, géneros, plataformas,
 * nota y años—; el panel del amigo no pide un dato nuevo ni abre una consulta más. Lo que no viaja por ese
 * canal (las horas, la fecha de llegada a la lista, las razones de abandono) sencillamente no se enseña: son
 * privados por diseño y esto no es motivo para dejar de serlo.
 */

/** Bloques del panel que pueden verse de otra persona. El backlog no está: es un histórico local del aparato. */
export type FriendStatsBlock = 'top' | 'years' | 'radar' | 'genres' | 'grades' | 'ratio' | 'shame' | 'wishlist';

/**
 * QUÉ VE CADA RANGO. Manda el rango de QUIEN MIRA.
 *
 * Bronce se queda en los cuatro bloques de retrato —quién es en su biblioteca y qué juega—; plata y oro ven
 * además cómo puntúa y cuánto termina; mithril lo ve TODO lo que el canal social permite montar: también sus
 * abandonos y su lista de próximos, y por su cuenta el desglose por años.
 *
 * Es una regla de PRODUCTO y la aplica el cliente, como la cadencia del feed o el límite de publicación: quien
 * manipule su copia puede saltársela, y lo único que conseguiría es ver datos que su amigo ya le ha publicado.
 */
const GENERAL_BLOCKS: readonly FriendStatsBlock[] = ['top', 'years', 'radar', 'genres', 'grades', 'ratio'];

const TIER_BLOCKS: Record<ProfileTier, readonly FriendStatsBlock[]> = {
  bronze: ['top', 'years', 'radar', 'genres'],
  silver: GENERAL_BLOCKS,
  gold: GENERAL_BLOCKS,
  mithril: [...GENERAL_BLOCKS, 'shame', 'wishlist'],
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

/**
 * Convierte las listas públicas del amigo en la misma estructura que usa el panel propio, para poder pasar por
 * `computeStats` sin una segunda implementación de las estadísticas.
 *
 * Los campos que el canal social no publica se quedan en su valor neutro —sin horas, sin fecha de llegada, sin
 * razones—, y los bloques que dependían de ellos se apagan arriba en vez de inventar ceros que parecerían datos.
 *
 * `scored` va a `true` cuando hay nota: en el canal social una nota publicada es una nota puesta a propósito,
 * porque la proyección solo escribe la que el usuario tiene.
 */
export function toFriendTabData(
  sharedLists: Partial<Record<TabId, SocialSharedGame[]>>,
  tabs: readonly TabId[],
): TabData {
  const data: TabData = { c: [], v: [], e: [], p: [], deleted: [], updatedAt: 0 };

  for (const tab of tabs) {
    data[tab] = (sharedLists[tab] || []).map((game): GameItem => ({
      id: game.id,
      _ts: 0,
      name: game.name,
      platforms: game.platforms,
      genres: game.genres,
      steamDeck: false,
      review: '',
      grade: game.grade > 0 ? game.grade : null,
      scored: game.grade > 0,
      years: game.years,
    }));
  }

  return data;
}
