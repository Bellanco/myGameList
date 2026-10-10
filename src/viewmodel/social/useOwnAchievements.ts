// TUS LOGROS EN EL ESPACIO SOCIAL: evaluarlos, unirlos a lo ya publicado y publicarlos.
//
// Sale de `useSocialViewModel` como un dominio cerrado: lee la biblioteca, el directorio y lo que ya se sabe de tu
// perfil, y solo devuelve tres cosas —tu vitrina (`ownAchievements`), tu espejo (`ownAchievementMirror`) y tu tarjeta
// del feed (`ownAchievementsFeed`)—. Lo que publica sale de aquí y de ningún otro sitio.
import { useEffect, useMemo } from 'react';
import { localWeekKey } from '../../core/utils/dateTime';
import { ENABLE_ACHIEVEMENTS, ENABLE_ACHIEVEMENTS_PUBLISH } from '../../core/achievements/flags';
import { mergeForPublish } from '../../core/achievements/pack';
import { rememberSocialCounters } from '../../core/achievements/deviceSignals';
import { achievementsPublishedKey } from '../../core/constants/storageKeys';
import { publishAchievementMirror } from '../../model/repository/firebaseRepository';
import type { TabData } from '../../model/types/game';
import { useAchievementsConfig } from '../../view/hooks/useAchievementsConfig';
import { useOpenFrontier } from '../../view/hooks/useOpenFrontier';
import { useAchievements } from '../useAchievements';
import { isOwnProfileIdentity } from './socialIdentity';
import type { SocialDirectoryEntry } from './socialFeed';
import { OWN_PROFILE_ALIAS } from './socialRoutes';

/** Biblioteca vacía estable: el hub puede montarse sin `games` y un literal nuevo rompería el memo. */
const EMPTY_LIBRARY = { c: [], v: [], e: [], p: [], d: [], deleted: [], updatedAt: 0 };

export interface OwnAchievementsInput {
  games: TabData | undefined;
  /** El directorio SIN filtrar: tu propia entrada está dentro (el filtrado la excluye). */
  rawDirectory: SocialDirectoryEntry[];
  ownUid: string | undefined;
  ownPhotoURL: string | null | undefined;
  ownProfileId: string | null;
  ownDisplayName: string;
  friendUidSet: ReadonlySet<string>;
  mainSyncGistId: string | undefined;
  /** Fecha de alta del perfil, sellada por el servidor; 0 mientras no se haya leído. */
  ownProfileCreatedAt: number;
  /** Tu espejo tal y como está publicado: el suelo de la próxima publicación. */
  ownPublishedMirror: { list: string; at: number };
  /** ¿Se ha LEÍDO un perfil publicado? Sin eso no se publica nada (ver el efecto de abajo). */
  ownProfilePublished: boolean;
  /** ¿Se ha terminado de leer tu perfil? Antes, el espejo es solo el de este dispositivo. */
  tierResolved: boolean;
}

