// Feed del hub social: los tipos de sus elementos y el estado DERIVADO que pinta la pantalla (mezcla, orden,
// paginación y agrupado por día).
//
// Primera pieza que sale de `useSocialViewModel` (2.470 líneas, 44 `useState`, 19 `useEffect`): es la más segura
// de mover porque no hace E/S ni toca la sincronización — todo lo que produce sale del directorio ya hidratado
// más su propio contador de paginación.
import { useCallback, useMemo, useState } from 'react';
import { createLocalDateFormat, localDayKey, startOfLocalDay } from '../../core/utils/dateTime';
import { normalizeTimestamp as toSafeTimestamp } from '../../core/utils/normalize';
import type { SocialActivityEntry, SocialMoveEntry, SocialPostEntry } from '../../model/repository/socialGistRepository';
import type { PalmaresEntry } from '../../model/types/premios';
import type { YearSummarySeen } from '../../model/repository/firebaseClient';
import { useFeedMoveTabs } from '../../view/hooks/useFeedMoveTabs';
import { TAB_ORDER } from '../../core/constants/labels';
import { achievementFeedEntries, type AchievementFeedEntry } from '../../core/achievements/feed';
import { yearSummaryFeedEntries, type YearSummaryFeedEntry } from '../../core/social/yearSummaryFeed';
import { withHiddenMoves } from '../../core/social/moveActivity';
import { feedRecentSince } from '../../core/constants/socialLimits';
import { useAchievementBaselines, type AchievementBaselineSource } from './useAchievementBaselines';
import { ENABLE_ACHIEVEMENTS } from '../../core/achievements/flags';
import type { ProfileTier } from '../../core/constants/tiers';
import type { GameItem, TabId } from '../../model/types/game';
import type { SocialProfileVisibility, SocialSharedGame } from '../../model/repository/socialGistRepository';

/**
 * Identidad del autor con la que se enriquece cada elemento al hidratar el directorio.
 *
 * Al exportar los tipos, el discriminante `kind` deja de ser una convención tácita y pasa a comprobarlo el
 * compilador.
 */
type SocialFeedAuthor = {
  profileId: string;
  profileDisplayName: string;
  socialGistId: string;
  photoURL: string;
};

/** Reseña/recomendación enriquecida con la identidad de su autor (para el feed). */
export type SocialActivityFeedItem = SocialActivityEntry & SocialFeedAuthor;

/** F3 — publicación enriquecida con la identidad de su autor (para el feed). */
export type SocialPostFeedItem = SocialPostEntry & SocialFeedAuthor;

/**
 * F4 — mensaje de lista enriquecido con la identidad de su autor.
 *
 * Lleva `updatedAt` además de su `at` para poder mezclarse con lo demás sin que cada consumidor tenga que
 * saber de qué campo sale la fecha de cada tipo. Es una copia, no una fecha nueva: el orden del feed y el
 * agrupado por día leen `updatedAt` y punto.
 */
export type SocialMoveFeedItem = SocialMoveEntry & SocialFeedAuthor & {
  updatedAt: number;
  /**
   * `actorProfileId` de la reseña de ese juego, si su autor la tiene publicada; `undefined` si no. Es a la vez el
   * «¿hay algo que abrir?» y el identificador con el que se abre.
   *
   * Tiene que ser ESE y no el `profileId` de la entrada del directorio: el detalle de una reseña se resuelve
   * comparando con el `actorProfileId` del gist, y para una amistad el id del directorio es su uid de Firebase.
   * Con el identificador equivocado el enlace llevaba a una pantalla que no encontraba nada.
   *
   * Se resuelve al hidratar cruzando con la actividad del mismo gist —que ya está cargada—, así que no cuesta
   * ninguna lectura extra.
   */
  reviewActorId?: string;
};

/** Un juego dentro del renglón agrupado: lo justo para nombrarlo y, si tiene reseña, abrirla. */
export type SocialMoveGroupGame = Pick<SocialMoveFeedItem, 'id' | 'gameId' | 'gameName' | 'reviewActorId' | 'updatedAt'>;

