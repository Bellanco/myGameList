/**
 * LOS MOMENTOS DE LA APLICACIÓN.
 *
 * Un tema no puede celebrar nada si no sabe cuándo pasa algo. Hasta ahora los efectos de firma colgaban de lo
 * único que el DOM ya contaba por su cuenta —un clic, el cambio de `data-theme`, el cambio de `data-palette`—,
 * así que ningún tema podía responder a lo que de verdad ocurre aquí: que cierras un juego, que se guarda, que
 * filtras la lista o que cae un logro.
 *
 * ES UN AVISO, NO UNA LLAMADA A UN EFECTO. Quien emite no sabe qué se va a pintar, ni si hay algo que pintar:
 * dice qué ha pasado y sigue. Quien escucha (`useSignatureEffects`) decide, y solo con su paleta activa, los
 * efectos encendidos y sin `prefers-reduced-motion`. Por eso vive en `core` y no en `view`: el viewmodel puede
 * contar lo que hace sin enterarse de que existen los temas.
 *
 * SE HACE CON UN EVENTO DEL DOCUMENTO y no con un contexto de React a propósito. Los efectos son DOM efímero
 * fuera del árbol —se inyectan en `body`, se animan una vez y se borran solos—, así que meterlos en el ciclo de
 * render solo añadiría estados que nadie lee y renders que no pintan nada.
 */

/** Qué acaba de pasar. Uno por MOMENTO, no por efecto: varios temas cuelgan del mismo. */
export type AppMoment =
  /** Un juego pasa a la lista del completista: se acabó. */
  | 'game-closed'
  /** La biblioteca se ha escrito (alta, edición o cambio de lista). */
  | 'library-saved'
  /** Han cambiado los filtros del listado. */
  | 'list-filtered'
  /** Ha caído un logro nuevo. */
  | 'achievement-unlocked';

/** El nombre del evento. Con prefijo para no chocar con nada del navegador ni de una extensión. */
export const MOMENT_EVENT = 'gl:moment';

export interface MomentDetail {
  moment: AppMoment;
  /** Dónde ha ocurrido, cuando hay un sitio concreto al que ir: el efecto puede nacer ahí en vez de en el centro. */
  origin?: { x: number; y: number };
}

/**
 * Cuenta que ha pasado algo. Nunca lanza ni bloquea: un efecto decorativo no puede tumbar un guardado, así que
 * un `dispatchEvent` que falle (o un entorno sin `document`, como los tests de nodo) se traga en silencio.
 */
export function emitMoment(moment: AppMoment, origin?: MomentDetail['origin']): void {
  if (typeof document === 'undefined') return;
  try {
    document.dispatchEvent(new CustomEvent<MomentDetail>(MOMENT_EVENT, { detail: { moment, origin } }));
  } catch {
    /* vacío a propósito: ver arriba */
  }
}
