import { useCallback, useRef, useState } from 'react';
import { SOCIAL_UI } from '../../core/constants/socialLabels';
import { DEFAULT_PROFILE_TIER, PROFILE_TIER_DIRECTORY_TTL_MS, PROFILE_TIER_FEED_TTL_MS, type ProfileTier } from '../../core/constants/tiers';
import { mapWithConcurrency } from '../../core/utils/concurrency';
import { isOffline, isServiceUnavailable } from '../../core/utils/network';
import { normalizeTimestamp as toSafeTimestamp } from '../../core/utils/normalize';
import { reviewActorsByGame } from '../../core/social/moveActivity';
import { getCachedSocialDirectory, getLocalMeta, patchLocalMeta, putCachedSocialDirectory } from '../../model/repository/indexedDbRepository';
import { getSocialSyncConfig, mergeSocialGistData, readPublicSocialGistById, type SocialGistData, type SocialProfileVisibility, type SocialSharedGame } from '../../model/repository/socialGistRepository';
import { getSocialProfilesByUid, type SocialAuthUser } from '../../model/repository/firebaseRepository';
import { PROFILE_INACTIVITY_MS } from '../../core/constants/socialActivity';
import { isOwnProfileIdentity } from './socialIdentity';
import type { SocialDirectoryEntry } from './socialFeed';
import type { TabId } from '../../model/types/game';
import type { FriendshipView } from '../../model/types/social';
import { resolveAuthorName } from '../../core/social/authorName';

// Antigüedad máxima del último uso de un AMIGO para que su actividad entre en el feed: `PROFILE_INACTIVITY_MS`, el
// mismo corte con el que avisa el panel. Uno más inactivo sigue en la lista de amigos, y su perfil y sus reseñas se
// abren igual (salen de su gist de JUEGOS); lo que no hace es ocupar el feed ni gastar una lectura de su gist
// social, y su perfil de Firestore se relee como mucho una vez al día (`INACTIVE_PROFILE_MAX_AGE_MS`). Sin dato de
// recencia NO se corta: nunca se oculta contenido por falta de datos.
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
// Las publicaciones, igual: estuvieron en 40, el tope del feed, mientras ninguna vista las listaba por separado.
// Desde que el perfil enseña TODAS (y deja editar y borrar las tuyas), se iguala al tope del gist: con 40, la
// publicación 41 de alguien seguía en su canal sin que hubiera forma de verla ni de retirarla.
const SOCIAL_POSTS_PER_PROFILE = 100;
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
const isGithubCredentialError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  // Un LÍMITE de GitHub también llega como 403, y decirle a alguien que su conexión ha caducado le mandaba a
  // reconectar algo que funcionaba (docs/plan-degradacion-servicios.md, fase 2).
  if ((error as { rateLimited?: unknown }).rateLimited === true) return false;
  const { status } = error as { status?: unknown };
  if (typeof status === 'number') return status === 401 || status === 403;
  return /\b(401|403)\b/.test(error.message);
};

/** Identidad del autor con la que se sella todo lo que sale de un mismo gist social. */
interface FeedAuthor {
  profileId: string;
  profileDisplayName: string;
  socialGistId: string;
  photoURL: string;
}

/**
 * Sella cada elemento con la identidad de su autor y NORMALIZA sus fechas, recortando al tope de su colección.
 *
 * Existe porque este bloque estaba escrito TRES veces —actividad, publicaciones y mensajes de lista— con el mismo
 * encadenado de respaldos del nombre y la misma pareja de `toSafeTimestamp`. Tres copias de una regla de fechas
 * son tres sitios donde arreglar el próximo desajuste de zona horaria, y ya ha habido dos.
 *
 * El recorte va ANTES del sellado: normalizar 320 entradas para tirar 280 es trabajo que no hace falta.
 */