/**
 * El renglón de movimientos de lista que pinta el feed: los de una persona, a una lista y en un día, JUNTOS (como
 * los logros). Lleva los campos del más reciente —su hora es la del renglón— y en `games` todos los del grupo, del
 * más reciente al más antiguo; con uno solo, el renglón es el de siempre.
 */
export type SocialMoveFeedGroup = SocialMoveFeedItem & {
  /** `<profileId>|<lista>|<AAAA-MM-DD>`: estable mientras el grupo crece, para la clave de render. */
  groupKey: string;
  games: SocialMoveGroupGame[];
};

/**
 * Elemento del feed COMBINADO. `kind` es el discriminante: las publicaciones lo llevan a `'post'` y la actividad
 * no lo lleva (declarado `kind?: undefined` para que TypeScript pueda estrechar la unión con `entry.kind === 'post'`).
 */
export type SocialFeedItem =
  | (SocialActivityFeedItem & { kind?: undefined })
  | (SocialPostFeedItem & { kind: 'post' })
  | (SocialMoveFeedGroup & { kind: 'move' })
  | (AchievementFeedEntry & { kind: 'achievements' })
  | (YearSummaryFeedEntry & { kind: 'yearSummary' });

/** Un día del feed agrupado, tal y como lo pinta la pantalla. */
export type SocialFeedDayGroup = {
  dayHeader: string;
  /** Medianoche LOCAL del día del grupo (el día se decide en la zona del dispositivo, no en UTC). */
  dayDate: Date;
  items: SocialFeedItem[];
};

/** Lo único que el feed necesita de una entrada del directorio. */
type FeedSource = {
  activity?: SocialActivityFeedItem[];
  posts?: SocialPostFeedItem[];
  moves?: SocialMoveFeedItem[];
  /** Los de las listas ocultas: solo entran para la administración (ver `SocialDirectoryEntry.hiddenMoves`). */
  hiddenMoves?: SocialMoveFeedItem[];
  /** Identidad y espejo de logros, para deducir sus desbloqueos sin publicar ni un byte (§8.4). */
  id?: string;
  /** uid de Firebase, que es por quien va el grafo de amistad (el `id` puede ser un profileId ajeno al uid). */
  uid?: string;
  displayName?: string;
  photoURL?: string;
  achievementsMirror?: string;
  /** Si ya abrió su resumen del año en temporada: de aquí sale su tarjeta destacada. */
  yearSummarySeen?: { year: number; at: number } | null;
};

const FEED_PAGE_SIZE = 25;

/** Referencia estable para el valor por defecto: un `new Set()` en la firma rompería el memo en cada render. */
const NO_FRIENDS: ReadonlySet<string> = new Set();

/** Clave de TU línea base cuando todavía no se sabe tu uid. */
const OWN_BASELINE_KEY = 'me';

/** Tope de elementos que se mezclan y ordenan; más allá, el feed no los pinta ni paginando. */
const FEED_MAX_ITEMS = 300;

// Rango válido de JS Date en ms (±100M días). Un `updatedAt` fuera de rango (p. ej. gist de otro usuario con el
// timestamp en micro/nanosegundos o corrupto) daría `new Date(x)` → Invalid Date, que el feed agrupado descarta.
// Si esos ítems ordenan arriba y copan el corte visible, el feed quedaría EN BLANCO. Se saca del feed en origen.
const MAX_VALID_DATE_MS = 8.64e15;

export function hasRenderableTimestamp(value: unknown): boolean {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 && numeric <= MAX_VALID_DATE_MS;
}

