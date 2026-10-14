// «ME GUSTA» EN EL FEED: a qué se le puede dar, y quién se lo ha dado.
//
// Solo a lo que alguien ha ESCRITO: reseñas y publicaciones. Los avisos de lista, los logros y el resumen del año no:
// un «me gusta» en «abandonó X» es incómodo, y el objetivo es que quien escribe se sienta leído
// (docs/plan-reacciones.md, Fase 0).
//
// EL DESTINO SALE DEL ELEMENTO, NO DEL DIRECTORIO. El autor de una reseña es su `actorProfileId` y el de una publicación
// su `authorProfileId`: los pseudónimos que están en el propio gist, que es lo que verá cualquier otra amistad al
// leerlo. El `id` de la entrada del directorio no sirve: para una amistad es su uid de Firebase, que no se publica.
import { reactionTargetKey, type SocialReactionEntry } from './reactions';

/** Lo mínimo de un elemento del feed para saber si admite «me gusta» y a qué destino va. */
export interface LikeableFeedItem {
  kind?: string;
  id: string;
  /** Reseña: tipo de actividad (`review`; `recommendation` es heredado y no admite «me gusta»). */
  type?: string;
  actorProfileId?: string;
  authorProfileId?: string;
}

export type LikeTarget = Pick<SocialReactionEntry, 'on' | 'to' | 'item'>;

/** El destino de un «me gusta» para este elemento, o `null` si no admite. */
export function likeTargetOf(item: LikeableFeedItem): LikeTarget | null {
  if (!item.id) return null;
  if (item.kind === 'post') {
    return item.authorProfileId ? { on: 'post', to: item.authorProfileId, item: item.id } : null;
  }
  if (item.kind === undefined && item.type === 'review') {
    return item.actorProfileId ? { on: 'activity', to: item.actorProfileId, item: item.id } : null;
  }
  return null;
}

/** Los «me gusta» que ha dado una persona, con el nombre con el que se la nombra. */
export interface FeedLiker {
  /** Identidad estable de la persona en el directorio (su uid): deduplica a quien aparezca dos veces. */
  key: string;
  name: string;
  /** ¿Es la cuenta del administrador? Su nombre va el primero de la frase. */
  admin?: boolean;
  reactions: readonly SocialReactionEntry[];
}

export interface FeedLikes {
  /**
   * Quiénes: el administrador el primero, si le ha dado, y el resto por orden de llegada, del primero que pulsó al
   * último. Así, cuando la frase resume («A Diego y a 5 más»), los que se quedan dentro de la cuenta son los últimos
   * en llegar (decisión del usuario, 14-10-2026). Nunca incluye a quien mira: eso lo dice `mine`.
   */
  names: string[];
  /** ¿Le has dado tú «me gusta»? */
  mine: boolean;
}

const NO_LIKES: FeedLikes = { names: [], mine: false };

/**
 * Prepara la consulta de «me gusta» del feed: un índice por destino con los nombres de quienes lo han dado, más los
 * tuyos. Devuelve una función para no recalcular nada por elemento: el feed la llama en cada tarjeta.
 *
 * `own` son tus «me gusta» vivos, que llegan aparte (fichero propio y cola de este dispositivo) porque van por
 * delante de la copia del directorio.
 */
export function buildFeedLikes(
  likers: readonly FeedLiker[],
  own: readonly SocialReactionEntry[],
): (item: LikeableFeedItem) => FeedLikes {
  const byTarget = new Map<string, Array<{ key: string; name: string; admin: boolean; at: number }>>();
  for (const liker of likers) {
    for (const reaction of liker.reactions) {
      if (reaction.del) continue;
      const target = reactionTargetKey(reaction);
      const list = byTarget.get(target) ?? [];
      const existing = list.find((entry) => entry.key === liker.key);
      // La misma persona dos veces en el directorio: cuenta desde la PRIMERA vez que pulsó.
      if (existing) existing.at = Math.min(existing.at, reaction.at);
      else list.push({ key: liker.key, name: liker.name, admin: Boolean(liker.admin), at: reaction.at });
      byTarget.set(target, list);
    }
  }
  const mine = new Set(own.filter((reaction) => !reaction.del).map(reactionTargetKey));

  return (item) => {
    const target = likeTargetOf(item);
    if (!target) return NO_LIKES;
    const key = reactionTargetKey(target);
    const list = byTarget.get(key);
    const isMine = mine.has(key);
    if (!list?.length && !isMine) return NO_LIKES;
    const names = [...(list ?? [])]
      .sort((a, b) => Number(b.admin) - Number(a.admin) || a.at - b.at || a.name.localeCompare(b.name))
      .map((entry) => entry.name);
    return { names, mine: isMine };
  };
}