function withAuthorAndDates<T extends { createdAt: number; updatedAt: number }>(
  items: T[] | undefined,
  author: FeedAuthor,
  limit: number,
): Array<T & FeedAuthor> {
  const now = Date.now();
  return (items || []).slice(0, limit).map((item) => {
    const createdAt = toSafeTimestamp(item.createdAt, now);
    return {
      ...item,
      createdAt,
      // La de modificación cae en la de creación, no en «ahora»: un `updatedAt` roto no debe ascender la entrada
      // a lo más nuevo del feed.
      updatedAt: toSafeTimestamp(item.updatedAt, createdAt),
      ...author,
    };
  });
}

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

  const runDirectoryHydration = useCallback(async (forceRefresh: boolean, keepDirectoryQuery = false) => {
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

    // EL REFRESCO FORZADO YA NO LO PIDE NADIE DESDE FUERA: el botón «Actualizar feed» se retiró, y con él su
    // enfriamiento. Lo único que fuerza es la propia app tras publicar (`onPublished`), que conserva la consulta del
    // directorio (`keepDirectoryQuery`), así que solo relee los gists sociales y al ritmo al que uno publica.
    // Todo lo demás es carga automática y pasa por la caché.
    if (!forceRefresh) {
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
      // La CONSULTA de perfiles tiene su propia copia, más larga que la del feed: lo que caduca a menudo es la
      // actividad de los amigos, que sale de sus gists, no el nick o la foto (ver `PROFILE_TIER_DIRECTORY_TTL_MS`).
      // TUS AMIGOS Y TÚ, leídos por uid: es todo lo que el feed necesita de Firestore (rango, vitrina, palmarés,
      // resumen del año y recencia). Antes salía de los 50 perfiles más recientes, que costaban 50 lecturas en cada
      // caducidad con independencia de cuántos amigos hubiera, y dejaban sin todo eso a los que no cabían. Descubrir
      // gente nueva es cosa de «Perfiles», que hace su propia consulta solo cuando se abre (`useSocialDiscover`).
      //
      // `keepDirectoryQuery`: el refresco que sigue a publicar un post salta la copia del FEED (tiene que salir el
      // post) pero no la de los perfiles, que no han cambiado.
      const profileUids = [authUser.uid, ...friends.map((friend) => friend.otherUid)];
      const dirEntries = await getSocialProfilesByUid(profileUids, {
        forceRefresh: forceRefresh && !keepDirectoryQuery,
        maxAgeMs: PROFILE_TIER_DIRECTORY_TTL_MS[ownTier],
      });
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

      // Un amigo cuyo perfil no se deja leer (ha apagado su espacio social) no puede desaparecer del feed / detalle /
      // gestión: se sintetiza su entrada con los datos DENORMALIZADOS del doc de amistad (nombre/foto/gists). Los
      // pendientes NO se sintetizan (no son amigos aún).
      const directoryUids = new Set(dirEntries.map((entry) => entry.uid));
      const friendOnlyEntries = friends
        // No se exige `otherSocialGistId`: sin él el amigo desaparecía por completo del hub (ni perfil ni gestión).
        // Entra igual como index-only; sin gist social simplemente no aporta actividad.
        .filter((friend) => !directoryUids.has(friend.otherUid))
        .map((friend) => ({
          id: friend.otherUid,
          uid: friend.otherUid,
          displayName: friend.otherName || SOCIAL_UI.requests.unknownUser,
          photoURL: friend.otherPhoto || '',
          socialGistId: friend.otherSocialGistId,
          gamesGistId: friend.otherGamesGistId,
          // Sin perfil legible no hay marca de recencia. 0 = desconocida → no se le aplica el corte.
          updatedAt: 0,
          // El doc de amistad no denormaliza el rango, así que se pinta como bronce.
          tier: DEFAULT_PROFILE_TIER,
          // Y por lo mismo tampoco denormaliza el espejo: sin perfil legible no hay vitrina. Vacío es exactamente
          // «no ha publicado» para todo lo que lo lee, así que se calla en vez de inventarse una.
          achievementsMirror: '',
          // Tampoco denormaliza el aviso del resumen del año: sin tarjeta en el feed.
          yearSummarySeen: null,
          palmares: undefined,
        }));
      const entries = [...dirEntries, ...friendOnlyEntries];

      // Lecturas que fallaron por credencial en esta hidratación. Se cuentan para avisar UNA vez al final, en vez
      // de por cada amigo ilegible.
      let credentialFailures = 0;
      // Y las que fallaron porque el SERVICIO no atendía (GitHub limitando, sin red a medias). De esos amigos se
      // enseña su última entrada guardada, y el resultado NO se guarda como copia nueva: guardarlo convertía un corte
      // de cinco minutos en media hora de feed sin su actividad (docs/plan-degradacion-servicios.md, fase 2).
      let transientFailure: unknown = null;
      let previousDirectory: Promise<SocialDirectoryEntry[] | null> | null = null;
      const previousEntryOf = async (uid: string): Promise<SocialDirectoryEntry | null> => {
        previousDirectory ??= getCachedSocialDirectory<SocialDirectoryEntry>(socialCfgGistId, 0, { allowExpired: true })
          .catch(() => null);
        return (await previousDirectory)?.find((item) => item.uid === uid) ?? null;
      };

      // DERIVA DE CANAL YA RESUELTA (ver `LocalMeta.socialGistWinnerByFriend`). Una lectura de `LocalMeta` por
      // hidratación —al lado de las N lecturas de gist que vienen— para no repetir la lectura doble de cada amigo
      // cuyo directorio y documento de amistad no coinciden.
      const rememberedWinners = (await getLocalMeta().catch(() => null))?.socialGistWinnerByFriend || {};
      // Lo aprendido en ESTA pasada, para sellarlo de una vez al final en vez de una escritura por amigo.
      const learnedWinners: Record<string, string> = {};
      const forgottenWinners = new Set<string>();

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
          const allSocialGistCandidates = [effectiveSocialGistId, ...(isFriend ? [entry.socialGistId] : [])]
            .map((id) => String(id || '').trim())
            .filter((id, index, all) => Boolean(id) && all.indexOf(id) === index);
          // …y si en una pasada anterior ya se supo cuál de los dos gana, se lee SOLO ese. El ganador tiene que
          // seguir siendo uno de los candidatos actuales: si el amigo ha cambiado de canal desde entonces, el
          // recuerdo ya no vale y se vuelve a leer todo.
          const remembered = rememberedWinners[entry.uid];
          const socialGistCandidates = remembered && allSocialGistCandidates.includes(remembered)
            ? [remembered]
            : allSocialGistCandidates;
          // CORTE POR INACTIVIDAD: la actividad de un amigo que hace mucho que no usa la app no ocupa el feed (ni
          // gasta una lectura de su gist). Solo se aplica si conocemos su recencia; el perfil propio nunca se corta.
          const lastActiveAt = Number(entry.updatedAt || 0);
          const isInactiveFriend =
            !isOwnEntry && lastActiveAt > 0 && Date.now() - lastActiveAt > PROFILE_INACTIVITY_MS;
          if (!isOwnEntry && (!isFriend || isInactiveFriend || socialGistCandidates.length === 0)) {
            // Index-only, sin leer su gist. Solo nombre/foto (Firestore); sin actividad ni publicaciones.
            return {
              id: entry.id,
              uid: entry.uid,
              displayName: entry.displayName || SOCIAL_UI.requests.unknownUser,
              // Su gist se leerá bajo demanda al abrir la ficha, y ahí hace falta saber qué nombre manda.
              namePending: 'namePending' in entry ? entry.namePending : undefined,
              // El id EFECTIVO (el del doc de amistad), no el del directorio: este último ya no se publica, y
              // dejarlo vacío rompía la hidratación bajo demanda del perfil de un amigo inactivo, que se salta
              // cuando no hay gist al que ir.
              socialGistId: effectiveSocialGistId,
              gamesGistId: effectiveGamesGistId,
              photoURL: entry.photoURL || '',
              tier: entry.tier,
              lastActiveAt,
              // El espejo viene de FIRESTORE, no del gist, así que llega también aquí, donde el gist no se lee:
              // es lo que hace que la vitrina de un amigo inactivo se vea al abrir su ficha sin gastar esa
              // lectura. Quién puede verlo lo deciden la ficha y el feed, y los dos exigen amistad; de un
              // no-amigo solo lo usa el porcentaje comparado, que no lleva identidad.
              achievementsMirror: entry.achievementsMirror,
              yearSummarySeen: entry.yearSummarySeen,
              // El palmarés viaja con el espejo, en el MISMO documento del directorio: la vitrina de su ficha lo
              // tiene sin gastar ni una lectura más.
              palmares: entry.palmares,
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
            // Se recuerda el ganador solo cuando había DE VERDAD más de un candidato: con uno solo no hay deriva
            // que resolver, y sellarlo convertiría el recuerdo en una copia del dato que ya está en la amistad.
            if (allSocialGistCandidates.length > 1 && rememberedWinners[entry.uid] !== resolvedSocialGistId) {
              learnedWinners[entry.uid] = resolvedSocialGistId;
            }
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

            // Identidad del autor, resuelta UNA vez para las tres colecciones (antes se recalculaba en cada una
            // de las tres pasadas, con el mismo encadenado de respaldos escrito tres veces).
            const author = {
              profileId: entry.id,
              profileDisplayName: resolveAuthorName(entry, socialData.profile.name) || SOCIAL_UI.requests.unknownUser,
              socialGistId: resolvedSocialGistId,
              photoURL: resolvedPhoto,
            };

            const activity = withAuthorAndDates(socialData.activity, author, SOCIAL_ACTIVITY_PER_PROFILE);
            const posts = withAuthorAndDates(socialData.posts, author, SOCIAL_POSTS_PER_PROFILE);

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
              .slice(0, SOCIAL_MOVES_PER_PROFILE)
              .map((moveEntry) => ({
                ...moveEntry,
                // Los mensajes de lista fechan con `at`, no con `createdAt`/`updatedAt`: se copia a `updatedAt`
                // para que el feed pueda mezclarlos sin saber de qué campo sale la fecha de cada tipo.
                updatedAt: toSafeTimestamp(moveEntry.at, Date.now()),
                reviewActorId: reviewActors.get(moveEntry.gameId),
                ...author,
              }));

            return {
              id: entry.id,
              uid: entry.uid,
              displayName: resolveAuthorName(entry, socialData.profile.name) || SOCIAL_UI.requests.unknownUser,
              socialGistId: resolvedSocialGistId,
              gamesGistId: effectiveGamesGistId,
              photoURL: resolvedPhoto,
              // El rango sale SIEMPRE de Firestore (lo asigna el admin), nunca del gist: el gist lo controla su
              // dueño y podría auto-otorgarse mithril editándolo a mano.
              tier: entry.tier,
              lastActiveAt,
              // Del directorio de Firestore, igual que el rango: el gist lo controla su dueño y el espejo no se
              // publica ahí.
              achievementsMirror: entry.achievementsMirror,
              yearSummarySeen: entry.yearSummarySeen,
              palmares: entry.palmares,
              activity,
              posts,
              moves,
              sharedLists,
              visibility: socialData.profile.visibility || defaultSocialVisibility,
            };
          } catch (readError) {
            // Pasajero (el servicio no atiende): lo último guardado de este amigo, con lo de Firestore al día.
            if (isServiceUnavailable(readError)) {
              transientFailure ??= readError;
              const previous = await previousEntryOf(entry.uid);
              if (previous) {
                return {
                  ...previous,
                  tier: entry.tier,
                  lastActiveAt,
                  achievementsMirror: entry.achievementsMirror,
                  yearSummarySeen: entry.yearSummarySeen,
                  palmares: entry.palmares,
                };
              }
            }
            // Se distingue "no se pudo leer" de "no se pudo leer POR EL TOKEN": lo segundo no es un gist vacío,
            // es una credencial que ya no vale, y el usuario tiene que enterarse (abajo se avisa una sola vez).
            else if (isGithubCredentialError(readError)) {
              credentialFailures += 1;
            }
            // Si se leyó SOLO el ganador recordado y ha fallado, el recuerdo ha caducado (gist borrado, canal
            // cambiado): se olvida para que la pasada siguiente vuelva a aprender de las dos fuentes. Sin esto, un
            // ganador que deja de existir dejaría al amigo sin actividad para siempre.
            if (remembered && socialGistCandidates.length === 1) {
              forgottenWinners.add(entry.uid);
            }
            return {
              id: entry.id,
              uid: entry.uid,
              displayName: entry.displayName || SOCIAL_UI.requests.unknownUser,
              socialGistId: effectiveSocialGistId,
              gamesGistId: effectiveGamesGistId,
              // Gist ilegible: usamos la foto del directorio de Firestore (best-effort) para no perderla.
              photoURL: entry.photoURL || (isOwnEntry ? ownPhotoURL : ''),
              tier: entry.tier,
              lastActiveAt,
              // Un gist ilegible no se lleva por delante la vitrina: el espejo no estaba ahí.
              achievementsMirror: entry.achievementsMirror,
              yearSummarySeen: entry.yearSummarySeen,
              palmares: entry.palmares,
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
      if (transientFailure) {
        // Una parte salió de lo guardado: se dice (aviso de servicio limitado o de sin conexión) y no se retira.
        reportFailure(transientFailure, SOCIAL_UI.status.firestoreCheckFailed, 'warn');
      } else {
        // La red ha respondido: se retira el aviso de falta de conexión (que pudo encenderlo un fallo anterior con
        // `navigator.onLine` diciendo que había red).
        setNetworkFailure(false);
      }
      if (credentialFailures > 0) {
        setFeedback('warn', SOCIAL_UI.status.socialReadUnauthorized);
      }

      // Lo aprendido (y lo olvidado) sobre la deriva de canal, en UNA escritura al final. Solo si hay algo que
      // cambiar: `patchLocalMeta` abre una transacción de IndexedDB y no hay motivo para abrirla en cada
      // hidratación de un directorio sin deriva, que es el caso normal.
      if (Object.keys(learnedWinners).length > 0 || forgottenWinners.size > 0) {
        const nextWinners = { ...rememberedWinners, ...learnedWinners };
        forgottenWinners.forEach((uid) => delete nextWinners[uid]);
        // Con `catch`: `patchLocalMeta` rechaza si IndexedDB no está disponible (modo privado, cuota), y esto
        // corre suelto. Sin él, no aprender la deriva se convertía en un rechazo no capturado.
        void patchLocalMeta({ socialGistWinnerByFriend: nextWinners }).catch(() => {});
      }

      if (!transientFailure) {
        void putCachedSocialDirectory(socialCfgGistId, withProfiles);
      }
    } catch (error) {
      // También cuando el que no atiende es el SERVICIO (Firestore sin cuota, GitHub limitando), no solo la red.
      if (isServiceUnavailable(error) || isOffline()) {
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

  const hydrateSocialDirectory = useCallback(async (forceRefresh = false, options: { keepDirectoryQuery?: boolean } = {}) => {
    const pending = directoryHydrationRef.current;
    // Un refresco FORZADO (botón "Actualizar") sí quiere una pasada nueva: su anti-spam ya lo acota aparte.
    if (pending && !forceRefresh) {
      return pending;
    }

    const run = runDirectoryHydration(forceRefresh, Boolean(options.keepDirectoryQuery));
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
    (
      match: (entry: SocialDirectoryEntry) => boolean,
      // Como función cuando el parche depende de lo que ya tiene la entrada (las publicaciones, al editar o
      // borrar una): así se calcula sobre la versión vigente y no sobre la del closure de quien llama.
      patch: Partial<SocialDirectoryEntry> | ((entry: SocialDirectoryEntry) => Partial<SocialDirectoryEntry>),
    ) => {
      setSocialDirectory((prev) => prev.map((item) => (
        match(item) ? { ...item, ...(typeof patch === 'function' ? patch(item) : patch) } : item
      )));
    },
    [],
  );

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
    hydrateSocialDirectory,
    patchDirectoryEntries,
  };
}