/**
 * Junta los movimientos de cada persona por LISTA y DÍA en un solo renglón, como los logros: quien añade cinco
 * juegos a su lista de deseos en una tarde es UNA noticia, no cinco. Entran todos los juegos del día, así que no
 * hace falta tope: como mucho sale un renglón por lista y persona y día.
 *
 * Es de LECTURA, como el filtro de listas: no toca lo que el canal publica, así que vale desde el primer momento
 * para lo ya publicado —el de todo el mundo— sin republicar nada.
 *
 * El día es el de QUIEN MIRA (`localDayKey`, hora local), el mismo con el que el feed titula sus grupos: contarlo
 * en otro huso juntaría bajo la cabecera de hoy un juego de ayer. Se ordena aquí y no se confía en el orden de
 * entrada porque el directorio llega por perfiles; el desempate por `id` mantiene estable cuál encabeza el grupo
 * cuando dos comparten instante (dos juegos movidos en la misma operación).
 *
 * Los mensajes con fecha inválida se quedan solos: los descarta `hasRenderableTimestamp` al mezclar, y filtrarlos
 * dos veces solo repartiría la misma decisión en dos sitios.
 */
function groupMovesByAuthorTabDay(moves: SocialMoveFeedItem[]): SocialMoveFeedGroup[] {
  const groups = new Map<string, SocialMoveFeedGroup>();

  [...moves]
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
    .forEach((move) => {
      const dayKey = localDayKey(new Date(move.updatedAt));
      const groupKey = dayKey ? `${move.profileId}|${move.tab}|${dayKey}` : `${move.profileId}|${move.socialGistId}|${move.id}`;
      const game: SocialMoveGroupGame = {
        id: move.id,
        gameId: move.gameId,
        gameName: move.gameName,
        reviewActorId: move.reviewActorId,
        updatedAt: move.updatedAt,
      };
      const group = groups.get(groupKey);
      if (group) {
        group.games.push(game);
      } else {
        // El primero que llega es el más reciente (van ordenados): encabeza el grupo y pone su hora.
        groups.set(groupKey, { ...move, groupKey, games: [game] });
      }
    });

  return [...groups.values()];
}

// Sigue la zona horaria vigente, igual que el agrupado por día (`localDayKey`/`startOfLocalDay`): con un
// `Intl.DateTimeFormat` fijo del módulo, un cambio de zona con la app abierta ponía «11 de agosto» encima de lo del
// 12. El porqué completo, en `createLocalDateFormat`.
const FEED_DAY_FORMAT = createLocalDateFormat({ day: 'numeric', month: 'long' });

/**
 * Formatea la fecha como "D de MMMM". Pura y sin capturas → a nivel de módulo
 * para que no se recree en cada render (evita invalidar el useMemo del feed).
 *
 * Los meses los pone `Intl` y no una lista escrita a mano: es la misma frase («5 de septiembre») y sale del idioma
 * de la app, no de doce palabras en español.
 */
function formatDayHeader(date: Date): string {
  return FEED_DAY_FORMAT.format(date);
}

/**
 * F3 — feed COMBINADO: reseñas/recomendaciones (actividad) + publicaciones, mezcladas y ordenadas por fecha.
 * Los posts llevan `kind:'post'` para distinguirlos al renderizar; la actividad conserva su `type`.
 */
