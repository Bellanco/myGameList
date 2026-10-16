// LO QUE LA FICHA SABE DE TUS AMISTADES SIN IR A LA RED (F3 del plan de la ficha): sus reseñas y sus avisos de lista,
// sacados de la copia del directorio social que guarda el hub en este dispositivo. Coste cero: ni GitHub, ni
// Firestore, ni Firebase cargado (memoria `enlace-publico-sin-firebase`). Puro salvo `loadGameSheetFriendSignals`,
// que lee esa copia de IndexedDB, como el buscador general (`viewmodel/search/searchSources.ts`).
//
// Solo entra lo que ya está en el canal social, que es público entre amistades: la reseña va como adelanto de 160
// caracteres y el canal solo guarda los avisos de los últimos 30 días. Las listas que alguien esconde no publican
// avisos (van aparte, en `hiddenMoves`, y esos no se leen aquí), así que no hay visibilidad que aplicar encima.
import type { GameSheetFriendRef, GameSheetSignal } from '../../core/gameSheet/buildGameSheet';
import { friendUidsFromDirectoryKey } from '../../core/social/directoryFriendsKey';
import { resolveGrade } from '../../core/utils/scoreScale';
import { TAB_IDS, type TabId } from '../../model/types/game';
import { getSocialSyncConfig } from '../../model/repository/gistConfigRepository';
import { getLocalMeta, peekCachedSocialDirectory } from '../../model/repository/indexedDbRepository';

/** Lo justo de una entrada del directorio guardado (`SocialDirectoryEntry`) para la ficha. */
export interface CachedFriendEntry {
  id: string;
  uid?: string;
  displayName?: string;
  photoURL?: string;
  activity?: ReadonlyArray<{ gameName?: string; grade?: number | null; rating?: number | null; snippet?: string; updatedAt?: number }>;
  moves?: ReadonlyArray<{ gameName?: string; tab?: string; at?: number }>;
}

function isTabId(value: unknown): value is TabId {
  return TAB_IDS.includes(value as TabId);
}

/**
 * La nota de una reseña en 0–100: la fina si el autor la publicó y, si no, la de estrellas del canal (`rating`, 0–5,
 * la forma vieja). `null` si no trae ninguna.
 */
function reviewGrade(item: { grade?: number | null; rating?: number | null }): number | null {
  if (typeof item.grade === 'number') return resolveGrade({ grade: item.grade });
  if (typeof item.rating === 'number') return resolveGrade({ score: item.rating });
  return null;
}

/**
 * Las señales de tus amistades, a partir de la copia del directorio. SOLO AMISTADES (regla 1 del plan): la copia lleva
 * también a gente que no lo es, y quién sí lo dice la huella de amistades (`friendUids`). En una copia anterior a la
 * huella (`null`) vale lo mismo que en el buscador: el directorio solo lee el canal de tus amistades, así que quien
 * trae reseñas o avisos lo es. Tu propia entrada no cuenta nunca.
 */
export function friendSignalsFromDirectory(
  entries: readonly CachedFriendEntry[],
  friendUids: ReadonlySet<string> | null,
  ownUid: string,
): GameSheetSignal[] {
  const signals: GameSheetSignal[] = [];
  for (const entry of entries) {
    const uid = String(entry.uid || entry.id || '');
    if (!uid || !entry.id || uid === ownUid) continue;
    const activity = entry.activity ?? [];
    const moves = entry.moves ?? [];
    const isFriend = friendUids ? friendUids.has(uid) : activity.length + moves.length > 0;
    if (!isFriend) continue;
    const name = String(entry.displayName || '').trim();
    if (!name) continue;
    // El `id` del directorio, no el uid: es el que abre su perfil (`SOCIAL_ROUTES.profileDetail`).
    const friend: GameSheetFriendRef = { id: entry.id, name, ...(entry.photoURL ? { photoURL: entry.photoURL } : {}) };
    for (const item of activity) {
      if (!item.gameName) continue;
      signals.push({
        kind: 'review',
        friend,
        gameName: item.gameName,
        grade: reviewGrade(item),
        snippet: String(item.snippet || ''),
        at: Number(item.updatedAt) || 0,
      });
    }
    for (const move of moves) {
      if (!move.gameName || !isTabId(move.tab)) continue;
      signals.push({ kind: 'move', friend, gameName: move.gameName, tab: move.tab, at: Number(move.at) || 0 });
    }
  }
  return signals;
}

/**
 * Las señales de tus amistades guardadas en este dispositivo: la copia del directorio de tu última visita al hub, sin
 * red. Vacío si no hay espacio social aquí, si nunca se abrió el hub o si no se puede leer: la sección de amistades no
 * se pinta y la ficha sigue (F0.10).
 */
export async function loadGameSheetFriendSignals(): Promise<GameSheetSignal[]> {
  try {
    const gistId = getSocialSyncConfig()?.gistId || '';
    if (!gistId) return [];
    const [cached, meta] = await Promise.all([
      peekCachedSocialDirectory<CachedFriendEntry>(gistId),
      getLocalMeta().catch(() => null),
    ]);
    if (!cached) return [];
    return friendSignalsFromDirectory(cached.entries, friendUidsFromDirectoryKey(cached.friendsKey), meta?.uid || '');
  } catch {
    return [];
  }
}
