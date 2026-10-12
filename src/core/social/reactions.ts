// «ME GUSTA» del canal social: lo que una persona marca en las reseñas y publicaciones de sus amistades.
//
// VIVE EN EL GIST DE QUIEN LO DA, no en el de quien lo recibe. La amistad es mutua y cada cliente ya lee los gists
// sociales de todas sus amistades para montar el feed, así que el «me gusta» llega a su destino sin una lectura más
// de Firestore ni una petición más a GitHub. La contrapartida es que cada cual ve los de SUS amistades, no todos: por
// eso la interfaz nombra a quien lo da en vez de contar (ver `docs/plan-reacciones.md`, Fase 0).
//
// Y EN UN FICHERO APARTE del mismo gist (`SOCIAL_REACTIONS_FILENAME`), no como un campo más del fichero principal. Las
// versiones ya desplegadas normalizan ese fichero quedándose solo con lo que conocen y lo reescriben entero al
// publicar: un campo nuevo ahí lo borrarían. Un fichero que no nombran no lo tocan.
//
// ES UN ESTADO, NO UN REGISTRO. Una entrada por destino: dar y quitar el «me gusta» reescriben la misma, y quitarlo
// deja una LÁPIDA (`del`) en vez de borrarla, para que otro dispositivo de la misma persona, que aún la tiene puesta,
// no la resucite al fusionar. Gana el instante más reciente (`mergeReactions`).
//
// Sin Zod a propósito: la lectura del gist de otro va en el camino del feed, que no carga el esquema. El esquema
// (`model/schemas/socialReactionsSchema`) solo corre al escribir el propio.
import {
  SOCIAL_ID_MAX,
  SOCIAL_REACTION_TOMBSTONE_DAYS,
  SOCIAL_REACTION_TOMBSTONES_MAX,
  SOCIAL_REACTIONS_MAX,
} from '../constants/socialLimits';

/**
 * Versión del formato del fichero. Si algún día cambia de forma (otro tipo de reacción, otro campo), SUBE, y un cliente
 * con una versión menor deja de reescribirlo (`canRewriteReactionsFile`) en vez de borrar lo que no entiende.
 */
export const REACTIONS_FILE_VERSION = 1;

/** A qué se reacciona: una entrada de `activity` (reseña) o de `posts` del gist del autor. */
export type SocialReactionTarget = 'activity' | 'post';

/**
 * El tipo de reacción. Hoy solo hay uno, a propósito: ni negativas ni de intensidad. Se guarda igualmente para que
 * ampliarlo no exija migrar los ficheros que ya existan.
 */
export type SocialReactionKind = 'like';

export interface SocialReactionEntry {
  on: SocialReactionTarget;
  /** Pseudónimo público (`profileId`) del autor de lo que gusta. Nunca el uid de Firebase. */
  to: string;
  /** `id` de la entrada dentro del gist de `to`. Estable: editar una reseña no lo cambia (`buildActivityKey`). */
  item: string;
  kind: SocialReactionKind;
  /** Instante de la última decisión sobre este destino, poner o quitar. Es lo que decide la fusión. */
  at: number;
  /** Lápida: se quitó. */
  del?: true;
}

export interface SocialReactionsFile {
  v: number;
  updatedAt: number;
  items: SocialReactionEntry[];
}

/** El destino de una reacción, como clave única dentro del fichero de una persona. */
export function reactionTargetKey(entry: Pick<SocialReactionEntry, 'on' | 'to' | 'item'>): string {
  return `${entry.on}|${entry.to}|${entry.item}`;
}

/** ¿Gana `a` sobre `b` para el mismo destino? El más reciente; si empatan, la lápida (quitar es lo prudente). */
function wins(a: SocialReactionEntry, b: SocialReactionEntry): boolean {
  if (a.at !== b.at) return a.at > b.at;
  return Boolean(a.del) && !b.del;
}

/** Más reciente primero; a igual instante, por clave, para que dos dispositivos escriban el mismo orden. */
function byRecency(a: SocialReactionEntry, b: SocialReactionEntry): number {
  return b.at - a.at || reactionTargetKey(a).localeCompare(reactionTargetKey(b));
}

/**
 * Recorta el fichero a sus topes: los `SOCIAL_REACTIONS_MAX` vivos más recientes y, aparte, las lápidas de menos de
 * `SOCIAL_REACTION_TOMBSTONE_DAYS` días hasta su propio tope. Los vivos NO caducan por fecha (ver la constante).
 */
export function pruneReactions(items: readonly SocialReactionEntry[], now: number): SocialReactionEntry[] {
  const tombstoneSince = now - SOCIAL_REACTION_TOMBSTONE_DAYS * 24 * 60 * 60 * 1000;
  const sorted = [...items].sort(byRecency);
  const live = sorted.filter((entry) => !entry.del).slice(0, SOCIAL_REACTIONS_MAX);
  const tombstones = sorted
    .filter((entry) => entry.del && entry.at >= tombstoneSince)
    .slice(0, SOCIAL_REACTION_TOMBSTONES_MAX);
  return [...live, ...tombstones].sort(byRecency);
}