export function useSocialFeed(
  directory: ReadonlyArray<FeedSource>,
  /**
   * TUS logros, para que aparezcan en tu propio lado de la actividad como el resto de lo que publicas.
   *
   * Llegan aparte y no por el directorio porque hoy no están ahí: mientras la publicación esté apagada, tu
   * espejo no existe en `profiles/{uid}`. Y aunque estuviera, seguiría llegando aparte: el evaluador es la
   * fuente fresca —sabe lo de hace un minuto— y el espejo va siempre un paso por detrás.
   */
  ownAchievements?: {
    profileId: string;
    displayName: string;
    photoURL: string;
    mirror: string;
    /** Tu uid: la clave de TU línea base (ver `useAchievementBaselines`). */
    uid?: string;
    /**
     * ¿Está ya leído lo que tienes PUBLICADO? Hasta entonces tu espejo es solo el de este dispositivo, y sembrar
     * la línea base con él haría pasar por nuevo lo que traigan tus otros dispositivos —incluidas las fechas
     * «de hoy» mal publicadas que la línea base existe para callar—.
     */
    ready?: boolean;
  },
  /**
   * uid de tus AMISTADES. Solo se anuncian los logros de quien está aquí dentro, y es la misma política que ya
   * aplicaba la ficha (`canSeeFullProfile`): allí la vitrina de un desconocido no se enseña.
   *
   * Hace falta explícitamente porque el espejo NO viaja por el gist social —viene del directorio de Firestore,
   * legible para cualquier autenticado— así que, al contrario que la actividad, no se filtra solo por el hecho de
   * que solo se lean los gists de los amigos. Sin este filtro, arreglar la lectura del espejo habría metido en el
   * feed los logros de los hasta cincuenta perfiles públicos del directorio, gente con la que no tienes relación.
   *
   * El agregado del PORCENTAJE comparado (§6.6bis) sigue midiéndose sobre el directorio entero: ahí no hay
   * identidad, solo un porcentaje con su denominador.
   */
  friendUids: ReadonlySet<string> = NO_FRIENDS,
  /**
   * ¿Está RESUELTO el grafo de amistad? Solo entonces se podan las líneas base de quien ya no es amistad: un grafo
   * a medio cargar está vacío, y podar contra él las borraría todas.
   */
  friendsResolved = false,
  /**
   * ¿Mira la cuenta de administración? Entonces ve también los movimientos de las listas que cada cual oculta (está
   * declarado en la política de privacidad). Su propio filtro de listas le sigue valiendo, como a todo el mundo.
   */
  isAdmin = false,
): {
  feedItems: SocialFeedItem[];
  groupedFeedItems: SocialFeedDayGroup[];
  hasMoreFeed: boolean;
  showMoreFeed: () => void;
} {
  // Paginación: 25 inicial, +25 por "Mostrar más".
  const [feedVisibleCount, setFeedVisibleCount] = useState(FEED_PAGE_SIZE);

  // F4 — de qué listas quiere ver los movimientos QUIEN MIRA. La lista sale memoizada sobre la cadena canónica
  // ('cvepd'), que es un primitivo estable y por tanto una dependencia honesta de este `useMemo`: cambiar el
  // filtro recalcula la mezcla y nada más —ni una lectura de red, ni una rehidratación del directorio—.
  const { moveTabs } = useFeedMoveTabs();

  // F5 — de quién se toma línea base: tus amistades con espejo y tú, cuando lo tuyo ya está leído. La clave es el
  // uid, que es por quien va el grafo de amistad y no se desfasa como el `profileId` del directorio.
  const ownKey = ownAchievements?.uid || OWN_BASELINE_KEY;
  const baselineSources = useMemo<AchievementBaselineSource[]>(() => {
    if (!ENABLE_ACHIEVEMENTS) return [];
    const sources = directory
      .filter((entry) => friendUids.has(String(entry.uid || '')) && entry.achievementsMirror)
      .map((entry) => ({ key: String(entry.uid), mirror: String(entry.achievementsMirror) }));
    if (ownAchievements?.ready && ownAchievements.mirror) sources.push({ key: ownKey, mirror: ownAchievements.mirror });
    return sources;
  }, [directory, friendUids, ownAchievements, ownKey]);
  const baselineKeep = useMemo(
    () => (friendsResolved ? new Set([...friendUids, ownKey]) : null),
    [friendsResolved, friendUids, ownKey],
  );
  const baselines = useAchievementBaselines(baselineSources, baselineKeep);

  const feedItems = useMemo<SocialFeedItem[]>(() => {
    const activity = directory.flatMap((entry) => entry.activity || []);
    const posts = directory.flatMap((entry) => entry.posts || []).map((post) => ({ ...post, kind: 'post' as const }));
    // El filtro se aplica AQUÍ, sobre lo que el directorio ya tiene cargado, y no al hidratarlo: así encender una
    // lista que estaba apagada es instantáneo y no obliga a releer el gist social de nadie.
    // Y solo de las listas que esta versión ENSEÑA (`TAB_ORDER`): un amigo con una versión más nueva puede publicar
    // movimientos de una lista que aquí todavía no tiene ni nombre.
    const visibleTabs = new Set(moveTabs.filter((tab) => TAB_ORDER.includes(tab)));
    // La ventana del feed, la misma que la de los logros. El canal ya solo publica eso, pero el gist de quien no se
    // ha actualizado sigue trayendo sus 400, y sin este corte saldrían al pulsar «Mostrar más» avisos de hace años.
    const movesSince = feedRecentSince(Date.now());
    const moves = visibleTabs.size === 0
      ? []
      : groupMovesByAuthorTabDay(
        directory
          // La unión va por AUTOR: el colapso por día es por juego, y el mismo juego de dos personas son dos historias.
          .flatMap((entry) => (isAdmin ? withHiddenMoves(entry.moves || [], entry.hiddenMoves || []) : entry.moves || []))
          .filter((move) => visibleTabs.has(move.tab) && move.updatedAt >= movesSince),
      )
        // El agrupado va DESPUÉS del filtro de listas: un renglón cuenta solo juegos de una lista que se mira.
        .map((move) => ({ ...move, kind: 'move' as const }));

    // LOGROS: una entrada por persona y DÍA, con todos sus logros de ese día dentro (§8.4). No cuesta una
    // petición ni un byte de canal: sale de los espejos que el directorio ya trajo.
    //
    // F5 — y SOLO lo que no estaba en su línea base. Quien todavía no tiene línea base no sale: es su primera
    // foto, que se siembra y calla. Y hasta haber leído las líneas base no sale nadie, o aparecería un anuncio que
    // se retira al instante.
    const achievements = ENABLE_ACHIEVEMENTS && baselines
      ? achievementFeedEntries([
        ...directory
          // SOLO AMISTADES, como el resto del feed. La comparación va por `uid` porque es la clave del grafo de
          // amistad; el `id` de la entrada puede ser un profileId que no coincida con él.
          .filter((entry) => friendUids.has(String(entry.uid || '')))
          .map((entry) => ({
            id: String(entry.id || ''),
            displayName: entry.displayName,
            photoURL: entry.photoURL,
            mirror: String(entry.achievementsMirror || ''),
            own: false,
            seen: baselines[String(entry.uid || '')],
          }))
          // Tu propia entrada del directorio se descarta: la tuya la pone `ownAchievements`, que está más fresca
          // y no depende de que el espejo se haya publicado.
          .filter((entry) => entry.id && entry.mirror && entry.seen !== undefined && entry.id !== ownAchievements?.profileId),
        ...(ownAchievements?.mirror && baselines[ownKey] !== undefined
          ? [{
            id: ownAchievements.profileId,
            displayName: ownAchievements.displayName,
            photoURL: ownAchievements.photoURL,
            mirror: ownAchievements.mirror,
            own: true,
            seen: baselines[ownKey],
          }]
          : []),
      ]).map((entry) => ({ ...entry, kind: 'achievements' as const }))
      : [];

    // EL RESUMEN DEL AÑO: una tarjeta por persona y año, de tus amistades y la tuya, sacada del directorio igual
    // que los logros. Sin línea base: el aviso lo publica su dueño una sola vez, al abrir su resumen en temporada.
    const ownUid = ownAchievements?.uid || '';
    const yearSummaries = yearSummaryFeedEntries(
      directory
        .filter((entry) => friendUids.has(String(entry.uid || '')) || (ownUid && String(entry.uid || '') === ownUid))
        .map((entry) => ({
          id: String(entry.id || ''),
          displayName: entry.displayName,
          photoURL: entry.photoURL,
          seen: entry.yearSummarySeen ?? null,
          own: Boolean(ownUid) && String(entry.uid || '') === ownUid,
        })),
    ).map((entry) => ({ ...entry, kind: 'yearSummary' as const }));

    return [...activity, ...posts, ...moves, ...achievements, ...yearSummaries]
      // Descarta ítems con timestamp inválido/fuera de rango ANTES de ordenar y cortar: si no, ordenarían arriba,
      // coparían el corte visible y el agrupado por día los eliminaría, dejando el feed en blanco (ver bug del 2º amigo).
      .filter((item) => hasRenderableTimestamp(item.updatedAt))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, FEED_MAX_ITEMS);
  }, [directory, moveTabs, isAdmin, ownAchievements, friendUids, baselines, ownKey]);

  const groupedFeedItems = useMemo<SocialFeedDayGroup[]>(() => {
    const groups: SocialFeedDayGroup[] = [];
    const itemsByDay = new Map<string, SocialFeedItem[]>();

    // Solo los elementos visibles según la paginación (25, +25 con "Mostrar más").
    feedItems.slice(0, feedVisibleCount).forEach((item) => {
      const itemDate = new Date(toSafeTimestamp(item.updatedAt, Date.now()));
      // Día en el calendario de QUIEN MIRA, no en Greenwich: una reseña de las 00:06 en UTC+2 es del día
      // anterior en UTC, y agrupada así aparecía bajo la cabecera de ayer mientras su tarjeta —que sí formatea
      // en local— mostraba la fecha de hoy.
      const dayKey = localDayKey(itemDate);
      if (!dayKey) {
        return;
      }

      if (!itemsByDay.has(dayKey)) {
        itemsByDay.set(dayKey, []);
      }

      itemsByDay.get(dayKey)!.push(item);
    });

    // `AAAA-MM-DD` ordena igual alfabética que cronológicamente: comparar el texto evita construir Dates y, sobre
    // todo, evita volver a parsear la clave corta (que la especificación interpreta como medianoche UTC).
    const sortedDays = Array.from(itemsByDay.entries()).sort((a, b) => b[0].localeCompare(a[0]));

    sortedDays.forEach(([dayKey, items]) => {
      const dayDate = startOfLocalDay(dayKey);
      groups.push({ dayHeader: formatDayHeader(dayDate), dayDate, items });
    });

    return groups;
  }, [feedItems, feedVisibleCount]);

  const showMoreFeed = useCallback(() => {
    setFeedVisibleCount((count) => count + FEED_PAGE_SIZE);
  }, []);

  return {
    feedItems,
    groupedFeedItems,
    hasMoreFeed: feedItems.length > feedVisibleCount,
    showMoreFeed,
  };
}

