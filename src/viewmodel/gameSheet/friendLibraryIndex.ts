// EL ÍNDICE DE LAS BIBLIOTECAS DE TUS AMISTADES (F4 del plan de la ficha): para que «quién lo tiene» incluya también a
// quien lo tiene sin haberlo reseñado ni movido hace poco, que es lo único que cuenta el canal social (F3).
//
// Se carga con `import()` desde `useGameSheetFriendSignals` y NO va en el precache del service worker: es una pieza de
// fuera, opcional (F0.10). Sin red tras un despliegue, este chunk no llega, la ficha se queda con lo de la F3 y nada
// falla. Así no suma al presupuesto total del precache, que está al límite (`scripts/ci-validate.js`).
//
// TRES REGLAS:
//  1. SOLO AMISTADES, por la huella de amistades de la copia del directorio, como en la F3. El gist de listados lleva
//     la biblioteca entera: de quien no es amistad no se lee nada.
//  2. FILTRADO POR SU VISIBILIDAD, la que trae su entrada; si no se conoce (su canal no se pudo leer), todo oculto
//     (`LOCKED_VISIBILITY`), como `useForeignProfileGames`. La ficha no conoce el claim de quien mira: falla cerrado.
//  3. CON EL PLAZO DEL RANGO DE QUIEN MIRA (`PROFILE_TIER_FRIEND_INDEX_TTL_MS`): mientras la última pregunta a GitHub
//     por esa biblioteca (`cachedAt` de `profileCache`) sea más nueva que el plazo, no se pregunta. Si toca, la
//     lectura es condicional (ETag) y casi siempre vuelve un 304. Bronce no tiene índice. Sin almacén nuevo: el índice
//     se deriva de `profileCache`, que ya guarda los gists.
import type { GameSheetFriendRef, GameSheetSignal } from '../../core/gameSheet/buildGameSheet';
import { friendUidsFromDirectoryKey } from '../../core/social/directoryFriendsKey';
import { PROFILE_TIER_FRIEND_INDEX_TTL_MS, normalizeTier } from '../../core/constants/tiers';
import { LOCKED_VISIBILITY, applyProfileVisibility } from '../../core/utils/profileVisibility';
import { TAB_IDS, type TabData } from '../../model/types/game';
import type { SocialProfileVisibility } from '../../model/types/social';
import { ensureSyncConfigLoaded, getSocialSyncConfig } from '../../model/repository/gistConfigRepository';
import { loadForeignProfileGames } from '../../model/repository/foreignProfileRepository';
import { getCachedProfileGamesEntry, getLocalMeta, peekCachedSocialDirectory } from '../../model/repository/indexedDbRepository';

/** Lo justo de una entrada del directorio guardado (`SocialDirectoryEntry`) para el índice. */
export interface IndexDirectoryEntry {
  id: string;
  uid?: string;
  displayName?: string;
  photoURL?: string;
  tier?: unknown;
  gamesGistId?: string;
  visibility?: SocialProfileVisibility;
  socialSkipped?: boolean;
  socialUnreadable?: boolean;
}

/** Una amistad cuya biblioteca entra en el índice. */
export interface IndexedFriend {
  friend: GameSheetFriendRef;
  gamesGistId: string;
  visibility: SocialProfileVisibility;
}

/** A quién se lee y con qué plazo. `ttlMs: null` = sin índice (bronce, o sin saber quién eres). */
export interface FriendIndexPlan {
  ttlMs: number | null;
  friends: IndexedFriend[];
}

/** Las bibliotecas que se leen a la vez: pocas, son ficheros grandes. */
const A_LA_VEZ = 3;
/** Con alguna biblioteca sin leer (sin red, un gist caído), el índice vale poco: se vuelve a probar pronto. */
const REINTENTO_MS = 5 * 60 * 1000;

/**
 * A QUIÉN SE LEE (puro). Tus amistades activas con gist de listados; quien está inactivo (`socialSkipped`) no, como
 * en el feed. Tu entrada (por tu `uid` o tu pseudónimo) no cuenta como amistad y es la que dice tu rango: el rango
 * manda el plazo. Sin huella de amistades no hay índice: aquí no vale el atajo de la F3 («quien trae algo de su canal
 * es amistad»), porque para la biblioteca entera hay que estar seguro.
 */
