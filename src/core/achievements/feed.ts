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
 * Cuántos DÍAS distintos de una misma persona entran en el feed. Con la línea base el volumen normal es cero o un
 * día por persona; esto es la red para quien vuelve tras un mes fuera, que traería treinta de golpe.
 */
export const FEED_DAYS_PER_PERSON = 5;

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
  /**
   * LA LÍNEA BASE (§8.4): el espejo de esa persona tal y como estaba la PRIMERA vez que este dispositivo lo vio.
   * Lo que ya estaba ahí no es noticia, traiga la fecha que traiga. Sin ella (`undefined`) no se filtra nada: es
   * el llamante quien decide que una fuente sin línea base se siembra y calla.
   */
  seen?: string;
}

/**
 * Las entradas de logros del feed, deducidas de los espejos del directorio.
 *
 * F5 — SOLO ES NOTICIA LO QUE NO ESTABA EN LA LÍNEA BASE (`seen`, guardada en `achievementsPeerSeen` de
 * `LocalMeta`, §5.4). Sin esa comparación, cualquier fecha reciente que llegara a un espejo salía como un logro de
 * ese día, fuera o no nuevo: una fecha recuperada del recorte de la cola, o las que se publicaron «de hoy» antes
 * de que las fechas se fijaran (ver `freezeDates`).
 *
 * ⚑ LA LÍNEA BASE ES LA PRIMERA FOTO, NO LA ÚLTIMA. El plan decía «el último espejo visto», actualizado en cada
 * hidratación, y así una novedad salía UNA vez: al reabrir el feed ya formaba parte de lo visto y la entrada
 * desaparecía, cuando una reseña o un movimiento de lista se quedan en su día. Con la foto fija, lo nuevo se queda
 * en su día hasta que lo saca el corte de `FEED_RECENT_DAYS`, como cualquier otro elemento del feed.
 *
 * Lo que NO se puede usar como línea base es la caché del directorio: tiene TTL por rango —30 min en bronce, **60 s en
 * mithril**— se invalida al aceptar una amistad y se descarta al subir su versión de forma. Devuelve `null` al
 * caducar, que significaría «no hay foto previa» y por tanto «callar»: el resultado sería el revés exacto de lo
 * que el rango promete, con el rango más alto viendo MENOS logros ajenos. La línea base tiene que ser un
 * registro sin caducidad, no un caché.
 */
export function achievementFeedEntries(
  sources: readonly AchievementFeedSource[],
  now = Date.now(),
): AchievementFeedEntry[] {
  const cutoff = feedRecentSince(now);
  const entries: AchievementFeedEntry[] = [];

  for (const source of sources) {
    if (!source.mirror) continue; // quien no publica no tiene espejo que comparar: el opt-out sale gratis

    // Se lee con el MISMO catálogo que el espejo de hoy: así, los logros que este cliente empieza a reconocer al
    // actualizarse —o al llegar la configuración del panel— salen en las dos lecturas y no pasan por nuevos.
    const seen = source.seen === undefined
      ? null
      : new Set(parseMirror(source.seen, now).map((item) => item.id));

    const byDay = new Map<string, Array<{ def: AchievementDef; level: number }>>();
    for (const item of parseMirror(source.mirror, now)) {
      if (seen?.has(item.id)) continue;
      // Sin fecha no se puede situar en el feed, y un logro sin sello es un estado previsto, no un error: se
      // queda fuera del feed y se sigue viendo en su vitrina.
      if (!item.unlockedAt || item.unlockedAt < cutoff) continue;
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
     * Antes era solo el día MÁS RECIENTE, porque sin línea base cada apertura traía todo lo de los últimos treinta
     * días y el tope era lo único que frenaba a alguien con actividad diaria. Pero así una entrada desaparecía del
     * feed en cuanto esa persona conseguía algo al día siguiente. Con la línea base el volumen normal es cero o un
     * día por persona, y el tope se queda como red para quien vuelve tras un mes fuera.
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
