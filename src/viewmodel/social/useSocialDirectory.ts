import { useCallback, useEffect, useRef, useState } from 'react';
import { SOCIAL_UI } from '../../core/constants/socialLabels';
import { DEFAULT_PROFILE_TIER, PROFILE_TIER_FEED_TTL_MS, type ProfileTier } from '../../core/constants/tiers';
import { mapWithConcurrency } from '../../core/utils/concurrency';
import { isNetworkFailure, isOffline } from '../../core/utils/network';
import { normalizeTimestamp as toSafeTimestamp } from '../../core/utils/normalize';
import { reviewActorsByGame } from '../../core/social/moveActivity';
import { getCachedSocialDirectory, putCachedSocialDirectory } from '../../model/repository/indexedDbRepository';
import { getSocialSyncConfig, mergeSocialGistData, readPublicSocialGistById, type SocialGistData, type SocialProfileVisibility, type SocialSharedGame } from '../../model/repository/socialGistRepository';
import { listSocialDirectory, type SocialAuthUser } from '../../model/repository/firebaseRepository';
import { isOwnProfileIdentity } from './socialIdentity';
import type { SocialDirectoryEntry } from './socialFeed';
import type { TabId } from '../../model/types/game';
import type { FriendshipView } from '../../model/types/social';

/** Anti-spam del refresco forzado: cada uno relee el directorio y hasta ~50 gists sociales. */
const FORCED_REFRESH_MIN_MS = 12_000;
// Tope de perfiles del directorio, ORDENADOS POR USO RECIENTE (`profiles.updatedAt`). Solo los AMIGOS cuestan una
// lectura de gist; los demás son index-only (nombre/foto de Firestore), así que subir este número cuesta lecturas
// de Firestore, no rate-limit de GitHub. Tunable.
const SOCIAL_DIRECTORY_LIMIT = 50;
// Antigüedad máxima del último uso de un AMIGO para que su actividad entre en el feed. Uno más inactivo sigue en
// Perfiles y en la lista de amigos, y su perfil y sus reseñas se abren igual (salen de su gist de JUEGOS); lo que
// no hace es ocupar el feed ni gastar una lectura de su gist social. Sin dato de recencia NO se corta: nunca se
// oculta contenido por falta de datos. Tunable.
const FRIEND_ACTIVITY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
// El directorio se hidrata leyendo el gist social de cada perfil. En vez de disparar TODAS las lecturas a la vez
// —ráfaga que puede activar los "secondary rate limits" de GitHub al crecer el directorio— se limita la
// concurrencia. Las lecturas son baratas (caché de sesión + revalidación por ETag), así que el coste en latencia
// de la carga fría es pequeño y se gana robustez.
const SOCIAL_DIRECTORY_FETCH_CONCURRENCY = 6;
// Cuánta actividad se conserva por perfil. El feed solo pinta las más recientes, pero la pestaña Reseñas del
// perfil FECHA Y ORDENA cada reseña con su publicación: con un tope bajo, las que caían por debajo se quedaban
// sin fecha publicada y usaban el `_ts` del juego (que una importación sella en bloque), así que el listado
// mostraba fechas distintas del feed. Se iguala al tope del propio gist.
const SOCIAL_ACTIVITY_PER_PROFILE = 320;
// Las publicaciones sí se quedan en el tope del feed: ninguna vista las lista por separado.
const SOCIAL_POSTS_PER_PROFILE = 40;
// F4 — mensajes de lista por perfil. Más alto que las publicaciones porque son varios por juego y el filtro de
// quien mira puede dejar visible una sola lista; más bajo que la actividad porque solo los lista el feed.
const SOCIAL_MOVES_PER_PROFILE = 120;

/**
 * ¿El gist de ese perfil no se pudo leer porque NUESTRA credencial no vale?
 *
 * Se distingue del resto de fallos a propósito: un 404 es "ese perfil ya no publica" y se degrada en silencio,
 * pero un 401/403 es "tu token no sirve" y hay que decirlo, o el usuario se queda con un feed vacío sin saber
 * por qué.
 */