/**
 * Una entrada del DIRECTORIO social ya hidratada: el perfil más lo que se haya podido leer de su gist.
 * Exportado porque las pantallas del hub lo reciben por props; mientras vivía dentro del hook, no había forma
 * de nombrarlo desde fuera y acababan tipadas como `any[]`. Vive AQUÍ, con los tipos de feed que lo componen,
 * para que el hook que hidrata el directorio pueda nombrarlo sin importar del ViewModel que lo monta.
 */
export type SocialDirectoryEntry = {
  id: string;
  uid: string; // uid de Firebase (para relaciones de amistad); hoy coincide con `id`, robusto ante el cutover uid→profileId
  displayName: string;
  socialGistId: string;
  gamesGistId: string;
  photoURL: string;
  /**
   * Rango del perfil, para el punto de color de su tarjeta en el directorio. OBLIGATORIO a propósito: este tipo
   * LOCAL sombrea al del repositorio, y la hidratación reconstruye cada entrada campo a campo. Al declararlo
   * requerido, olvidarse de copiarlo en cualquiera de esas reconstrucciones es un error de compilación y no un
   * directorio entero pintado de bronce.
   */
  tier: ProfileTier;
  /**
   * Cuándo usó esta persona la aplicación por última vez (`profiles.updatedAt`). 0 = no se sabe (un amigo cuyo
   * perfil no se deja leer: sus datos salen del documento de amistad, que no lleva esa marca).
   *
   * Sale del hook porque la ORDENACIÓN por uso reciente la necesitan las pantallas, no solo la hidratación: la
   * consulta de Firestore ya pide `orderBy('updatedAt', 'desc')`, pero ese orden se pierde en cuanto una lista se
   * arma con otra fuente —la de amigos de la bandeja sale de los documentos de amistad— y también cuando falta el
   * índice compuesto y la consulta degrada a sin orden. Con el dato a mano, quien lista ordena y no depende de
   * que se lo hayan dado ordenado. OBLIGATORIO por el mismo motivo que `tier`: que olvidarlo sea un error de
   * compilación y no una lista en orden arbitrario.
   */
  lastActiveAt: number;
  /**
   * ESPEJO DE LOGROS de esa persona (`profiles/{uid}.achievements.list`), tal y como llega del directorio.
   * Vacío si no ha publicado. De él salen su vitrina en la ficha, sus entradas de logros en el feed y la muestra
   * del porcentaje comparado (§6.6bis).
   *
   * OBLIGATORIO por lo mismo que `tier` y `lastActiveAt`: este tipo LOCAL sombrea al del repositorio y la
   * hidratación reconstruye cada entrada campo a campo. Mientras fue opcional —y se leía con un cast— las cuatro
   * reconstrucciones lo dejaban fuera y nadie veía los logros de nadie más.
   */
  achievementsMirror: string;
  /** Si ya abrió su resumen del año en temporada (`profiles/{uid}.yearSummary`). Obligatorio por lo mismo. */
  yearSummarySeen: YearSummarySeen | null;
  /**
   * EL PALMARÉS: las ediciones de la porra ganadas, para la vitrina de la ficha.
   *
   * Opcional, a diferencia del espejo, y a propósito: casi nadie lo tiene —cinco puestos por edición— así que
   * obligar a escribir una lista vacía en cada reconstrucción solo añadiría ruido. Lo que sí vale aquí es la
   * advertencia de arriba: este tipo sombrea al del repositorio, así que una reconstrucción que se lo olvide
   * deja la vitrina en blanco sin que nada avise.
   */
  palmares?: PalmaresEntry[];
  activity: SocialActivityFeedItem[];
  posts: SocialPostFeedItem[];
  /** F4 — mensajes de lista del perfil, ya enriquecidos con su identidad. */
  moves: SocialMoveFeedItem[];
  /**
   * Los de las listas que ese perfil OCULTA (`hiddenMoves` del gist). Se hidratan siempre, y es el feed quien decide:
   * solo los mezcla para la cuenta de administración. Hidratarlos solo para ella no serviría, porque el claim llega
   * después del primer render y el directorio, ya cacheado sin ellos, tardaría media hora en traerlos.
   */
  hiddenMoves?: SocialMoveFeedItem[];
  // Index-only (SocialSharedGame) para perfiles ajenos; para el perfil PROPIO se repuebla con GameItem completos.
  sharedLists: Partial<Record<TabId, Array<GameItem | SocialSharedGame>>>;
  visibility: SocialProfileVisibility;
  /**
   * Amigo cuyo gist social NO se leyó por inactividad (corte de PROFILE_INACTIVITY_MS): su actividad no
   * entra al feed, pero al abrir su perfil se hidrata bajo demanda para no mostrarlo a medias.
   */
  socialSkipped?: boolean;
  /**
   * Su gist social NO se pudo leer (404, credenciales, red). Como `socialSkipped`, deja la visibilidad SIN CONOCER:
   * quien filtre sus listados debe tomarla como todo oculto (`LOCKED_VISIBILITY`), y al abrir su perfil se reintenta.
   */
  socialUnreadable?: boolean;
};

/** ¿Se conoce lo que esta persona esconde? Solo si su canal social se ha leído (ver `socialUnreadable`). */
export function isVisibilityKnown(entry: Pick<SocialDirectoryEntry, 'socialSkipped' | 'socialUnreadable'>): boolean {
  return !entry.socialSkipped && !entry.socialUnreadable;
}