export function useOwnAchievements({
  games,
  rawDirectory,
  ownUid,
  ownPhotoURL,
  ownProfileId,
  ownDisplayName,
  friendUidSet,
  mainSyncGistId,
  ownProfileCreatedAt,
  ownPublishedMirror,
  ownProfilePublished,
  tierResolved,
}: OwnAchievementsInput) {
  /**
   * TUS logros para el feed. Salen del MISMO espejo que se publica (`ownMergedMirror`, más abajo) y se leen con
   * el mismo parser, así que tu tarjeta y la de una amistad recorren exactamente el mismo camino: si
   * algo se pinta mal en la tuya, se pintaría igual de mal en la suya, y eso se ve enseguida.
   *
   * Depende de `games`, que el hub ya recibe: no hay lectura nueva.
   */
  /**
   * TUS logros, evaluados AQUÍ y no en la vista: los necesitan tres cosas del hub —tu tarjeta del feed, tu lista
   * global y tu ficha— y evaluarlos en cada una sería recorrer la biblioteca tres veces por render.
   */
  /**
   * Los contadores de logro que NO salen de la biblioteca (§7.1 del plan).
   *
   * Se calculan aquí y no en la pantalla porque es el hub el único sitio donde existen los tres, y hasta ahora no
   * se pasaba ninguno: `useAchievements({ games })` los dejaba a cero para siempre, así que «Modo cooperativo»,
   * «Charla de taberna» y «Partida en la nube» eran inalcanzables **y seguían contando en el denominador**. La
   * cifra de la cabecera estaba mal para todo el mundo, y con un escalón por umbral el error se multiplicaba.
   *
   * Salen de lo que el hub YA tiene en memoria: ninguna lectura nueva.
   */
  const achievementCounters = useMemo(() => {
    const own = rawDirectory.find((entry) => isOwnProfileIdentity(entry.id, ownUid, ownProfileId));
    // SEMANAS DISTINTAS con publicación, no publicaciones: si midiera volumen, el premio sería llenar el feed
    // ajeno. Cuentan las reseñas publicadas y los posts, que son las dos cosas que aparecen en el feed.
    const weeks = new Set<string>();
    for (const entry of [...(own?.activity || []), ...(own?.posts || [])]) {
      const stamp = Number(entry.createdAt) || 0;
      if (stamp > 0) weeks.add(localWeekKey(stamp));
    }
    return {
      friends: friendUidSet.size,
      postWeeks: weeks.size,
      // Tu fecha de alta, del documento de perfil (`profiles/{uid}.createdAt`). Es lo que hace verificables «De
      // la vieja escuela» y «Otro año más»: la sella el SERVIDOR al crear el perfil y las reglas la declaran
      // inmutable, así que no se puede adelantar desde el cliente. 0 mientras no se haya leído —o en un perfil
      // anterior a que existiera la marca—, y entonces los dos logros no se conceden, que es el lado correcto.
      profileCreatedAt: ownProfileCreatedAt,
      hasSync: Boolean(mainSyncGistId),
    };
  }, [rawDirectory, ownUid, ownProfileId, friendUidSet, mainSyncGistId, ownProfileCreatedAt]);

  /**
   * Lo que el panel de administración decide para todo el mundo. Aquí solo hace falta la APERTURA COMUNITARIA: es
   * el denominador común de la fracción, y sin pasarla el hub contaba tu porcentaje sobre tu propio progreso
   * mientras `/logros` lo contaba sobre lo que está abierto — dos cifras distintas para la misma biblioteca.
   */
  const achievementsConfig = useAchievementsConfig();

  /**
   * Y SE RECUERDAN PARA EL PANEL, que es el único sitio donde estos cuatro números no existen: allí se evaluaba
   * con ceros, así que sus logros no se conseguían y —al no conseguirse— tampoco abrían sus escalones. Con la
   * misma biblioteca, `/logros` decía «36/88» y esta misma ficha «42/94»; y al volver del hub la marca de agua
   * ya sostenía lo conseguido, así que la cifra del panel subía sola y se quedaba. Ver `deviceSignals`.
   */
  useEffect(() => {
    if (!ENABLE_ACHIEVEMENTS) return;
    rememberSocialCounters(achievementCounters);
  }, [achievementCounters]);

  const ownAchievements = useAchievements({
    games: games || EMPTY_LIBRARY,
    ...achievementCounters,
    open: achievementsConfig.open,
  });
  const ownAchievementStates = ENABLE_ACHIEVEMENTS ? ownAchievements.states : null;

  /**
   * Y ABRE PARA LOS DEMÁS lo que tú has alcanzado. Va aquí y en el panel de estadísticas —las dos pantallas donde
   * se evalúan tus logros— porque quien vive en el hub y no entra nunca al panel también abre escalones.
   * Escribir dos veces no cuesta nada: solo se publica cuando adelanta algo (ver `useOpenFrontier`).
   */
  useOpenFrontier(ownAchievements.byId, achievementsConfig.open);

  /**
   * TU id EN EL DIRECTORIO, que es el único que las rutas de la ficha saben resolver
   * (`/social/profiles/:profileId`).
   *
   * NO VALE `ownProfileId`: ese es un UUID SEMBRADO EN EL DISPOSITIVO (`seedProfileIdFromRemote`) que no
   * identifica ningún documento de `profiles`, así que la tarjeta de TUS logros del feed enlazaba a
   * `/social/profiles/<uuid>` —y a `.../logros`— y las dos direcciones abrían una ficha que no encontraba nada.
   *
   * Y de paso hace honesta la comparación con la que el feed descarta tu propia entrada del directorio: los dos
   * lados de esa igualdad son ahora ids de directorio.
   *
   * Sin entrada propia todavía queda el comodín `me`, que la ficha resuelve por identidad.
   */
  const ownDirectoryProfileId = useMemo(
    () => rawDirectory.find((entry) => isOwnProfileIdentity(entry.id, ownUid, ownProfileId))?.id || '',
    [rawDirectory, ownUid, ownProfileId],
  );

  /**
   * TU ESPEJO TAL Y COMO LO VEN LOS DEMÁS: lo publicado unido a lo de este dispositivo (ver `mergeForPublish`).
   *
   * Es el mismo cálculo que se publica, y por eso lo usan también tu tarjeta del feed y tu ficha. Antes esas dos
   * salían de `packAchievements` sobre el cálculo LOCAL: sin las medallas de tus otros dispositivos, sin tus
   * destacados, y con la fecha de este aparato, que es la que se movía — tus logros salían «de hoy» en tu propio
   * feed mientras tus amistades los veían en su día.
   */
  const ownMergedMirror = useMemo(
    () => (ownAchievementStates ? mergeForPublish(ownPublishedMirror, ownAchievementStates) : ''),
    [ownPublishedMirror, ownAchievementStates],
  );

  const ownAchievementsFeed = useMemo(() => {
    if (!ENABLE_ACHIEVEMENTS || !ownAchievementStates) return undefined;
    return {
      profileId: ownDirectoryProfileId || OWN_PROFILE_ALIAS,
      displayName: ownDisplayName || '',
      photoURL: ownPhotoURL || '',
      mirror: ownMergedMirror,
      uid: ownUid || '',
      // `tierResolved` se da al terminar de leer tu perfil, que es de donde sale lo PUBLICADO: antes de eso el
      // espejo es solo el de este dispositivo y tu tarjeta podría salir en un día más tardío (ver `useSocialFeed`).
      ready: tierResolved,
    };
  }, [ownAchievementStates, ownMergedMirror, ownDirectoryProfileId, ownDisplayName, ownPhotoURL, ownUid, tierResolved]);

  /**
   * TU espejo, el mismo que va al feed.
   *
   * Se expone porque el hub lo necesita para pintar TU ficha de logros: `detailMirror` lo busca en el directorio
   * filtrado, y ese excluye tu entrada por identidad (es lo que impide que te salgas a ti mismo en la lista de
   * gente). Sin esto, abrir tu propia tarjeta del feed llevaba a una pantalla que decía «todavía no hay nada que
   * contar» con cien medallas detrás — y en desarrollo ni se veía, porque la siembra te fabricaba uno falso.
   */
  const ownAchievementMirror = ownAchievementsFeed?.mirror || '';

  /**
   * F3 — PUBLICA TU ESPEJO, que es lo que hace que tus logros existan para los demás.
   *
   * DETRÁS DE `ENABLE_ACHIEVEMENTS_PUBLISH`, que es lo ÚNICO que hay que tocar para encender la función: la
   * constante es `false` y el empaquetador se lleva por delante todo este bloque, así que hasta que se ponga a
   * `true` no viaja ni una línea de esto ni se escribe nada en `profiles`.
   *
   * SOLO SI EL PERFIL ESTÁ PUBLICADO, y la señal es haber LEÍDO el documento (`ownProfilePublished`), no tener
   * un `ownProfileId`: ese id se siembra en local aunque no exista documento, así que lo tiene también quien
   * nunca abrió el social. Con la guarda floja, un `merge` sobre ese uid habría CREADO el perfil — publicarle
   * una presencia a quien no la ha pedido. Y de paso es la guarda honesta: la regla de lectura de `profiles`
   * exige `social.enabled == true`, así que un espejo escrito fuera de ahí no lo podría leer nadie.
   *
   * SOLO SI HA CAMBIADO. El espejo se recalcula en cada render del hub y es idéntico casi siempre; sin esta
   * guarda, abrir el hub sería una escritura en Firestore por sesión y por dispositivo para no decir nada nuevo.
   * Lo último publicado se recuerda por dispositivo (`achievementsPublishedKey`): perderlo solo cuesta una
   * escritura de más, así que no hace falta que viaje a ningún sitio.
   *
   * Best-effort y en silencio: si falla, se reintenta en la sesión siguiente y mientras tanto tus amistades ven
   * tu vitrina un poco desactualizada. No hay nada que contarle al usuario sobre esto.
   */
  useEffect(() => {
    if (!ENABLE_ACHIEVEMENTS || !ENABLE_ACHIEVEMENTS_PUBLISH) return;
    const uid = ownUid;
    // CON ALGO CONSEGUIDO, y se comprueba sobre los estados y NO sobre la cadena: un espejo sin un solo logro no
    // es la cadena vacía, son 45 caracteres de ceros (`2:AAAA…`), así que un `if (!mirror)` lo daba por bueno y
    // le escribía una vitrina vacía en Firestore a cada usuario nuevo del social. No hay nada que enseñar hasta
    // que caiga el primero.
    if (!uid || !ownProfilePublished) return;
    if (!ownAchievementStates?.some((state) => state.level >= 1)) return;

    // LA UNIÓN, no el reemplazo: lo que ya está publicado es el suelo. Sin esto, abrir la app en un aparato con
    // la biblioteca a medio sincronizar le borra medallas a tu vitrina (ver `mergeForPublish`).
    const mirror = ownMergedMirror;
    const key = achievementsPublishedKey(uid);
    let published = '';
    try {
      published = localStorage.getItem(key) || '';
    } catch {
      // Sin almacenamiento se publica siempre: es una escritura de más, no un fallo.
    }
    if (published === mirror) return;

    void publishAchievementMirror(uid, mirror)
      .then(() => {
        try {
          localStorage.setItem(key, mirror);
        } catch {
          // Publicado igualmente; solo se perdió el recordatorio de que ya se hizo.
        }
      })
      .catch((error) => {
        console.warn('[social] no se pudo publicar el espejo de logros:', error instanceof Error ? error.message : error);
      });
  }, [ownUid, ownProfilePublished, ownMergedMirror, ownAchievementStates]);

  return { ownAchievements, ownAchievementMirror, ownAchievementsFeed };
}
