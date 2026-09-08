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
import { ACHIEVEMENTS_BY_ID } from './catalog';
import { parseMirror } from './pack';
import { RARITY_POINTS } from './types';
import type { AchievementDef } from './types';

/** Cuánto hacia atrás se anuncia. Sin este corte, quien lleva un mes sin abrir el hub recibe treinta avisos. */
export const FEED_RECENT_DAYS = 30;

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
 * Las entradas de logros del feed, deducidas de los espejos del directorio.
 *
 * PENDIENTE DE F5, y va escrito para que no se olvide: aquí falta comparar contra `achievementsPeerSeen`
 * (`LocalMeta`, §5.4), que es lo que convierte «lo reciente» en «lo que ha cambiado desde la última vez que
 * miré». Sin esa comparación, esta función anuncia todo lo reciente en cada apertura en vez de anunciarlo una
 * sola vez.
 *
 * Lo que NO se puede usar para eso es la caché del directorio: tiene TTL por rango —30 min en bronce, **60 s en
 * mithril**— se invalida al aceptar una amistad y se descarta al subir su versión de forma. Devuelve `null` al
 * caducar, que significaría «no hay foto previa» y por tanto «callar»: el resultado sería el revés exacto de lo
 * que el rango promete, con el rango más alto viendo MENOS logros ajenos. La línea base tiene que ser un
 * registro sin caducidad, no un caché.
 */
export function achievementFeedEntries(
  sources: readonly AchievementFeedSource[],
  now = Date.now(),
): AchievementFeedEntry[] {
  const cutoff = now - FEED_RECENT_DAYS * 24 * 60 * 60 * 1000;
  const entries: AchievementFeedEntry[] = [];

  for (const source of sources) {
    if (!source.mirror) continue; // quien no publica no tiene espejo que comparar: el opt-out sale gratis

    const byDay = new Map<string, Array<{ def: AchievementDef; level: number }>>();
    for (const item of parseMirror(source.mirror, now)) {
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
     * UNA ENTRADA POR PERSONA: la de su día MÁS RECIENTE, no una por cada día de los últimos treinta.
     *
     * El corte de 30 días acota cuánto hacia atrás se mira, pero no cuántas entradas produce cada persona: sin
     * este segundo tope, alguien con actividad diaria mete treinta tarjetas en el feed él solo, y con cuarenta
     * perfiles el feed deja de tener reseñas. Es la misma lección de `keepLatestPerDay`, un escalón más arriba.
     *
     * Cuando llegue F5 este tope deja de ser el que manda —lo será la comparación contra `achievementsPeerSeen`,
     * que normalmente da cero o un día por persona— pero se queda como red: quien vuelve tras un mes fuera
     * seguiría trayendo treinta días de golpe.
     */
    const latest = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]))[0];
    if (!latest) continue;
    const [day, items] = latest;
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

  return entries;
}
