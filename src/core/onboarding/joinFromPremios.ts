// FUERA DE `tourState` A PROPÓSITO: aquel viaja en el arranque de todo el mundo, y esto solo lo usa la sección de
// premios, que es perezosa.
import { offeredTour, type TourState } from './tourState';

/**
 * LA INVITACIÓN DE LOS PREMIOS: quien acaba de votar sin tener nada más de la aplicación pulsa «Empieza tu lista».
 * Se pone en marcha la guía ENTERA desde el primer juego —no una misión suelta—, porque viene de fuera y lo que
 * se quiere es que acabe en lo social, que es la última misión.
 *
 * No hace falta la tarjeta de bienvenida: el sí ya lo ha dado al pulsar. Y con una guía en marcha, plegada o
 * abierta en su lista, no se toca nada (`null`): ahí manda ella.
 */
export function joinFromPremios(state: TourState | null): TourState | null {
  if (state && ['active', 'paused', 'menu', 'finale'].includes(state.status)) return null;
  const base = state ?? offeredTour();
  return {
    ...base,
    status: 'active',
    mission: 'first-game',
    step: 0,
    single: false,
    completed: base.completed.filter((id) => id !== 'first-game'),
    skipped: base.skipped.filter((id) => id !== 'first-game'),
  };
}