export function planFriendIndex(
  entries: readonly IndexDirectoryEntry[],
  friendUids: ReadonlySet<string> | null,
  ownIds: readonly string[],
): FriendIndexPlan {
  const propios = new Set(ownIds.filter(Boolean));
  const esPropia = (entry: IndexDirectoryEntry) => propios.has(String(entry.uid || '')) || propios.has(entry.id);
  const propia = entries.find(esPropia);
  const ttlMs = propia ? PROFILE_TIER_FRIEND_INDEX_TTL_MS[normalizeTier(propia.tier)] : null;
  if (ttlMs === null || !friendUids) return { ttlMs: null, friends: [] };
  const friends: IndexedFriend[] = [];
  for (const entry of entries) {
    const uid = String(entry.uid || entry.id || '');
    const name = String(entry.displayName || '').trim();
    if (!uid || !entry.id || esPropia(entry) || !friendUids.has(uid)) continue;
    if (!entry.gamesGistId || !name || entry.socialSkipped) continue;
    friends.push({
      friend: { id: entry.id, name, ...(entry.photoURL ? { photoURL: entry.photoURL } : {}) },
      gamesGistId: entry.gamesGistId,
      visibility: entry.visibility && !entry.socialUnreadable ? entry.visibility : LOCKED_VISIBILITY,
    });
  }
  return { ttlMs, friends };
}

/** La biblioteca de una amistad, ya filtrada por su visibilidad, como señales de la ficha (puro). */
export function librarySignals(friend: IndexedFriend, games: TabData): GameSheetSignal[] {
  const visibles = applyProfileVisibility(games, friend.visibility, false);
  const signals: GameSheetSignal[] = [];
  for (const tab of TAB_IDS) {
    for (const item of visibles[tab] || []) {
      if (item.name) signals.push({ kind: 'library', friend: friend.friend, tab, item });
    }
  }
  return signals;
}

/** El índice ya montado: las señales y de cuántas amistades no se pudo leer nada. */
export interface FriendLibraryIndex {
  signals: GameSheetSignal[];
  missing: number;
}

const SIN_INDICE: FriendLibraryIndex = { signals: [], missing: 0 };

/**
 * La biblioteca de una amistad: la guardada, si la última pregunta a GitHub es más nueva que el plazo; si no, una
 * lectura condicional (`loadForeignProfileGames`, que sin red sirve la guardada aunque haya caducado). `null` si no
 * hay nada que enseñar.
 */
async function bibliotecaDe(friend: IndexedFriend, ttlMs: number, token: string | null): Promise<TabData | null> {
  const guardada = await getCachedProfileGamesEntry(friend.friend.id, friend.gamesGistId);
  if (guardada && Date.now() - guardada.cachedAt < ttlMs) return guardada.games;
  return loadForeignProfileGames({ profileId: friend.friend.id, gamesGistId: friend.gamesGistId, token });
}

/** El índice de esta sesión: se reutiliza mientras no venza el plazo y no cambien tus amistades. */
let enMemoria: { clave: string; hasta: number; indice: FriendLibraryIndex } | null = null;

/**
 * EL ÍNDICE DE TUS AMISTADES para la ficha: lee sus bibliotecas de 3 en 3 y las convierte en señales. Vacío sin
 * espacio social, en bronce o sin huella de amistades. Lo que no se pudo leer se cuenta en `missing` y no da error:
 * la ficha lo dice en una línea y sigue (F0.10).
 */
export async function loadFriendLibraryIndex(): Promise<FriendLibraryIndex> {
  try {
    const gistId = getSocialSyncConfig()?.gistId || '';
    if (!gistId) return SIN_INDICE;
    const [cached, meta] = await Promise.all([
      peekCachedSocialDirectory<IndexDirectoryEntry>(gistId),
      getLocalMeta().catch(() => null),
    ]);
    if (!cached) return SIN_INDICE;
    const ownIds = [meta?.uid || '', meta?.profileId || '', (cached.friendsKey || '').split('|')[0] || ''];
    const plan = planFriendIndex(cached.entries, friendUidsFromDirectoryKey(cached.friendsKey), ownIds);
    if (plan.ttlMs === null || !plan.friends.length) return SIN_INDICE;
    const clave = `${cached.friendsKey}|${plan.ttlMs}`;
    if (enMemoria && enMemoria.clave === clave && Date.now() < enMemoria.hasta) return enMemoria.indice;

    // El token se guarda cifrado y se descifra al arrancar: hay que esperarlo, o se leería sin él (solo caché).
    await ensureSyncConfigLoaded().catch(() => {});
    const token = getSocialSyncConfig()?.token || null;
    const signals: GameSheetSignal[] = [];
    let missing = 0;
    for (let i = 0; i < plan.friends.length; i += A_LA_VEZ) {
      const tanda = plan.friends.slice(i, i + A_LA_VEZ);
      const leidas = await Promise.all(tanda.map((friend) => bibliotecaDe(friend, plan.ttlMs as number, token).catch(() => null)));
      tanda.forEach((friend, n) => {
        const games = leidas[n];
        if (games) signals.push(...librarySignals(friend, games));
        else missing += 1;
      });
    }
    const indice = { signals, missing };
    enMemoria = { clave, hasta: Date.now() + (missing ? Math.min(REINTENTO_MS, plan.ttlMs) : plan.ttlMs), indice };
    return indice;
  } catch {
    return SIN_INDICE;
  }
}

/** Solo para los tests: olvida el índice de la sesión. */
export function resetFriendLibraryIndexForTests(): void {
  enMemoria = null;
}
