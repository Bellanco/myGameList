// FUERA DE `tourState` A PROPÓSITO: aquel viaja en el arranque de todo el mundo, y esto solo lo usa la sección de
// premios, que es perezosa. (`App` y la guía importan de aquí únicamente el TIPO, que no viaja.)
import { offeredTour, type TourState } from './tourState';

/**
 * A QUÉ SE INVITA desde los premios, según lo que ya tenga de la aplicación quien está mirando:
 *
 *  - `list`: no tiene ni un juego. Se le invita a empezar su lista, y la guía entera le acaba llevando a lo social.
 *  - `social`: ya lleva su lista, pero no lo social. Se le invita solo a eso.
 */
export type PremiosInviteKind = 'list' | 'social';

/**
 * LA INVITACIÓN, tal y como la pinta la guía: la decide la sección de premios (pantalla, edición y si ya se
 * contestó) y la pinta la guía, que es quien tiene la burbuja. `accept` y `dismiss` ya apuntan la respuesta.
 */
export interface PremiosInvite {
  kind: PremiosInviteKind;
  accept: () => void;
  dismiss: () => void;
}

/** Estados de una guía en marcha, plegada o abierta en su lista: aceptar no la pisa. */
const RUNNING: readonly TourState['status'][] = ['active', 'paused', 'menu', 'finale'];

/**
 * ¿Pinta ya algo la guía? Entonces manda ella, y los premios no invitan a nada. Cuenta también la tarjeta de
 * bienvenida (`offer`): está en pantalla, y una burbuja encima sería decir lo mismo dos veces.
 */
export function isGuideShowing(state: TourState | null): boolean {
  return state !== null && (state.status === 'offer' || RUNNING.includes(state.status));
}

/**
 * QUIEN ACEPTA LA INVITACIÓN DE LOS PREMIOS («Enséñame»).
 *
 *  - Sin juegos (`list`), la guía ENTERA desde el primer juego —no una misión suelta—, porque viene de fuera y lo
 *    que se quiere es que acabe en lo social, que es la última misión.
 *  - Con su lista ya hecha (`social`), SOLO el modo cooperativo, como el «¿Te enseño?» de Social: vino a hacer eso.
 *
 * No hace falta la tarjeta de bienvenida: el sí ya lo ha dado al pulsar. Y con una guía en marcha, plegada o
 * abierta en su lista, no se toca nada (`null`): ahí manda ella.
 */
export function joinFromPremios(state: TourState | null, kind: PremiosInviteKind = 'list'): TourState | null {
  if (state && RUNNING.includes(state.status)) return null;
  const base = state ?? offeredTour();
  const mission = kind === 'social' ? 'coop' : 'first-game';
  return {
    ...base,
    status: 'active',
    mission,
    step: 0,
    single: kind === 'social',
    completed: base.completed.filter((id) => id !== mission),
    skipped: base.skipped.filter((id) => id !== mission),
  };
}
