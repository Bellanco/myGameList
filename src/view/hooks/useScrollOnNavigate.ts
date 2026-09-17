import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * QUÉ HACE EL SCROLL AL CAMBIAR DE PANTALLA, que hasta ahora no lo decidía nadie.
 *
 * React Router no toca la posición: con `pushState` el navegador te deja donde estabas, así que entrar en
 * Ajustes desde media lista te dejaba a media página de una pantalla que ya era otra. Lo único que lo corregía
 * eran dos parches sueltos —el hub social al abrir una reseña y el panel al cambiar de año—, y ninguno de los
 * dos es un cambio de RUTA, de modo que el resto de la aplicación no tenía quien la gobernara. De ahí que
 * pareciera arbitrario: unas veces subía y otras no.
 *
 * La regla va por el TIPO de navegación, no por la ruta:
 *
 *  - **PUSH** (pulsar una opción, ir a una pantalla nueva) → arriba del todo. Es lo que se espera al abrir algo.
 *  - **POP** (volver atrás, y el botón «volver» que usa `backTo`) → se restaura donde estabas. Es lo que hace
 *    que volver no se sienta como perder el sitio, y es la mitad que más se echa de menos.
 *  - **REPLACE** → nada. No es un viaje: es la misma pantalla corrigiendo su URL (por ejemplo, la expulsión de
 *    `/cuenta` sin sesión), y moverla sería un salto sin causa.
 *
 * Y UNA EXCEPCIÓN DECLARADA: si la navegación trae `state.anclaje`, aquí no se toca nada. Significa que quien
 * navegó quiere ir a un sitio concreto —el logro que acabas de conseguir, por ejemplo— y es la pantalla de
 * destino la que sabe dónde está. Sin esto habría dos saltos: primero al principio y después al ancla.
 */

/** Cuántas posiciones se recuerdan. El historial de una sesión larga no cabe en memoria, ni hace falta. */
const MAX_POSICIONES = 50;

export function useScrollOnNavigate(): void {
  const location = useLocation();
  const tipo = useNavigationType();
  const posiciones = useRef(new Map<string, number>());
  /* La PRIMERA vez no es una navegación: es la carga. Ahí manda el navegador, que restaura por su cuenta la
     posición al recargar (`history.scrollRestoration`), y pisarlo subiría al principio a quien recarga a media
     lista sin haber pedido ir a ninguna parte. */
  const cargado = useRef(false);

  /* SE GUARDA AL SALIR, no al hacer scroll: una entrada por cambio de pantalla en vez de una por cada píxel
     desplazado. La limpieza del efecto es exactamente el instante en que esta pantalla deja de ser la actual. */
  useEffect(() => {
    const clave = location.key;
    // El mapa se toma AQUÍ y no en la limpieza: es un `useRef` que nunca se reasigna, pero leerlo dentro del
    // cierre es lo que espera la regla de los hooks y ahorra tener que explicar la excepción cada vez.
    const mapa = posiciones.current;
    return () => {
      mapa.set(clave, window.scrollY);
      if (mapa.size > MAX_POSICIONES) mapa.delete(mapa.keys().next().value as string);
    };
  }, [location.key]);

  useLayoutEffect(() => {
    if (!cargado.current) {
      cargado.current = true;
      return undefined;
    }
    if ((location.state as { anclaje?: unknown } | null)?.anclaje) return undefined;
    if (tipo === 'REPLACE') return undefined;

    const destino = tipo === 'POP' ? (posiciones.current.get(location.key) ?? 0) : 0;
    window.scrollTo(0, destino);

    /* Y UN SEGUNDO INTENTO EN EL SIGUIENTE FOTOGRAMA, solo al volver y solo si no se llegó. La pantalla a la que
       se vuelve puede entrar por `lazy()`: en el instante del efecto todavía no tiene su altura, así que pedir
       1.200 px de scroll a un documento que mide 800 no hace nada y el usuario aparece arriba. Con el contenido
       ya pintado, el mismo scroll sí llega. */
    if (destino === 0) return undefined;
    const id = window.requestAnimationFrame(() => {
      if (Math.abs(window.scrollY - destino) > 4) window.scrollTo(0, destino);
    });
    return () => window.cancelAnimationFrame(id);
  }, [location.key, location.state, tipo]);
}
