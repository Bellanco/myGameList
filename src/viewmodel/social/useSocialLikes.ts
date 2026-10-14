// «ME GUSTA» DEL HUB: quién le ha dado a cada cosa del feed, si se lo has dado tú, y el gesto de darlo o quitarlo.
//
// Dos fuentes, a propósito:
//  - Los de tus AMISTADES salen del directorio (`SocialDirectoryEntry.reactions`), que los trae dentro de la misma
//    lectura de su gist social: ni una petición más.
//  - Los TUYOS salen de tu propio fichero y de la cola de este dispositivo (`getOwnSocialLikes`), no de tu entrada del
//    directorio: esa copia dura media hora y, tras subir un «me gusta», el botón volvería a salir sin marcar.
//
// Pulsar se ve al momento (estado local) y la subida va después, agrupada (`setSocialLike`). Al abrir el hub se
// reintenta lo que hubiera quedado en la cola de otra visita (`flushSocialLikes`).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ADMIN_ONLY_TIER } from '../../core/constants/tiers';
import { buildFeedLikes, likeTargetOf, type FeedLikes, type LikeableFeedItem } from '../../core/social/feedLikes';
import { reactionTargetKey, setReaction, type SocialReactionEntry } from '../../core/social/reactions';
import {
  flushSocialLikes,
  getOwnSocialLikes,
  retireSocialLikesTo,
  setSocialLike,
} from '../../model/repository/socialReactionsRepository';
import type { SocialDirectoryEntry } from './socialFeed';

export interface SocialLikesOptions {
  /** ¿Está abierto el espacio social, con sesión y canal? Fuera de él no se lee ni se sube nada. */
  enabled: boolean;
  /** El directorio SIN tu propia entrada: de aquí salen los «me gusta» de tus amistades y sus nombres. */
  others: readonly Pick<SocialDirectoryEntry, 'id' | 'uid' | 'displayName' | 'tier' | 'reactions' | 'activity' | 'posts'>[];
}

export interface SocialLikes {
  /** Quién le ha dado «me gusta» a este elemento del feed y si se lo has dado tú. Sin «me gusta», listas vacías. */
  likesFor: (item: LikeableFeedItem) => FeedLikes;
  /** ¿Admite «me gusta» este elemento? Solo reseñas y publicaciones. */
  canLike: (item: LikeableFeedItem) => boolean;
  /** Da o quita tu «me gusta». */
  toggleLike: (item: LikeableFeedItem) => void;
  /** Retira tus «me gusta» a una persona (al dejar de ser amigos). Por uid: es lo que conoce la pantalla de amistades. */
  retireLikesOf: (uid: string) => void;
  /** Cuántos «me gusta» tuyos están vivos: uno por destino. Es la cifra del logro «Palmadita en la espalda». */
  givenCount: number;
}

export function useSocialLikes({ enabled, others }: SocialLikesOptions): SocialLikes {
  const [own, setOwn] = useState<readonly SocialReactionEntry[]>([]);
  const ownRef = useRef(own);
  ownRef.current = own;
  const othersRef = useRef(others);
  othersRef.current = others;
  /** Destinos tocados en esta visita: para ellos manda lo pulsado, aunque llegue después una lectura más vieja. */
  const touchedRef = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    void getOwnSocialLikes().then((likes) => {
      // Lo pulsado mientras se leía ya está en el estado: la lectura no lo puede pisar, ni para poner ni para quitar.
      if (alive) setOwn((current) => mergeOwn(likes, current, touchedRef.current));
    });
    void flushSocialLikes().catch(() => {});
    return () => {
      alive = false;
    };
  }, [enabled]);

  const likers = useMemo(
    () => others
      .filter((entry) => entry.reactions?.length)
            // El rango reservado a la cuenta del administrador es lo que la distingue en el directorio: el claim solo lo ve
      // ella misma. Solo ordena la frase; no se nombra en ningún sitio (los rangos no se enseñan a nadie más).
      .map((entry) => ({
        key: entry.uid || entry.id,
        name: entry.displayName,
        admin: entry.tier === ADMIN_ONLY_TIER,
        reactions: entry.reactions ?? [],
      })),
    [others],
  );
  const likesFor = useMemo(() => buildFeedLikes(likers, own), [likers, own]);
  const canLike = useCallback((item: LikeableFeedItem) => likeTargetOf(item) !== null, []);

  const toggleLike = useCallback((item: LikeableFeedItem) => {
    const target = likeTargetOf(item);
    if (!target) return;
    const key = reactionTargetKey(target);
    const liked = !ownRef.current.some((entry) => reactionTargetKey(entry) === key);
    touchedRef.current.add(key);
    setOwn((current) => setReaction(current, target, liked, Date.now()).filter((entry) => !entry.del));
    void setSocialLike(target, liked).catch(() => {});
  }, []);

  const retireLikesOf = useCallback((uid: string) => {
    const entry = othersRef.current.find((candidate) => candidate.uid === uid);
    if (!entry) return;
    // Los pseudónimos con los que esa persona firma en su gist: son los destinos de tus «me gusta». No el id del
    // directorio, que para una amistad es su uid de Firebase y nunca es destino de nada.
    const ids = new Set([
      ...(entry.activity ?? []).map((item) => item.actorProfileId),
      ...(entry.posts ?? []).map((item) => item.authorProfileId),
    ].filter(Boolean));
    setOwn((current) => {
      for (const reaction of current) if (ids.has(reaction.to)) touchedRef.current.add(reactionTargetKey(reaction));
      return current.filter((reaction) => !ids.has(reaction.to));
    });
    for (const id of ids) void retireSocialLikesTo(id).catch(() => {});
  }, []);

  return { likesFor, canLike, toggleLike, retireLikesOf, givenCount: own.length };
}

/** Lo leído, salvo los destinos tocados en esta visita, que se quedan como están en el estado local. */
function mergeOwn(
  read: readonly SocialReactionEntry[],
  local: readonly SocialReactionEntry[],
  touched: ReadonlySet<string>,
): SocialReactionEntry[] {
  const fromRead = read.filter((entry) => !touched.has(reactionTargetKey(entry)));
  const readKeys = new Set(fromRead.map(reactionTargetKey));
  return [...fromRead, ...local.filter((entry) => touched.has(reactionTargetKey(entry)) && !readKeys.has(reactionTargetKey(entry)))];
}