const isGithubCredentialError = (error: unknown): boolean =>
  error instanceof Error && /\b(401|403)\b/.test(error.message);

/**
 * Directorio social y su hidratación: quién sale en el feed, con qué actividad y desde qué caché.
 *
 * Es la pieza más grande de las que salieron de `useSocialViewModel`, y la que más contexto necesita. Su lista de
 * opciones es larga A PROPÓSITO: enseña de golpe todo lo que la hidratación tiene que saber antes de arrancar,
 * que antes estaba repartido entre tres guardas dentro de una función de 350 líneas.
 */
export interface SocialDirectoryOptions {
  /** ¿Toca hidratar? Falso en la pasarela, en el editor de perfil y con el espacio social cerrado. */
  enabled: boolean;
  /**
   * ¿Se sabe ya lo que la hidratación no puede suponer? Amistades resueltas, rango propio y profileId. Va
   * SEPARADO de `enabled` porque significan cosas distintas para la pantalla: aquello es "aquí no hay directorio
   * que cargar" y esto es "todavía no se puede saber". Solo esto último cuenta como carga.
   */
  inputsReady: boolean;
  authUser: SocialAuthUser | null;
  ownProfileId: string | null;
  ownTier: ProfileTier;
  /** Foto propia publicable: entra en la entrada propia sin esperar a que se re-guarde el perfil. */
  ownPublishablePhoto: string;
  socialGistId: string;
  /** Amistades ACEPTADAS. El feed es solo-amigos: de los demás no se lee el gist. */
  friends: FriendshipView[];
  defaultSocialVisibility: SocialProfileVisibility;
  setFeedback: (kind: 'ok' | 'warn' | 'err', message: string, duration?: 'short' | 'long') => void;
  reportFailure: (error: unknown, fallback: string, kind?: 'err' | 'warn') => void;
  /**
   * Marca (o levanta) el fallo de red. Lo detecta este hook, que es quien intenta las lecturas, pero lo PINTA el
   * compositor: `navigator.onLine` no ve un wifi conectado sin salida, y esta es la única señal que sí.
   */
  setNetworkFailure: (failed: boolean) => void;
}

