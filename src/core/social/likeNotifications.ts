// LOS «ME GUSTA» QUE TE HAN DADO, como notificaciones de la campana del feed (docs/plan-notificaciones-y-buscador.md).
//
// No hay dato nuevo: los «me gusta» de tus amistades ya llegan con su entrada del directorio (los mismos que pinta la
// frase debajo de cada tarjeta). Aquí solo se quedan los que van a lo TUYO —tus reseñas y tus publicaciones— y se
// agrupan en UNA FILA POR DESTINO: «A Marta y a Nacho les gusta tu reseña de Hades II».
//
// SE AVISA UNA VEZ POR PERSONA Y DESTINO. La clave de «visto» (`likeSeenKey`) es quién + a qué, SIN el instante: quitar
// el «me gusta» y volver a ponerlo cambia `at`, y eso no debe volver a encender la campana.
//
// Y SE FILTRA CONTRA TUS DESTINOS DE VERDAD, no solo contra tu pseudónimo: un «me gusta» a una reseña que ya has
// borrado apunta a algo que no existe y no se puede abrir, así que no avisa.
import { reactionTargetKey, type SocialReactionEntry, type SocialReactionTarget } from './reactions';

/** Una amistad y los «me gusta» que ha dado. `key` es su identidad estable en el directorio (su uid). */
export interface LikeNotificationLiker {
  key: string;
  name: string;
  reactions: readonly SocialReactionEntry[];
}

/** Algo tuyo que admite «me gusta», con lo necesario para nombrarlo y abrirlo. */
export interface OwnLikeTarget {
  on: SocialReactionTarget;
  /** Pseudónimo con el que firmas esa entrada en tu gist: es el `to` de los «me gusta» que recibe. */
  to: string;
  item: string;
  /** Reseña: el juego. */
  gameId?: number;
  gameName?: string;
  /** Publicación: su texto, para el adelanto de la fila. */
  text?: string;
}

/** Una fila de la campana: un destino tuyo y quiénes le han dado «me gusta» que se enseñan. */
export interface LikeNotification {
  /** Clave del destino (`reactionTargetKey`): identidad de la fila. */
  target: string;
  own: OwnLikeTarget;
  /** Nombres, del «me gusta» más reciente al más antiguo. */
  names: string[];
  /** Claves de visto de esas personas en este destino. */
  seenKeys: string[];
  /** ¿Hay en la fila algún «me gusta» sin ver? Las filas que ya se enseñaron en esta visita no lo tienen. */
  hasNew: boolean;
  /** Instante del «me gusta» más reciente de la fila: ordena las filas. */
  at: number;
}

/** La clave de «visto»: una persona y un destino. Sin el instante, a propósito (ver la cabecera). */
export function likeSeenKey(likerKey: string, target: Pick<SocialReactionEntry, 'on' | 'to' | 'item'>): string {
  return `${likerKey}|${reactionTargetKey(target)}`;
}

/**
 * Tus destinos, sacados de tu propia entrada del directorio. Solo reseñas (`type: 'review'`; `recommendation` es
 * heredado y no admite «me gusta») y publicaciones, que es lo único que lo admite (`likeTargetOf`).
 */
export function ownLikeTargets(entry: {
  activity?: ReadonlyArray<{ id: string; type?: string; actorProfileId?: string; gameId?: number; gameName?: string }>;
  posts?: ReadonlyArray<{ id: string; authorProfileId?: string; text?: string }>;
} | null | undefined): OwnLikeTarget[] {
  if (!entry) return [];
  const targets: OwnLikeTarget[] = [];
  for (const item of entry.activity ?? []) {
    if (item.type !== 'review' || !item.id || !item.actorProfileId) continue;
    targets.push({ on: 'activity', to: item.actorProfileId, item: item.id, gameId: item.gameId, gameName: item.gameName });
  }
  for (const post of entry.posts ?? []) {
    if (!post.id || !post.authorProfileId) continue;
    targets.push({ on: 'post', to: post.authorProfileId, item: post.id, text: post.text });
  }
  return targets;
}

/**
 * Las filas de la campana. `show` decide, por clave de visto, qué «me gusta» se enseñan (los nuevos y los que ya se
 * enseñaron en esta visita); `isNew`, cuáles cuentan como nuevos. Una fila sin nadie que enseñar no sale.
 */
export function buildLikeNotifications(
  likers: readonly LikeNotificationLiker[],
  ownTargets: readonly OwnLikeTarget[],
  { show, isNew }: { show: (seenKey: string) => boolean; isNew: (seenKey: string) => boolean },
): LikeNotification[] {
  const targets = new Map(ownTargets.map((target) => [reactionTargetKey(target), target]));
  const rows = new Map<string, { own: OwnLikeTarget; people: Map<string, { name: string; at: number; seenKey: string }> }>();
  for (const liker of likers) {
    for (const reaction of liker.reactions) {
      if (reaction.del) continue;
      const target = reactionTargetKey(reaction);
      const own = targets.get(target);
      if (!own) continue;
      const seenKey = likeSeenKey(liker.key, reaction);
      if (!show(seenKey)) continue;
      const row = rows.get(target) ?? { own, people: new Map() };
      const existing = row.people.get(liker.key);
      // La misma persona dos veces (deriva de gists): una sola vez en la fila, con su instante más reciente.
      if (!existing || reaction.at > existing.at) row.people.set(liker.key, { name: liker.name, at: reaction.at, seenKey });
      rows.set(target, row);
    }
  }
  return [...rows.entries()]
    .map(([target, { own, people }]) => {
      const sorted = [...people.values()].sort((a, b) => b.at - a.at || a.name.localeCompare(b.name));
      return {
        target,
        own,
        names: sorted.map((person) => person.name),
        seenKeys: sorted.map((person) => person.seenKey),
        hasNew: sorted.some((person) => isNew(person.seenKey)),
        at: sorted[0]?.at ?? 0,
      };
    })
    .sort((a, b) => b.at - a.at || a.target.localeCompare(b.target));
}
