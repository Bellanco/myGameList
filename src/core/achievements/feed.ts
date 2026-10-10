// LOS LOGROS EN LA ACTIVIDAD SOCIAL. Ver docs/plan-logros.md §8.4.
//
// NO CUESTA NI UN BYTE DE CANAL: el lector compara el espejo que acaba de bajar con lo que ya sabía y deduce el
// cambio él solo. Ninguna escritura nueva, ningún campo nuevo, ninguna entrada en el gist social. Es la misma
// idea que sostiene todo el evolutivo —derivar en vez de registrar— aplicada al otro lado del canal.
//
// SE AGRUPA POR DÍA, NO POR LOGRO, y es la regla que hace que esto no sea ruido: una entrada por persona y día,
// con todos sus logros de ese día dentro. No cinco entradas seguidas del mismo nombre bajando por el feed. Es lo
// que F4 ya hizo con los mensajes de lista (`keepLatestPerDay`) y por el mismo motivo.
//
// Y EL AGRUPADO ES DE LECTURA, NO DE PUBLICACIÓN: no se escribe nada en ninguna parte, así que agrupar es
// simplemente cómo el lector presenta la diferencia que acaba de deducir.
import { localDayKey, noonOfLocalDay } from '../utils/dateTime';
import { FEED_RECENT_DAYS, feedRecentSince } from '../constants/socialLimits';
import { ACHIEVEMENTS_BY_ID } from './catalog';
import { parseMirror } from './pack';
import { RARITY_POINTS } from './types';
import type { AchievementDef } from './types';

/**
 * Cuánto hacia atrás se anuncia. Sin este corte, quien lleva un mes sin abrir el hub recibe treinta avisos. Es la
 * misma ventana que la de los movimientos de lista, y vive con ella en `socialLimits`.
 */
export { FEED_RECENT_DAYS };

/**
 * Cuántos DÍAS distintos de una misma persona entran en el feed: la red para quien tiene logros casi a diario, o para
 * una amistad que se ve por primera vez, que traería un mes entero de golpe.
 */
export const FEED_DAYS_PER_PERSON = 5;

/**
 * Desde cuándo las fechas de los espejos son fiables (docs/plan-feed-sin-vacio.md, Fase 5). Hasta la 1.4.7
 * (28-09-2026, `freezeDates`) la fecha de un logro se recalculaba en cada evaluación como «la del sello que hace el
 * número», y un sello renovado —volver a poner nota, reescribir una reseña— fechaba hoy un logro de hace meses. Esas
 * fechas se publicaron y siguen CONGELADAS en los espejos, así que en el feed no sale nada anterior a esta: en la
 * vitrina se ven igual. Es medianoche local del 29-09-2026.
 *
 * TEMPORAL: la peor de esas fechas es del 28-09, y el 28-10-2026 cae fuera de la ventana de 30 días. A partir de ese
 * día esta cota no recorta nada y se puede retirar (anotado en la revisión general).
 */
export const ACHIEVEMENT_DATES_RELIABLE_FROM = new Date(2026, 8, 29).getTime();

export interface AchievementFeedEntry {
  /** `<profileId>:<AAAA-MM-DD>`: una entrada por persona y día, y determinista para la clave de render. */
  key: string;
  profileId: string;
  authorName: string;
  photoURL: string;
  /** Mediodía del día local, para que el agrupado por día del feed lo coloque donde toca. */
  updatedAt: number;
  items: Array<{ def: AchievementDef; level: number }>;
  /**
   * ¿Es actividad PROPIA? El feed pinta lo tuyo con su color, y sin esta marca tus logros aparecerían como los de
   * un desconocido en tu propio feed.
   *
   * No se puede deducir del gist como el resto de la actividad: un logro no sale de un gist, sale del espejo, así
   * que quien construye las fuentes es quien sabe cuál es la suya.
   */
  own: boolean;
}

export interface AchievementFeedSource {
  id: string;
  displayName?: string;
  photoURL?: string;
  /** El espejo crudo de esa persona, tal y como llega de `profiles/{uid}`. */
  mirror: string;
  own?: boolean;
}

/**
 * Las entradas de logros del feed, deducidas de los espejos del directorio: todo lo de los últimos 30 días
 * (`FEED_RECENT_DAYS`) con fecha fiable (`ACHIEVEMENT_DATES_RELIABLE_FROM`), en su día, como una reseña o un
 * movimiento de lista.
 *
 * ⚑ HUBO UNA LÍNEA BASE (F5, 28-09-2026 → 10-10-2026): solo salía lo que no estaba en la PRIMERA foto que este
 * dispositivo tomó del espejo de esa persona, para callar las fechas malas de antes de `freezeDates`. Pero callaba
 * también lo bueno: con una amistad nueva, un móvil nuevo o los datos borrados no salía ningún logro, y el feed
 * parecía vacío. Se retiró por decisión del usuario («los logros de los amigos son solo visibles»); las fechas malas
 * las tapa ahora la cota (docs/plan-feed-sin-vacio.md, Fase 5).
 */
export function achievementFeedEntries(
  sources: readonly AchievementFeedSource[],
  now = Date.now(),
): AchievementFeedEntry[] {
  const cutoff = feedRecentSince(now);
  const entries: AchievementFeedEntry[] = [];

  for (const source of sources) {
    if (!source.mirror) continue; // quien no publica no tiene espejo que comparar: el opt-out sale gratis

    const byDay = new Map<string, Array<{ def: AchievementDef; level: number }>>();
    for (const item of parseMirror(source.mirror, now)) {
      // Sin fecha no se puede situar en el feed, y un logro sin sello es un estado previsto, no un error: se
      // queda fuera del feed y se sigue viendo en su vitrina.
      if (!item.unlockedAt || item.unlockedAt < cutoff || item.unlockedAt < ACHIEVEMENT_DATES_RELIABLE_FROM) continue;
      const def = ACHIEVEMENTS_BY_ID.get(item.id);
      if (!def) continue;
      const day = localDayKey(item.unlockedAt);
      if (!day) continue;
      const list = byDay.get(day) || [];
      list.push({ def, level: item.level });
      byDay.set(day, list);
    }

    /**
     * UNA ENTRADA POR PERSONA Y DÍA, hasta `FEED_DAYS_PER_PERSON` días, los más recientes.
     *
     * Antes era solo el día MÁS RECIENTE, pero así una entrada desaparecía del feed en cuanto esa persona conseguía
     * algo al día siguiente. Lo normal es uno o dos días por persona; el tope es la red para quien tiene logros casi a
     * diario.
     */
    const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, FEED_DAYS_PER_PERSON);
    for (const [day, items] of days) {
      entries.push({
        key: `${source.id}:${day}`,
        profileId: source.id,
        authorName: String(source.displayName || ''),
        photoURL: String(source.photoURL || ''),
        updatedAt: noonOfLocalDay(day),
        own: Boolean(source.own),
        // Lo más raro primero dentro del día: si la entrada se recorta, que se quede lo que de verdad es noticia.
        // Por RAREZA y, a igualdad, por escalón: desde que cada escalón es un logro, el `level` vale 1 en todos y
        // ordenar por él dejaba el orden al azar del catálogo.
        items: items.sort((a, b) => {
          const weight = RARITY_POINTS[b.def.rarity] - RARITY_POINTS[a.def.rarity];
          return weight !== 0 ? weight : b.def.grade - a.def.grade;
        }),
      });
    }
  }

  return entries;
}
