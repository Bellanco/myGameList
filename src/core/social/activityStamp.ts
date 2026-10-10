// EL SELLO DE LA RECONCILIACIÓN DE ACTIVIDAD SOCIAL: lo que decide, sin red y sin Firebase, si hay algo que publicar.
//
// Vivía dentro de `model/repository/socialActivityReconcile`, que arrastra el SDK de Firebase y el repositorio del
// gist social. Sale aquí porque desde la Fase 3 de docs/plan-feed-sin-vacio.md lo pregunta también la pasada de fondo
// de la app principal en cada apertura, y para contestar «no hay nada nuevo» —lo normal— no puede bajarse Firebase.
// Una sola definición para los dos: si divergieran, la pasada de fondo creería que no hay nada y el hub sí, o al revés.
import { deriveMoveActivity } from './moveActivity';
import { feedRecentSince } from '../constants/socialLimits';
import type { TabData } from '../../model/types/game';
import { TAB_IDS, UNPLAYED_TAB_IDS } from '../../model/types/game';
import type { LocalMeta } from '../../model/types/local';

// Solo estas pestañas publican reseña: próximos y deseos nunca lo hacen (mismo criterio que `handleSaveDraft`).
const REVIEWABLE_TABS = TAB_IDS.filter((tab) => !UNPLAYED_TAB_IDS.includes(tab));

// Versión de la LÓGICA de reconciliación. El sello solo vale para la versión que lo escribió: si esta sube, la
// siguiente apertura del hub fuerza una pasada aunque el sello esté fresco y el recuento cuadre. Es lo que
// permite que una corrección llegue a los gists que ya tocó una versión anterior sin esperar a que caduque el
// sello ni pedirle nada al usuario. SUBIRLA cada vez que cambie lo que la pasada escribe o repara.
//   1 = versión inicial.
//   2 = identidad por gameId (no por actor) + cadena de fechas `_ts`/`listedAt` + reparación de fechas selladas
//       con "ahora" (una entrada bajo un id antiguo se duplicaba y el dedupe borraba la original).
//   3 = F4: además de las reseñas, se proyectan los mensajes de lista (`moves`) desde los sellos `enteredAt`.
//       Es lo que hace que la actividad de lista llegue a los gists que ya existen sin pedirle nada al usuario.
//   4 = F4: se RETIRAN los mensajes que la biblioteca local desmiente teniendo el juego delante. Lo que había
//       publicado antes del filtro de «jugar, no catalogar» —un «finalizó tal cosa» de un juego que en realidad se
//       pasó hace años— se quedaba para siempre: la regla anterior solo retiraba mensajes de juegos AUSENTES. Sube
//       la versión para que la limpieza alcance a los gists que ya tocó la 3, sin esperar a que caduque el sello.
//   5 = F4: filtro de «movimientos, no altas» (ver `libraryEntryTab`). La lista por la que el juego entró en la
//       biblioteca deja de publicar mensaje, y la retirada de la 4 es la que limpia los que ya estaban publicados
//       —casi todos los de próximos, que suele ser la lista de entrada— en cuanto se abre el hub.
//   6 = F4: de cada juego queda un solo mensaje por día, el último (ver `keepLatestPerDay`). Sube por lo mismo que
//       la 5: los «comenzó» que ese día acabaron en «abandonó» o «finalizó» ya están publicados, y es la retirada
//       la que los quita.
//   7 = F4: vuelven las ALTAS, solo las de desde el 07-10-2026 (`LIBRARY_ENTRIES_PUBLISHED_FROM`). Sube para que
//       las altas hechas entre esa fecha y la llegada de esta versión se publiquen en cuanto se abra el hub.
//   8 = F4: los mensajes de las listas OCULTAS se publican aparte, en `hiddenMoves`, para la administración. Sube
//       para que los gists que ya existen los lleven en cuanto su dueño abra el hub con esta versión.
//   9 = F4: el canal solo guarda los avisos de los últimos 30 días (`FEED_RECENT_DAYS`), en los dos campos. Sube para
//       que los gists que ya existen suelten lo más viejo en cuanto su dueño abra el hub, no al caducar el sello.
export const RECONCILE_LOGIC_VERSION = 9;


export type LocalReview = {
  id: number;
  name: string;
  review: string;
  rating: number;
  grade: number | null;
  ts: number;
};


/** Reseñas publicables de los listados, deduplicadas por id (gana la de `_ts` mayor) y ordenadas por fecha. */
export function collectLocalReviews(games: TabData): LocalReview[] {
  const byId = new Map<number, LocalReview>();

  REVIEWABLE_TABS.forEach((tab) => {
    (games[tab] || []).forEach((game) => {
      const id = Number(game.id || 0);
      const name = String(game.name || '').trim();
      const review = String(game.review || '').trim();
      if (id <= 0 || !name || !review) {
        return;
      }
      const candidate: LocalReview = {
        id,
        name,
        review,
        rating: Number(game.score || 0),
        grade: typeof game.grade === 'number' ? game.grade : null,
        // Fecha de la reseña, por orden de fiabilidad: `reviewedAt` (la propia de la reseña, que solo mueve un
        // cambio de texto), luego `_ts` (última modificación del juego, que mueve cualquier edición) y luego
        // `listedAt` (llegada a la lista). Sin ninguna, el llamador cae a la del listado; nunca a "ahora" a
        // ciegas, que colocaría una reseña antigua en la cabecera del feed.
        ts: Number(game.reviewedAt || 0) || Number(game._ts || 0) || Number(game.listedAt || 0),
      };
      const current = byId.get(id);
      if (!current || candidate.ts > current.ts) {
        byId.set(id, candidate);
      }
    });
  });

  return [...byId.values()].sort((a, b) => b.ts - a.ts);
}


/** Los recuentos LOCALES con los que se sella la pasada: reseñas publicables y avisos de lista dentro de la ventana. */
export function localActivityCounts(games: TabData, now = Date.now()): { reviewCount: number; moveCount: number } {
  return {
    reviewCount: collectLocalReviews(games).length,
    // F4: el recuento de mensajes de lista se compara igual que el de reseñas, y con las listas ocultas del gist
    // todavía sin leer. Se cuenta sin filtro a propósito: es un número LOCAL para detectar movimientos (barato, sin
    // red), no lo que se va a publicar. Esconder una lista mueve el recuento y fuerza una pasada, que es lo suyo.
    // Con la ventana del feed: así un aviso que cumple los 30 días mueve el recuento y fuerza la pasada que lo retira.
    moveCount: deriveMoveActivity(games, { since: feedRecentSince(now) }).length,
  };
}

/**
 * ¿Hay algo que la última pasada no vio? Una publicación que quedó pendiente, un recuento distinto o un sello de otra
 * versión de la lógica —que puede haber dejado el gist con entradas que esta versión sabe arreglar (identidad
 * antigua, fechas selladas con «ahora») y que el recuento no detecta—. No mira la edad del sello: eso lo decide quien
 * pregunta.
 */
export function localActivityChanged(games: TabData, meta: LocalMeta | null | undefined, now = Date.now()): boolean {
  if (meta?.pendingSocialActivity) return true;
  const { reviewCount, moveCount } = localActivityCounts(games, now);
  return meta?.activityReviewCount !== reviewCount
    || meta?.activityMoveCount !== moveCount
    || meta?.activityReconcileVersion !== RECONCILE_LOGIC_VERSION;
}
