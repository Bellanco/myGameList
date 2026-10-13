// LA CAMPANA DE «ME GUSTA»: qué filas enseña la pantalla de notificaciones y cuántas son nuevas
// (docs/plan-notificaciones-y-buscador.md).
//
// Tres reglas del usuario (13-10-2026):
//  - SOLO LO NUEVO. Lo visto no se vuelve a enseñar: no hay «Anteriores».
//  - SE BORRA AL SALIR DEL SOCIAL, no al entrar en la pantalla. Lo que se enseña se apunta como visto en cuanto se
//    pinta (así sobrevive a cerrar la pestaña), pero sigue en la pantalla mientras el hub esté montado: abrir un aviso
//    para ver la reseña y volver atrás no te la deja vacía. Este hook vive con el hub (`SocialHub` monta el view-model),
//    así que lo enseñado en la visita (`shownRef`) se va con él al salir del social.
//  - UNA VEZ POR PERSONA Y DESTINO (`likeSeenKey`).
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildLikeNotifications,
  ownLikeTargets,
  type LikeNotification,
  type LikeNotificationLiker,
} from '../../core/social/likeNotifications';
import { addSeenLikeKeys, getSeenLikeKeys } from '../../model/repository/likeNotificationsSeen';
import type { SocialDirectoryEntry } from './socialFeed';

type LikerEntry = Pick<SocialDirectoryEntry, 'id' | 'uid' | 'displayName' | 'reactions'>;
type OwnEntry = Pick<SocialDirectoryEntry, 'activity' | 'posts'>;

export interface LikeNotificationsOptions {
  /** ¿Está abierto el espacio social, con sesión? Fuera de él no se lee nada. */
  enabled: boolean;
  /** De quién es lo visto: otra cuenta en el mismo navegador no lo hereda. */
  uid: string;
  /** Tus AMISTADES del directorio (sin ti): de un no-amigo no se avisa de nada. */
  friends: readonly LikerEntry[];
  /** Tu propia entrada del directorio: de ahí salen tus reseñas y publicaciones. */
  ownEntry: OwnEntry | null | undefined;
  /** ¿Está en pantalla la de notificaciones? Lo que se pinta ahí pasa a visto. */
  screenOpen: boolean;
}

export interface LikeNotifications {
  /** Las filas de la pantalla: lo nuevo y lo ya enseñado en esta visita. */
  notifications: LikeNotification[];
  /** Filas con algún «me gusta» sin ver: es lo que suma el número de la campana. */
  newCount: number;
}

const EMPTY: LikeNotification[] = [];

export function useLikeNotifications({ enabled, uid, friends, ownEntry, screenOpen }: LikeNotificationsOptions): LikeNotifications {
  /** `null` mientras se lee: hasta saber qué está visto no se avisa de nada, para no encender la campana en falso. */
  const [seen, setSeen] = useState<ReadonlySet<string> | null>(null);
  /** Lo enseñado en esta visita al hub: sigue en pantalla aunque ya esté visto. */
  const shownRef = useRef(new Set<string>());
  /** Las escrituras van en fila: dos seguidas leerían la misma copia y la segunda pisaría a la primera. */
  const writeRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!enabled || !uid) return undefined;
    let alive = true;
    void getSeenLikeKeys(uid)
      .catch(() => new Set<string>())
      .then((keys) => {
        if (alive) setSeen(keys);
      });
    return () => {
      alive = false;
    };
  }, [enabled, uid]);

  const likers = useMemo<LikeNotificationLiker[]>(
    () => friends
      .filter((entry) => entry.reactions?.length)
      .map((entry) => ({ key: entry.uid || entry.id, name: entry.displayName, reactions: entry.reactions ?? [] })),
    [friends],
  );
  const targets = useMemo(() => ownLikeTargets(ownEntry), [ownEntry]);

  const notifications = useMemo(() => {
    if (!enabled || !seen) return EMPTY;
    const shown = shownRef.current;
    return buildLikeNotifications(likers, targets, {
      show: (key) => !seen.has(key) || shown.has(key),
      isNew: (key) => !seen.has(key),
    });
  }, [enabled, seen, likers, targets]);

  // Al pintarse la pantalla, lo nuevo pasa a visto: se apunta en IndexedDB y en la visita.
  useEffect(() => {
    if (!screenOpen || !seen || !uid) return;
    const fresh = notifications.flatMap((row) => row.seenKeys).filter((key) => !seen.has(key));
    if (fresh.length === 0) return;
    for (const key of fresh) shownRef.current.add(key);
    setSeen(new Set([...seen, ...fresh]));
    writeRef.current = writeRef.current.then(() => addSeenLikeKeys(uid, fresh)).catch(() => {});
  }, [screenOpen, seen, uid, notifications]);

  const newCount = useMemo(() => notifications.filter((row) => row.hasNew).length, [notifications]);
  return { notifications, newCount };
}
