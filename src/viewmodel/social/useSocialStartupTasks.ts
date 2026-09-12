import { useEffect, useRef } from 'react';
import { getLocalMeta, patchLocalMeta } from '../../model/repository/indexedDbRepository';
import {
  healOwnFriendshipIdentity,
  purgeOwnPublicGistIds,
  repairProfileDisplayName,
  touchOwnProfileActivityThrottled,
} from '../../model/repository/firebaseRepository';
import type { LocalMeta } from '../../model/types/local';

/**
 * SANEADOS DE ARRANQUE DEL ESPACIO SOCIAL: las tareas idempotentes que se disparan al abrir el hub.
 *
 * POR QUÉ EXISTE ESTE HOOK. Estas tareas vivían como cuatro efectos suyos dentro de `useSocialViewModel`, cada uno
 * con su `useRef` de una vez, su `void`, su `catch` y su lista de dependencias. Cuatro copias de la misma política
 * significan cuatro sitios donde olvidarla, y se olvidó en el que importa: el `useRef` MUERE CON EL DESMONTAJE
 * del hub, así que abrir el espacio social diez veces en una sesión disparaba las cuatro diez veces.
 *
 * LO QUE ESO COSTABA, medido con el emulador (`npm run emulate:social`): con la caché del directorio caliente y
 * CERO lecturas de gist, dos aperturas del hub producían dos `repairProfileDisplayName`, dos
 * `purgeOwnPublicGistIds`, dos `healOwnFriendshipIdentity` y dos latidos — es decir, varias lecturas de documento
 * de Firestore antes de pintar nada, para descubrir que no había nada que hacer.
 *
 * LA POLÍTICA, ahora escrita UNA vez: cada tarea declara una HUELLA de sus entradas. Si la huella coincide con la
 * que este dispositivo dejó sellada la última vez que la tarea terminó bien, no se ejecuta. El sello vive en
 * `LocalMeta` (IndexedDB), así que sobrevive al desmontaje del hub y a la recarga de la página, que es justo lo
 * que el `useRef` no hacía.
 *
 * POR DISPOSITIVO Y NO POR CUENTA, igual que `friendshipIdentityFingerprint` y `photoHealedFor`, que ya seguían
 * este patrón: la foto publicable y el gist de la sesión se resuelven en cada dispositivo por separado, así que un
 * sello compartido daría por propagado lo que este nunca escribió.
 *
 * Y SOLO SE SELLA SI TERMINÓ BIEN. Un fallo (red, permisos) deja la tarea sin sellar para que el siguiente
 * arranque lo reintente: el sello dice «esto ya está hecho», no «esto ya se intentó».
 *
 * LO QUE NO ESTÁ AQUÍ, y por qué. La migración del canal a gist secreto y el saneado de la foto se quedan en el
 * compositor: no son «una llamada best-effort», sino cadenas de varios pasos que escriben el gist, hablan con el
 * usuario (`setFeedback`) y parchean el directorio en memoria. Traerlas obligaría a arrastrar aquí la mitad del
 * estado del hub. Las dos tienen su propio sello persistente en su sitio (`socialChannelPrivateFor` y
 * `photoHealedFor`), que es la parte que importaba.
 */

/**
 * Cada cuánto vuelve a intentarse una tarea YA SELLADA con la misma huella.
 *
 * «Solo se sella si terminó bien» es cierto a medias: se sella si `run()` no LANZÓ, y estas tareas son
 * best-effort —devuelven `false` en vez de lanzar cuando no pudieron hacer su trabajo—. `repairProfileDisplayName`
 * se rinde así sin servicios, con el perfil aún sin crear o cuando vive bajo otro id; `purgeOwnPublicGistIds`,
 * mientras no haya respaldo en `privateConfig`. Ninguno de esos estados es definitivo, pero el sello los
 * congelaba: como la huella es el nick (o el par de gists), no se reintentaba mientras no cambiaran.
 *
 * Una semana, lo mismo que `FRIENDSHIP_IDENTITY_RECHECK_MS`: una lectura de documento por dispositivo y semana
 * para que ningún «no he podido» se quede como «ya está hecho».
 */
const STARTUP_STAMP_RECHECK_MS = 7 * 24 * 60 * 60 * 1000;

/** Una tarea de arranque: cuándo puede correr, con qué huella y qué hace. */
interface StartupTask {
  /** Nombre para la traza; también identifica la tarea en los avisos. */
  name: string;
  /**
   * Huella de las entradas. Cadena vacía = «todavía no se puede saber», y entonces la tarea NO corre ni se sella:
   * es lo que evita sanear con un nick vacío o con la foto sin veredicto, que era el fallo original.
   */
  fingerprint: string;
  /** Campo de `LocalMeta` donde vive el sello. `undefined` = la tarea se guarda por su cuenta (ya lo hacía). */
  stamp?: keyof LocalMeta;
  /**
   * Campo de `LocalMeta` con la FECHA de ese sello. Con él, el sello caduca a los `STARTUP_STAMP_RECHECK_MS`;
   * sin él vale para siempre, que solo es correcto en una tarea que de verdad se haga una vez.
   */
  stampAt?: keyof LocalMeta;
  run: () => Promise<unknown>;
}

