// El popup de Google y los botones que lo abren. SIN dependencias a propósito: lo usan pantallas que no deben
// cargar Firebase para saber si un error es «el usuario volvió a pulsar».
//
// EL PROBLEMA QUE RESUELVE. `signInWithPopup` no se resuelve cuando cierras la ventana de Google sin elegir cuenta:
// Firebase mira cada 2 s si sigue abierta y, al verla cerrada, espera OTROS 8 s por si la respuesta aún viene de
// camino (`pollUserCancellation` en `@firebase/auth`). Hasta 10 s con el botón en «Entrando...». En el móvil el popup
// es una pestaña: si se vuelve a la app sin cerrarla —el «atrás» de muchos navegadores—, el botón se queda así
// indefinidamente.

/** Cuánto se espera, tras volver a la app con el popup sin resolver, para devolver el botón. */
export const GOOGLE_POPUP_RETURN_GRACE_MS = 3000;

/**
 * ¿Este fallo es un intento que Firebase CANCELÓ porque se abrió otro? Pasa al volver a pulsar el botón con el
 * popup anterior aún pendiente: el nuevo cancela al viejo. No es un error que enseñar, y quien lo recibe no debe
 * tocar el estado del botón: ya lo lleva el intento nuevo.
 */
export function isSupersededSignIn(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'auth/cancelled-popup-request');
}

/**
 * Avisa, UNA vez, si la persona vuelve a la app (la ventana recupera el foco o la pestaña vuelve a verse) y pasados
 * `graceMs` sigue sin haber respuesta. El margen es para el caso bueno: al elegir cuenta, Google cierra el popup y el
 * resultado llega un instante después, así que el foco vuelve ANTES de que haya nada que resolver.
 *
 * Devuelve la función que deja de vigilar; hay que llamarla en cuanto el inicio de sesión termine, bien o mal.
 */
export function watchReturnToApp(onReturn: () => void, graceMs = GOOGLE_POPUP_RETURN_GRACE_MS): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let done = false;

  const alVolver = () => {
    if (done || timer !== null || document.visibilityState === 'hidden') return;
    timer = setTimeout(() => {
      timer = null;
      if (done) return;
      done = true;
      stop();
      onReturn();
    }, graceMs);
  };
  const alIrse = () => {
    // Si vuelve a irse (otra vez al popup) antes de que venza el margen, no se ha rendido: se espera a la siguiente.
    if (document.visibilityState === 'hidden' && timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  function stop(): void {
    window.removeEventListener('focus', alVolver);
    document.removeEventListener('visibilitychange', alVolver);
    document.removeEventListener('visibilitychange', alIrse);
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  window.addEventListener('focus', alVolver);
  document.addEventListener('visibilitychange', alVolver);
  document.addEventListener('visibilitychange', alIrse);
  return () => {
    done = true;
    stop();
  };
}
