// Feed del hub social: los tipos de sus elementos y el estado DERIVADO que pinta la pantalla (mezcla, orden,
// paginación y agrupado por día).
//
// Primera pieza que sale de `useSocialViewModel` (2.470 líneas, 44 `useState`, 19 `useEffect`): es la más segura
// de mover porque no hace E/S ni toca la sincronización — todo lo que produce sale del directorio ya hidratado
// más su propio contador de paginación.
import { useCallback, useMemo, useState } from 'react';
import { normalizeTimestamp as toSafeTimestamp } from '../../core/utils/normalize';
import type { SocialActivityEntry, SocialPostEntry } from '../../model/repository/socialGistRepository';

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
 * Elemento del feed COMBINADO. `kind` es el discriminante: las publicaciones lo llevan a `'post'` y la actividad
 * no lo lleva (declarado `kind?: undefined` para que TypeScript pueda estrechar la unión con `entry.kind === 'post'`).
 */
export type SocialFeedItem =
  | (SocialActivityFeedItem & { kind?: undefined })
  | (SocialPostFeedItem & { kind: 'post' });

/** Un día del feed agrupado, tal y como lo pinta la pantalla. */
export type SocialFeedDayGroup = {
  dayHeader: string;
  dayDate: Date;
  items: SocialFeedItem[];
};

/** Lo único que el feed necesita de una entrada del directorio. */
type FeedSource = { activity?: SocialActivityFeedItem[]; posts?: SocialPostFeedItem[] };

const FEED_PAGE_SIZE = 25;

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

const FEED_DAY_MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;

/**
 * Formatea la fecha como "DD de MMM". Pura y sin capturas → a nivel de módulo
 * para que no se recree en cada render (evita invalidar el useMemo del feed).
 */
function formatDayHeader(date: Date): string {
  return `${date.getDate()} de ${FEED_DAY_MONTH_NAMES[date.getMonth()]}`;
}

/**
 * F3 — feed COMBINADO: reseñas/recomendaciones (actividad) + publicaciones, mezcladas y ordenadas por fecha.
 * Los posts llevan `kind:'post'` para distinguirlos al renderizar; la actividad conserva su `type`.
 */
export function useSocialFeed(directory: ReadonlyArray<FeedSource>): {
  feedItems: SocialFeedItem[];
  groupedFeedItems: SocialFeedDayGroup[];
  hasMoreFeed: boolean;
  showMoreFeed: () => void;
} {
  // Paginación: 25 inicial, +25 por "Mostrar más".
  const [feedVisibleCount, setFeedVisibleCount] = useState(FEED_PAGE_SIZE);

  const feedItems = useMemo<SocialFeedItem[]>(() => {
    const activity = directory.flatMap((entry) => entry.activity || []);
    const posts = directory.flatMap((entry) => entry.posts || []).map((post) => ({ ...post, kind: 'post' as const }));

    return [...activity, ...posts]
      // Descarta ítems con timestamp inválido/fuera de rango ANTES de ordenar y cortar: si no, ordenarían arriba,
      // coparían el corte visible y el agrupado por día los eliminaría, dejando el feed en blanco (ver bug del 2º amigo).
      .filter((item) => hasRenderableTimestamp(item.updatedAt))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, FEED_MAX_ITEMS);
  }, [directory]);

  const groupedFeedItems = useMemo<SocialFeedDayGroup[]>(() => {
    const groups: SocialFeedDayGroup[] = [];
    const itemsByDay = new Map<string, SocialFeedItem[]>();

    // Solo los elementos visibles según la paginación (25, +25 con "Mostrar más").
    feedItems.slice(0, feedVisibleCount).forEach((item) => {
      const itemDate = new Date(toSafeTimestamp(item.updatedAt, Date.now()));
      if (Number.isNaN(itemDate.getTime())) {
        return;
      }
      const dayKey = itemDate.toISOString().split('T')[0];

      if (!itemsByDay.has(dayKey)) {
        itemsByDay.set(dayKey, []);
      }

      itemsByDay.get(dayKey)!.push(item);
    });

    const sortedDays = Array.from(itemsByDay.entries())
      .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime());

    sortedDays.forEach(([dayKey, items]) => {
      const dayDate = new Date(dayKey);
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