/**
 * Funde dos copias del fichero de UNA persona (la de este dispositivo y la que hay en el gist): una entrada por
 * destino, la que gane (`wins`). Conmutativa: el resultado no depende de qué copia llegue primero.
 */
export function mergeReactions(
  a: readonly SocialReactionEntry[],
  b: readonly SocialReactionEntry[],
  now: number,
): SocialReactionEntry[] {
  const byTarget = new Map<string, SocialReactionEntry>();
  for (const entry of [...a, ...b]) {
    const key = reactionTargetKey(entry);
    const current = byTarget.get(key);
    if (!current || wins(entry, current)) byTarget.set(key, entry);
  }
  return pruneReactions([...byTarget.values()], now);
}

/**
 * Pone o quita el «me gusta» de un destino. Quitar deja una lápida; quitar lo que no estaba puesto no cambia nada
 * (devuelve la MISMA lista, para que quien escribe pueda saltarse el `PATCH`).
 */
export function setReaction(
  items: readonly SocialReactionEntry[],
  target: Pick<SocialReactionEntry, 'on' | 'to' | 'item'>,
  liked: boolean,
  now: number,
): readonly SocialReactionEntry[] {
  const key = reactionTargetKey(target);
  const current = items.find((entry) => reactionTargetKey(entry) === key);
  const isLiked = Boolean(current && !current.del);
  if (isLiked === liked) return items;
  const next: SocialReactionEntry = liked
    ? { on: target.on, to: target.to, item: target.item, kind: 'like', at: now }
    : { on: target.on, to: target.to, item: target.item, kind: 'like', at: now, del: true };
  return pruneReactions([next, ...items.filter((entry) => reactionTargetKey(entry) !== key)], now);
}

function cleanId(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, SOCIAL_ID_MAX) : '';
}

/**
 * Lectura DEFENSIVA del fichero de otra persona (o del propio). Lo que no tenga la forma esperada se descarta entrada
 * a entrada en vez de tirar el fichero entero, y también los tipos de reacción que esta versión no conoce: los habrá
 * escrito una versión más nueva, y aquí no hay forma de pintarlos.
 *
 * Nunca lanza: un fichero ilegible es un fichero sin «me gusta», no un fallo de lectura del perfil.
 */
export function normalizeReactions(raw: unknown, now: number): SocialReactionEntry[] {
  const items = raw && typeof raw === 'object' ? (raw as { items?: unknown }).items : undefined;
  if (!Array.isArray(items)) return [];
  const clean: SocialReactionEntry[] = [];
  for (const candidate of items.slice(0, SOCIAL_REACTIONS_MAX + SOCIAL_REACTION_TOMBSTONES_MAX)) {
    if (!candidate || typeof candidate !== 'object') continue;
    const record = candidate as Record<string, unknown>;
    const on = record.on;
    const to = cleanId(record.to);
    const item = cleanId(record.item);
    const at = Number(record.at);
    if ((on !== 'activity' && on !== 'post') || !to || !item || record.kind !== 'like') continue;
    if (!Number.isFinite(at) || at <= 0) continue;
    clean.push(record.del === true ? { on, to, item, kind: 'like', at, del: true } : { on, to, item, kind: 'like', at });
  }
  // Fundirlo consigo mismo deduplica los destinos repetidos (un fichero escrito a mano) y aplica los topes.
  return mergeReactions(clean, [], now);
}

/**
 * ¿Puede este cliente reescribir el fichero que ha leído? No si lo escribió una versión MÁS NUEVA del formato: lo
 * que no entiende lo perdería al normalizar, que es justo el problema que el fichero aparte vino a evitar. Un fichero
 * ausente o ilegible sí se puede escribir (se empieza de cero).
 */
export function canRewriteReactionsFile(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return true;
  const version = Number((raw as { v?: unknown }).v);
  return !Number.isFinite(version) || version <= REACTIONS_FILE_VERSION;
}

/** Los «me gusta» de una persona, tal y como se leyeron de su gist. */
export interface ProfileReactions {
  /** Pseudónimo público de quien los dio. */
  fromProfileId: string;
  items: readonly SocialReactionEntry[];
}

/**
 * Quién ha dado «me gusta» a cada destino, cruzando los ficheros de varias personas. Las lápidas no cuentan. El
 * orden de cada lista es el de llegada de los ficheros, sin duplicados: quien pinta decide cómo ordenar los nombres.
 */
export function indexReactionsByTarget(profiles: readonly ProfileReactions[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const profile of profiles) {
    for (const entry of profile.items) {
      if (entry.del) continue;
      const key = reactionTargetKey(entry);
      const likers = index.get(key) ?? [];
      if (!likers.includes(profile.fromProfileId)) likers.push(profile.fromProfileId);
      index.set(key, likers);
    }
  }
  return index;
}
