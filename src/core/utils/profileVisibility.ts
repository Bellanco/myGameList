import { TAB_IDS, type GameItem, type TabData, type TabId } from '../../model/types/game';
import type { SocialProfileVisibility } from '../../model/types/social';
import { finishDays } from './finishDates';

/**
 * Bloque 6 — Filtra la lista de juegos de OTRO perfil según la visibilidad que ese usuario publicó (respeto de la
 * visibilidad del lado cliente): vacía las pestañas ocultas y elimina los campos que no quiere exponer
 * (horas/rejugable/reintentar). PURA. La lista cruda llega del gist de listados; este filtro decide qué se muestra.
 *
 * LA CUENTA DE ADMINISTRACIÓN es la excepción, y solo hasta cierto punto: ve las listas que el dueño esconde y sus
 * marcas de rejugable y de "merece otra oportunidad", pero NO sus horas. El tiempo de juego es el único ajuste que
 * se respeta frente a todo el mundo, así que quien lo oculta lo oculta de verdad. Está declarado en la política de
 * privacidad (ver `core/constants/legal`): sin decirlo, no valdría hacerlo. La decide el claim `admin`
 * (`hasAdminClaim`), no el rango.
 *
 * EL MES EN QUE TERMINÓ CADA JUEGO sí pasa, como `finishedOn` (`AAAA-MM`), para el resumen del año de su perfil;
 * la cuenta de administración lo recibe con el día (`AAAA-MM-DD`). Se deriva aquí del sello de completados antes
 * de tirarlo, sin los días de carga en bloque (ver `core/utils/finishDates`), y también está declarado en la
 * política de privacidad.
 */
/**
 * LA VISIBILIDAD QUE SE APLICA CUANDO NO SE CONOCE LA DE VERDAD: todo oculto. Se usa mientras no se ha podido leer
 * el canal social de esa persona —amigo inactivo cuyo gist no se lee al hidratar, o gist ilegible—, que es donde
 * vive lo que esconde. Sin ella el filtro tomaba «nada oculto» y las listas que su dueño esconde salían en su
 * ficha: falla CERRADO. La cuenta de administración sigue viendo las listas (es la excepción de arriba), pero no las
 * horas, que solo se le enseñan si su dueño no las oculta, y aquí no se sabe.
 */
export const LOCKED_VISIBILITY: SocialProfileVisibility = {
  hiddenTabs: [...TAB_IDS],
  hideReplayable: true,
  hideRetry: true,
  hideGameTime: true,
  showPhoto: false,
};

export function applyProfileVisibility(
  games: TabData,
  visibility: SocialProfileVisibility,
  isAdmin = false,
): Record<TabId, GameItem[]> {
  const hidden = new Set(isAdmin ? [] : visibility.hiddenTabs || []);
  // Se calcula sobre la lista de completados ENTERA: una carga en bloque solo se distingue viéndolas todas.
  const finished = finishDays(games.c || []);
  const scrub = (game: GameItem, tab: TabId): GameItem => {
    const next: GameItem & { finishedOn?: string } = { ...game };
    if (visibility.hideGameTime) next.hours = null;
    if (!isAdmin && visibility.hideReplayable) next.replayable = false;
    if (!isAdmin && visibility.hideRetry) next.retry = false;
    /**
     * Los sellos automáticos se caen SIEMPRE, para cualquier rango y sin ajuste que los rescate.
     *
     * No son un dato del juego sino un registro de cuándo su dueño lo movió de lista y cuándo le cambió la nota:
     * a qué horas usa la app y qué días juega. El canal social ya los tiene prohibidos, pero el gist de LISTADOS
     * —que una amistad sí baja para ver su perfil— los llevaba, y ese es el mismo dato por otra puerta. Aquí, que
     * es donde se recorta lo que no debe verse de otra persona, se van.
     *
     * Y siguen yéndose después de F4, que publica la actividad de listas: lo que se publica allí es una
     * proyección acotada y declarada (la primera entrada a cada lista; las ocultas, aparte), no el registro
     * completo. Dejar pasar el campo aquí daría el historial entero, que es otra cosa.
     *
     * Del de completados se rescata solo el MES (el día, para la administración): es lo que necesita el resumen
     * del año, y es menos de lo que la actividad de listas ya publica de cada fin.
     */
    const day = tab === 'c' ? finished.get(game.id) : undefined;
    if (day) next.finishedOn = isAdmin ? day : day.slice(0, 7);
    delete next.enteredAt;
    delete next.gradedAt;
    return next;
  };
  const out = { c: [], v: [], e: [], p: [], d: [] } as Record<TabId, GameItem[]>;
  for (const tab of TAB_IDS) {
    out[tab] = hidden.has(tab) ? [] : (games[tab] || []).map((game) => scrub(game, tab));
  }
  return out;
}