export function useSocialDirectory(options: SocialDirectoryOptions) {
  // Se desestructura con los MISMOS nombres que tenían en el compositor para que el cuerpo de la hidratación
  // —350 líneas de reglas afinadas— se moviera sin tocar una sola de sus referencias.
  const {
    enabled: directoryPanelAllows,
    inputsReady: directoryInputsReady,
    authUser,
    ownProfileId,
    ownTier,
    ownPublishablePhoto,
    socialGistId: socialCfgGistId,
    friends,
    defaultSocialVisibility,
    setFeedback,
    reportFailure,
    setNetworkFailure,
  } = options;

  const [rawSocialDirectory, setSocialDirectory] = useState<SocialDirectoryEntry[]>([]);
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  /**
   * ¿Ha terminado ya una hidratación (o se ha servido de caché)? `loadingDirectory` solo cubre la que está EN
   * VUELO, y antes hay una ventana —amistades y caché de IndexedDB— que no cubría nadie: el feed pintaba su
   * estado vacío y saltaba después al esqueleto. Con esto la carga se lee como una sola escena.
   */
  const [directorySettled, setDirectorySettled] = useState(false);
  const [refreshCoolingDown, setRefreshCoolingDown] = useState(false);
  const lastForcedHydrateRef = useRef(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runDirectoryHydration = useCallback(async (forceRefresh: boolean) => {
    if (!directoryPanelAllows || !authUser || !socialCfgGistId) {
      return;
    }

    // TODO lo que la hidratación necesita saber ANTES de empezar. Las tres cosas se resuelven de forma asíncrona y
    // ninguna admite un valor provisional:
    //   - amigos: el feed es solo-amigos; hidratar sin conocerlos CACHEARÍA a los amigos como index-only (sin
    //     actividad) y el feed quedaría en blanco hasta invalidar la caché;
    //   - rango: de él sale el TTL con el que se evalúa la caché (30 min en bronce, 60 s en mithril);
    //   - profileId propio: con él se decide cuál es la entrada PROPIA y, por tanto, si se lee el gist social de
    //     uno mismo. Sin él, la propia actividad se queda fuera del propio feed.
    //
    // Va SEPARADO de la guarda de arriba porque las dos salidas significan cosas distintas para la pantalla: la de
    // arriba es "aquí no hay directorio que cargar" (pasarela, editor de perfil) y esta es "todavía no se puede
    // saber". Solo esta última debe seguir contando como carga (ver `directoryLoading`).
    if (!directoryInputsReady) {
      return;
    }

    // SIN RED, un refresco forzado no puede traer nada: lo único que haría es tirar la caché de sesión, fallar en
    // la primera lectura y dejar el feed vacío con un error. Se avisa y se conserva lo que ya está en pantalla.
    if (forceRefresh && isOffline()) {
      setFeedback('warn', SOCIAL_UI.status.offline, 'long');
      return;
    }

    // Anti-spam del refresco forzado: cada `forceRefresh` relee el directorio + ~50 gists sociales (cuenta contra el
    // rate-limit del token aunque devuelvan 304). Si se pulsa "Actualizar feed" repetidamente en pocos segundos, se
    // ignora y se avisa. Las cargas automáticas (forceRefresh=false) usan la caché de sesión y no entran aquí.
    if (forceRefresh) {
      const now = Date.now();
      if (now - lastForcedHydrateRef.current < FORCED_REFRESH_MIN_MS) {
        setFeedback('warn', SOCIAL_UI.status.refreshThrottled);
        return;
      }
      lastForcedHydrateRef.current = now;
      // Deshabilita el botón durante el cooldown (en vez de solo avisar al pulsar).
      setRefreshCoolingDown(true);
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = setTimeout(() => setRefreshCoolingDown(false), FORCED_REFRESH_MIN_MS);
    } else {
      // Caché persistente: si el directorio sigue fresco (el TTL lo pone el rango), se sirve de IndexedDB sin releer
      // ningún gist social. Evita el coste N+1 al navegar feed→detalle→feed o al re-renderizar.
      //
      // El `catch` no es decorativo: esta lectura vive FUERA del try/catch de más abajo, así que un IndexedDB roto
      // (modo privado, cuota, base corrupta) hacía que la función entera rechazara antes de asentar el directorio
      // —y con el esqueleto atado a ese asentamiento, la pantalla se quedaba cargando para siempre—. Sin caché
      // utilizable lo correcto es seguir por la vía de red, que es justo lo que hace tratarla como un fallo.
      const cachedDirectory = await getCachedSocialDirectory<SocialDirectoryEntry>(
        socialCfgGistId,
        PROFILE_TIER_FEED_TTL_MS[ownTier],
      ).catch(() => null);
      if (cachedDirectory) {
        setSocialDirectory(cachedDirectory);
        setDirectorySettled(true);
        return;
      }
    }

    try {
      setLoadingDirectory(true);
      const dirEntries = await listSocialDirectory(SOCIAL_DIRECTORY_LIMIT, { forceRefresh });
      const socialConfig = getSocialSyncConfig();
      // Foto propia inmediata (de la sesión Google) aunque aún no se haya re-guardado el perfil; respeta showPhoto y
      // descarta el avatar genérico de Google.
      const ownPhotoURL = ownPublishablePhoto;
      // FEED SOLO-AMIGOS: el gist social (actividad/publicaciones) SOLO se lee de tus amigos y del propio.
      // Los no-amigos quedan index-only (nombre/foto del directorio Firestore), sin lectura de gist → gran ahorro de
      // llamadas. Como el feed deriva su actividad de estas entradas, mostrar solo la de amigos es automático.
      const friendUids = new Set(friends.map((friend) => friend.otherUid));
      // Para un AMIGO, el `otherSocialGistId` del doc de amistad es la fuente FIABLE de su gist social: se sanea en
      // cada apertura del hub (healOwnFriendshipIdentity), mientras que el `social.gistId` del directorio Firestore
      // solo se reescribe al re-publicar el perfil y puede quedar anclado a un gist viejo/vacío. Si divergen, leer el
      // del directorio hace que sus reseñas nunca aparezcan en el feed (bug del amigo con perfil sin re-publicar).
      const friendSocialGistByUid = new Map(
        friends
          .filter((friend) => friend.otherSocialGistId)
          .map((friend) => [friend.otherUid, friend.otherSocialGistId] as const),
      );
      // L1: mismo razonamiento para el gist de JUEGOS. Ya no se publica en el directorio (era legible por cualquier
      // usuario autenticado), así que para un amigo la fuente es su doc de amistad; del directorio solo puede venir
      // el valor legacy de un perfil aún sin purgar. Un no-amigo se queda sin lista de juegos, que es lo pretendido.
      const friendGamesGistByUid = new Map(
        friends
          .filter((friend) => friend.otherGamesGistId)
          .map((friend) => [friend.otherUid, friend.otherGamesGistId] as const),
      );

      // Escalabilidad (>30 amigos): el directorio de descubrimiento está capado a SOCIAL_DIRECTORY_LIMIT y solo lista
      // perfiles con `social.enabled`. Para que NINGÚN amigo desaparezca del feed / detalle / gestión por caer fuera
      // de ese tope (o por desactivar social), se sintetizan entradas para los amigos ausentes usando los datos
      // DENORMALIZADOS del doc de amistad (nombre/foto/gists). Así los amigos son autosuficientes e independientes del
      // tope del directorio; los pendientes NO se sintetizan (no son amigos aún).
      const directoryUids = new Set(dirEntries.map((entry) => entry.uid));
      const friendOnlyEntries = friends
        // No se exige `otherSocialGistId`: sin él el amigo desaparecía por completo del hub (ni perfil ni gestión).
        // Entra igual como index-only; sin gist social simplemente no aporta actividad.
        .filter((friend) => !directoryUids.has(friend.otherUid))
        .map((friend) => ({
          id: friend.otherUid,
          uid: friend.otherUid,
          displayName: friend.otherName || 'Usuario',
          photoURL: friend.otherPhoto || '',
          socialGistId: friend.otherSocialGistId,
          gamesGistId: friend.otherGamesGistId,
          // Amigo fuera del directorio: no hay marca de recencia. 0 = desconocida → no se le aplica el corte.
          updatedAt: 0,
          // El doc de amistad no denormaliza el rango, así que un amigo que caiga fuera del tope del directorio
          // se pinta como bronce. Preferible a una lectura extra por amigo solo para un punto de color.
          tier: DEFAULT_PROFILE_TIER,
        }));
      const entries = [...dirEntries, ...friendOnlyEntries];

      // Lecturas que fallaron por credencial en esta hidratación. Se cuentan para avisar UNA vez al final, en vez
      // de por cada amigo ilegible.
      let credentialFailures = 0;

      const withProfiles = await mapWithConcurrency(
        entries,
        SOCIAL_DIRECTORY_FETCH_CONCURRENCY,
        async (entry) => {
          // Identidad, NO gist. Antes se comparaba `entry.socialGistId === socialCfgGistId`, y al dejar de
          // publicarse ese id en el perfil la comparación pasó a ser siempre falsa: la propia entrada dejaba de
          // reconocerse como propia, se trataba como la de un desconocido y la actividad de uno desaparecía de su
          // feed. `isOwnProfileIdentity` compara uid/profileId, que es lo que de verdad identifica.
          const isOwnEntry = isOwnProfileIdentity(entry.id, authUser?.uid, ownProfileId);
          const isFriend = friendUids.has(entry.uid);
          // Amigo: se prefiere su gist social saneado desde la amistad, porque el del directorio solo se
          // reescribe al re-publicar el perfil y puede quedar anclado a un gist viejo/vacío.
          const friendSocialGistId = isFriend ? friendSocialGistByUid.get(entry.uid) : undefined;
          // Para la entrada PROPIA la fuente es el gist de la sesión: el directorio ya no publica el id, así que
          // sin esto uno se quedaba sin ningún candidato que leer y su propia actividad no aparecía en su feed.
          const ownSocialGistId = isOwnEntry ? socialCfgGistId : '';
          const effectiveSocialGistId = ownSocialGistId || friendSocialGistId || entry.socialGistId;
          // Gist de juegos: la amistad manda; `entry.gamesGistId` solo trae valor en perfiles legacy sin purgar.
          const effectiveGamesGistId = (isFriend ? friendGamesGistByUid.get(entry.uid) : undefined) || entry.gamesGistId;
          // …pero la deriva puede ir en CUALQUIER dirección (publicar una reseña sanea el directorio y no los docs
          // de amistad; abrir el hub sanea ambos), así que preferir a ciegas una de las dos fuentes deja al amigo
          // sin actividad la mitad de las veces. Si divergen, se leen las DOS y se fusionan: una lectura extra en
          // un caso raro a cambio de que su actividad no dependa de qué saneado corrió último.
          const socialGistCandidates = [effectiveSocialGistId, ...(isFriend ? [entry.socialGistId] : [])]
            .map((id) => String(id || '').trim())
            .filter((id, index, all) => Boolean(id) && all.indexOf(id) === index);
          // CORTE POR INACTIVIDAD: la actividad de un amigo que hace mucho que no usa la app no ocupa el feed (ni
          // gasta una lectura de su gist). Solo se aplica si conocemos su recencia; el perfil propio nunca se corta.
          const lastActiveAt = Number(entry.updatedAt || 0);
          const isInactiveFriend =
            !isOwnEntry && lastActiveAt > 0 && Date.now() - lastActiveAt > FRIEND_ACTIVITY_MAX_AGE_MS;
          if (!isOwnEntry && (!isFriend || isInactiveFriend || socialGistCandidates.length === 0)) {
            // Index-only, sin leer su gist. Solo nombre/foto (Firestore); sin actividad ni publicaciones.
            return {
              id: entry.id,
              uid: entry.uid,
              displayName: entry.displayName || 'Usuario',
              // El id EFECTIVO (el del doc de amistad), no el del directorio: este último ya no se publica, y
              // dejarlo vacío rompía la hidratación bajo demanda del perfil de un amigo inactivo, que se salta
              // cuando no hay gist al que ir.
              socialGistId: effectiveSocialGistId,
              gamesGistId: effectiveGamesGistId,
              photoURL: entry.photoURL || '',
              tier: entry.tier,
              activity: [],
              posts: [],
              moves: [],
              // Marca para el detalle: es un amigo cuyo gist social NO se ha leído por inactividad. Al abrir su
              // perfil se hidrata bajo demanda (nombre/visibilidad/foto) para que no se vea a medias.
              socialSkipped: isFriend && isInactiveFriend,
              sharedLists: {},
              visibility: defaultSocialVisibility,
            };
          }
          try {
            // Lectura de los candidatos (normalmente uno). Con varios, se fusiona: perfil del más reciente y
            // unión de actividad/publicaciones. Un candidato ilegible (gist borrado) no invalida al otro; si
            // fallan todos, se propaga para caer en el `catch` de degradación index-only.
            const reads = await Promise.allSettled(
              socialGistCandidates.map((id) => readPublicSocialGistById(id, socialConfig?.token || null)),
            );
            const readable = reads
              .map((result, index) => ({ result, gistId: socialGistCandidates[index] }))
              .filter((item): item is { result: PromiseFulfilledResult<SocialGistData>; gistId: string } =>
                item.result.status === 'fulfilled');
            if (readable.length === 0) {
              throw (reads[0] as PromiseRejectedResult | undefined)?.reason ?? new Error('Gist social ilegible');
            }
            const socialData = readable
              .map((item) => item.result.value)
              .reduce((merged, current) => mergeSocialGistData(merged, current));
            // Id efectivo: el del payload más reciente de los legibles (el que "gana" la fusión del perfil).
            const resolvedSocialGistId = readable
              .reduce((best, item) => (item.result.value.updatedAt > best.result.value.updatedAt ? item : best))
              .gistId;
            // Foto: prioridad al gist (con su visibilidad); si no la trae, se usa la del directorio de Firestore
            // (`entry.photoURL`) SIEMPRE QUE el usuario no la tenga desactivada. Esto propaga la foto de quienes
            // tienen el gist antiguo (sin photoURL) sin esperar a que reentren. Para uno mismo, fallback a la sesión.
            const showsPhoto = socialData.profile.visibility?.showPhoto !== false;
            const resolvedPhoto = socialData.profile.photoURL || (showsPhoto ? entry.photoURL || '' : '') || (isOwnEntry ? ownPhotoURL : '');
            // E3: el canal social NO lee el gist de juegos EN CRUDO de otros usuarios (privacidad + desacople del
            // formato del gist de juegos). Las listas compartidas quedan index-only vacías para perfiles ajenos: el
            // detalle de actividad muestra nombre/rating/snippet del propio evento social; los metadatos
            // (plataformas/géneros) solo se ven para los juegos PROPIOS (fallback local en getGameItemById).
            const sharedLists: Partial<Record<TabId, SocialSharedGame[]>> = {};

            const activity = socialData.activity
              .map((activityEntry) => {
                const now = Date.now();
                const createdAt = toSafeTimestamp(activityEntry.createdAt, now);
                const updatedAt = toSafeTimestamp(activityEntry.updatedAt, createdAt);

                return {
                  ...activityEntry,
                  createdAt,
                  updatedAt,
                  profileId: entry.id,
                  profileDisplayName: socialData.profile.name || entry.displayName || 'Usuario',
                  socialGistId: resolvedSocialGistId,
                  photoURL: resolvedPhoto,
                };
              })
              .slice(0, SOCIAL_ACTIVITY_PER_PROFILE);

            const posts = (socialData.posts || [])
              .map((postEntry) => {
                const now = Date.now();
                const createdAt = toSafeTimestamp(postEntry.createdAt, now);
                const updatedAt = toSafeTimestamp(postEntry.updatedAt, createdAt);

                return {
                  ...postEntry,
                  createdAt,
                  updatedAt,
                  profileId: entry.id,
                  profileDisplayName: socialData.profile.name || entry.displayName || 'Usuario',
                  socialGistId: resolvedSocialGistId,
                  photoURL: resolvedPhoto,
                };
              })
              .slice(0, SOCIAL_POSTS_PER_PROFILE);

            // F4 — mensajes de lista. Se enriquecen con la identidad del autor como la actividad, y su `at` se
            // copia a `updatedAt` para que el feed pueda mezclarlos sin saber de qué campo sale la fecha de cada
            // tipo. NO se filtran aquí por la preferencia de quien mira: el directorio se cachea 30 minutos, así
            // que guardarlo filtrado obligaría a releer todos los gists al encender una lista.
            //
            // `reviewActorId` sale de cruzarlos con la actividad de ESTE perfil, que acabamos de leer del mismo
            // gist: es lo que permite que el nombre del juego ofrezca el gesto de abrir solo cuando hay algo que
            // abrir, sin una lectura más y sin averiguarlo al pulsar. Y es el `actorProfileId` del gist, no el id
            // de esta entrada del directorio: son identificadores distintos de la misma persona y el detalle
            // resuelve por el primero (ver `reviewActorsByGame`).
            const reviewActors = reviewActorsByGame(socialData.activity);
            const moves = (socialData.moves || [])
              .map((moveEntry) => ({
                ...moveEntry,
                updatedAt: toSafeTimestamp(moveEntry.at, Date.now()),
                reviewActorId: reviewActors.get(moveEntry.gameId),
                profileId: entry.id,
                profileDisplayName: socialData.profile.name || entry.displayName || 'Usuario',
                socialGistId: resolvedSocialGistId,
                photoURL: resolvedPhoto,
              }))
              .slice(0, SOCIAL_MOVES_PER_PROFILE);

            return {
              id: entry.id,
              uid: entry.uid,
              displayName: socialData.profile.name || entry.displayName || 'Usuario',
              socialGistId: resolvedSocialGistId,
              gamesGistId: effectiveGamesGistId,
              photoURL: resolvedPhoto,
              // El rango sale SIEMPRE de Firestore (lo asigna el admin), nunca del gist: el gist lo controla su
              // dueño y podría auto-otorgarse mithril editándolo a mano.
              tier: entry.tier,
              activity,
              posts,
              moves,
              sharedLists,
              visibility: socialData.profile.visibility || defaultSocialVisibility,
            };
          } catch (readError) {
            // Se distingue "no se pudo leer" de "no se pudo leer POR EL TOKEN": lo segundo no es un gist vacío,
            // es una credencial que ya no vale, y el usuario tiene que enterarse (abajo se avisa una sola vez).
            if (isGithubCredentialError(readError)) {
              credentialFailures += 1;
            }
            return {
              id: entry.id,
              uid: entry.uid,
              displayName: entry.displayName || 'Usuario',
              socialGistId: effectiveSocialGistId,
              gamesGistId: effectiveGamesGistId,
              // Gist ilegible: usamos la foto del directorio de Firestore (best-effort) para no perderla.
              photoURL: entry.photoURL || (isOwnEntry ? ownPhotoURL : ''),
              tier: entry.tier,
              activity: [],
              posts: [],
              moves: [],
              sharedLists: {},
              visibility: defaultSocialVisibility,
            };
          }
        },
      );

      setSocialDirectory(withProfiles);
      // La red ha respondido: se retira el aviso de falta de conexión (que pudo encenderlo un fallo anterior con
      // `navigator.onLine` diciendo que había red).
      setNetworkFailure(false);
      if (credentialFailures > 0) {
        setFeedback('warn', SOCIAL_UI.status.socialReadUnauthorized);
      }

      void putCachedSocialDirectory(socialCfgGistId, withProfiles);
    } catch (error) {
      if (isNetworkFailure(error) || isOffline()) {
        // Fallo de RED: en vez de vaciar el feed, se rescata la caché AUNQUE HAYA CADUCADO. Es el mismo criterio
        // que aplica `getCachedSocialDirectory` cuando el navegador admite estar sin red, y hace falta aquí porque
        // `navigator.onLine` puede decir que la hay (wifi sin salida) y entonces el TTL sí la habría descartado.
        // Con caché o sin ella, lo que NO se hace es cambiar "esto es de hace un rato" por "aquí no hay nada".
        const stale = await getCachedSocialDirectory<SocialDirectoryEntry>(socialCfgGistId, 0, { allowExpired: true })
          .catch(() => null);
        if (stale && stale.length > 0) {
          setSocialDirectory(stale);
        }
      } else {
        setSocialDirectory([]);
      }
      reportFailure(error, SOCIAL_UI.status.firestoreCheckFailed, 'warn');
    } finally {
      setLoadingDirectory(false);
      // También en el camino de error: un fallo de red deja el directorio vacío DE VERDAD (con su aviso), y dejarlo
      // sin asentar mantendría el esqueleto girando para siempre.
      setDirectorySettled(true);
    }
    // `mainSyncConfig?.token` ESTUVO aquí y no lo usa nadie en el cuerpo (el token sale de `getSocialSyncConfig()`
    // en el momento de leer): lo único que hacía era rehidratar el directorio entero cuando la configuración de
    // sync terminaba de descifrarse. Se retira.
  }, [directoryPanelAllows, directoryInputsReady, authUser, ownProfileId, defaultSocialVisibility, friends, ownTier, reportFailure, setFeedback, socialCfgGistId, ownPublishablePhoto, setNetworkFailure]);

  /**
   * Pasada en vuelo, para que dos disparos no se solapen.
   *
   * Podían solaparse de verdad: al guardar el perfil se navega al feed Y se llama a la hidratación a mano, y la
   * reconciliación de actividad dispara otra al terminar. Dos pasadas simultáneas son ~50 lecturas de gist por
   * duplicado (las deduplica la caché de sesión del repositorio, pero no el trabajo de CPU ni la reescritura de la
   * caché de IndexedDB) y, sobre todo, la que acaba primero apaga el esqueleto mientras la otra sigue corriendo.
   */
  const directoryHydrationRef = useRef<Promise<void> | null>(null);

  const hydrateSocialDirectory = useCallback(async (forceRefresh = false) => {
    const pending = directoryHydrationRef.current;
    // Un refresco FORZADO (botón "Actualizar") sí quiere una pasada nueva: su anti-spam ya lo acota aparte.
    if (pending && !forceRefresh) {
      return pending;
    }

    const run = runDirectoryHydration(forceRefresh);
    directoryHydrationRef.current = run;
    try {
      await run;
    } finally {
      // Solo se limpia si sigue siendo LA pasada en curso: un forzado posterior pudo relevarla.
      if (directoryHydrationRef.current === run) {
        directoryHydrationRef.current = null;
      }
    }
  }, [runDirectoryHydration]);

  /**
   * Parchea las entradas del directorio que casen con el predicado. Dos usos: la hidratación bajo demanda del
   * perfil de un amigo inactivo (por `id`) y la puesta al día de la foto propia (por gist).
   *
   * Se expone esto y no el `setState` crudo por dos motivos. Uno, desde fuera no se puede reemplazar el
   * directorio entero. Y dos, la actualización es FUNCIONAL: quien llama no necesita tener el directorio en su
   * closure, así que un efecto no acaba parcheando sobre una copia vieja por no haberlo puesto en sus
   * dependencias — que es exactamente el fallo que se cuela al pasar de `setState(prev => …)` a leer el estado.
   */
  const patchDirectoryEntries = useCallback(
    (match: (entry: SocialDirectoryEntry) => boolean, patch: Partial<SocialDirectoryEntry>) => {
      setSocialDirectory((prev) => prev.map((item) => (match(item) ? { ...item, ...patch } : item)));
    },
    [],
  );

  /** El cooldown del refresco forzado no puede sobrevivir al desmontaje del hub. */
  useEffect(() => () => {
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
  }, []);

  /**
   * Lo que las pantallas deben tratar como "el directorio está cargando": la hidratación en vuelo MÁS la ventana
   * previa. Las condiciones replican las guardas que significan "aquí no hay directorio que cargar"; sin ellas,
   * un estado en el que la hidratación nunca llega a correr dejaría el esqueleto girando indefinidamente.
   */
  const directoryLoading =
    loadingDirectory ||
    (!directorySettled && directoryPanelAllows && Boolean(authUser) && Boolean(socialCfgGistId));

  return {
    rawSocialDirectory,
    directoryLoading,
    setDirectorySettled,
    refreshCoolingDown,
    hydrateSocialDirectory,
    patchDirectoryEntries,
  };
}