export interface SocialStartupTasksOptions {
  /** ¿Está abierto el espacio social? Fuera de él no se sanea nada. */
  socialSpaceOpen: boolean;
  uid: string | undefined;
  /** Gist social de la sesión. Sin canal no hay nada que sanear. */
  socialGistId: string;
  /** Gist de juegos, que viaja denormalizado a los documentos de amistad. */
  gamesGistId: string;
  /** Nick ya hidratado. Vacío = aún no se sabe: se espera en vez de sanear con vacío. */
  profileName: string;
  /** Foto publicable de la sesión (ya filtrado el monograma genérico de Google). */
  ownPublishablePhoto: string;
  /** ¿Sigue sin resolverse si la foto es genérica? Mientras lo esté, no se sella nada que lleve foto. */
  ownPhotoVerdictPending: boolean;
}

export function useSocialStartupTasks(options: SocialStartupTasksOptions): void {
  const {
    socialSpaceOpen,
    uid,
    socialGistId,
    gamesGistId,
    profileName,
    ownPublishablePhoto,
    ownPhotoVerdictPending,
  } = options;

  /**
   * Tareas ya lanzadas EN ESTE MONTAJE. Sigue haciendo falta además del sello persistente, y no es redundante: el
   * sello se escribe cuando la tarea TERMINA, y entre el disparo y ese momento hay una ida y vuelta a la red en la
   * que un re-render volvería a lanzarla. Esto acota la carrera; el sello acota las sesiones.
   */
  const launchedRef = useRef(new Set<string>());

  const nick = profileName.trim();

  useEffect(() => {
    if (!socialSpaceOpen || !uid || !socialGistId) {
      return;
    }

    const tasks: StartupTask[] = [
      {
        // PRIVACIDAD: propaga el nick y la foto actuales a mis documentos de amistad, que pudieron guardar un
        // nombre antiguo (o real) antes del arreglo. Se espera al veredicto de la foto para no sellar el
        // monograma genérico de Google justo donde va denormalizado y donde más se ve.
        name: 'friendshipIdentity',
        fingerprint: nick && !ownPhotoVerdictPending ? `${nick}|${ownPublishablePhoto}|${socialGistId}|${gamesGistId}` : '',
        // Sin sello propio: `healOwnFriendshipIdentity` YA lleva el suyo dentro
        // (`friendshipIdentityFingerprint`), y duplicarlo aquí solo añadiría un sitio donde desincronizarse.
        run: () => healOwnFriendshipIdentity(uid, {
          name: nick,
          photo: ownPublishablePhoto,
          socialGistId,
          gamesGistId,
        }),
      },
      {
        // La réplica del nick en `profiles` (la que lee el directorio) puede quedar desacordada con el gist, que
        // es la fuente. Silenciosa cuando funciona: solo escribe si de verdad había desacuerdo.
        name: 'profileName',
        fingerprint: nick,
        stamp: 'profileNameRepairedFor',
        stampAt: 'profileNameRepairedAt',
        run: () => repairProfileDisplayName(uid, nick),
      },
      {
        // Retira del perfil PÚBLICO los ids de gist que aún anuncie. Vive aquí y no dentro de la migración a
        // canal secreto porque quien ya migró en otra sesión no vuelve a entrar en ella y se quedaba publicando
        // un gist borrado indefinidamente.
        name: 'purgePublicGistIds',
        fingerprint: `${socialGistId}|${gamesGistId}`,
        stamp: 'publicGistIdsPurgedFor',
        stampAt: 'publicGistIdsPurgedAt',
        run: () => purgeOwnPublicGistIds({ uid, socialGistId, gamesGistId }),
      },
      {
        // Latido de uso reciente (`profiles.updatedAt`), por el que ordena el directorio. No lleva sello de los
        // de aquí: el repositorio ya lo acota a una escritura diaria por dispositivo, que es una regla de
        // cadencia y no de «ya está hecho».
        name: 'activityHeartbeat',
        fingerprint: uid,
        run: () => touchOwnProfileActivityThrottled(uid),
      },
    ];

    let cancelled = false;

    void (async () => {
      // Una sola lectura de `LocalMeta` para todas: son cuatro sellos en el mismo registro.
      const meta = await getLocalMeta().catch(() => null);

      for (const task of tasks) {
        if (cancelled) return;
        // Huella vacía = todavía no se puede saber. Ni corre ni se sella: se reintentará cuando se sepa.
        if (!task.fingerprint) continue;
        if (launchedRef.current.has(task.name)) continue;
        const sellada = task.stamp && meta?.[task.stamp] === task.fingerprint;
        // Con fecha, el sello caduca; sin ella vale para siempre (ver `STARTUP_STAMP_RECHECK_MS`).
        const selladoAt = task.stampAt ? Number(meta?.[task.stampAt] || 0) : 0;
        const vigente = !task.stampAt || (selladoAt > 0 && Date.now() - selladoAt < STARTUP_STAMP_RECHECK_MS);
        if (sellada && vigente) continue;

        launchedRef.current.add(task.name);
        try {
          await task.run();
          if (task.stamp) {
            await patchLocalMeta({
              [task.stamp]: task.fingerprint,
              ...(task.stampAt ? { [task.stampAt]: Date.now() } : {}),
            } as Partial<LocalMeta>);
          }
        } catch (error) {
          // Best-effort: ninguna de estas tareas es un requisito para usar el espacio social. Se deja SIN sellar
          // y sin marcar como lanzada, para que el próximo arranque lo reintente.
          launchedRef.current.delete(task.name);
          console.warn(`[social] saneado de arranque «${task.name}» no completado:`, error instanceof Error ? error.message : error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [socialSpaceOpen, uid, socialGistId, gamesGistId, nick, ownPublishablePhoto, ownPhotoVerdictPending]);
}
