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
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────────────────
 * DÓNDE SE APUNTA LA POSICIÓN, que es lo único difícil de todo esto y donde fallaron los dos primeros intentos.
 * Los dos se veían razonables y los dos guardaban un CERO:
 *
 *  1. En la limpieza de un efecto pasivo. Corre después de los efectos de layout de la pantalla nueva, para
 *     entonces la línea de abajo ya había subido la página y lo que se apuntaba era ese cero.
 *  2. En la limpieza de un efecto de LAYOUT, que corre antes. Tampoco: cuando se ejecuta, React ya ha pintado la
 *     pantalla nueva, el listado largo ya no está, el documento mide lo que la ventana y **el navegador ya ha
 *     recortado el scroll a cero por su cuenta**. Otra vez el cero, por otro camino.
 *
 * Lo que funciona es no preguntarlo en el momento de navegar: un oyente de `scroll` mantiene a la vista la
 * última posición conocida, y al cambiar de pantalla se apunta ESA para la pantalla que se deja. El recorte
 * automático del navegador también dispara su evento de scroll, pero llega después —los eventos de scroll se
 * despachan con el siguiente refresco, no durante la mutación del DOM—, así que para cuando ensucia el valor ya
 * está guardado el bueno.
 *
 * Nada de esto se ve en jsdom, donde `scrollY` siempre vale 0: lo sujeta `tests/e2e/scroll.test.ts`, contra el
 * build de producción.
 */

/** Cuántas posiciones se recuerdan. El historial de una sesión larga no cabe en memoria, ni hace falta. */
const MAX_POSICIONES = 50;

/**
 * HASTA CUÁNDO SE INSISTE EN RESTAURAR LA POSICIÓN AL VOLVER.
 *
 * Empezó siendo un número fijo de fotogramas —veinte, ~330 ms— y se quedaba corto en la pantalla del perfil: sus
 * bloques se pintan poco a poco, así que a los veinte fotogramas el documento todavía no llegaba a donde
 * estábamos y la restauración se quedaba a medias (500 px pedidos, 276 conseguidos). Lo delató el recorrido
 * anidado de `tests/e2e/scroll.test.ts`.
 *
 * Así que el criterio ya no es contar fotogramas, es MIRAR SI LA PÁGINA SIGUE CRECIENDO: mientras el alto cambie,
 * es que aún se está montando y merece la pena insistir; cuando deja de cambiar unos cuantos fotogramas
 * seguidos, ya no va a crecer más y seguir sería pelearle el scroll a nadie. El tope de tiempo es la red de
 * seguridad para una pantalla que no parara nunca (una animación de alto, una lista que se rellena sola).
 */
const QUIETO_MAX = 6;
const TOPE_MS = 1500;

export function useScrollOnNavigate(): void {
  const location = useLocation();
  const tipo = useNavigationType();
  const posiciones = useRef(new Map<string, number>());
  /** Última posición conocida, mantenida al día por el oyente de scroll (ver la cabecera). */
  const ultima = useRef(0);
  /** Qué pantalla estábamos mirando: es a la que hay que apuntarle la posición cuando se cambia. */
  const anterior = useRef<string | null>(null);
  /* La PRIMERA vez no es una navegación: es la carga. Ahí manda el navegador, que restaura por su cuenta la
     posición al recargar (`history.scrollRestoration`), y pisarlo subiría al principio a quien recarga a media
     lista sin haber pedido ir a ninguna parte. */
  const cargado = useRef(false);

  useEffect(() => {
    let sello = 0;
    const alDesplazar = () => {
      const y = window.scrollY;
      const ahora = performance.now();
      /* EL CERO DE LA NAVEGACIÓN NO ES UN GESTO DE NADIE, y distinguirlo es lo único que hace que volver
         funcione. Al cambiar de pantalla, el navegador pone el scroll a cero por su cuenta y dispara su evento
         ANTES de que corra ningún efecto de React, así que machaca la última posición justo antes de que se
         apunte. Se reconoce porque es un SALTO: de seiscientos píxeles a cero en menos de lo que tarda un
         fotograma. Ninguna mano hace eso —ni la rueda, ni el dedo, ni la barra—, y el «volver arriba» de la
         casa tampoco, que va suave y pasa por todos los valores intermedios.
         Lo que se pierde con esto es el caso de quien pulsa `Inicio` y navega en el mismo suspiro: al volver
         se le devuelve a donde estaba antes de pulsar. A cambio, volver funciona siempre. */
      const salto = y === 0 && ultima.current > 64 && ahora - sello < 100;
      sello = ahora;
      if (salto) return;
      ultima.current = y;
    };
    window.addEventListener('scroll', alDesplazar, { passive: true });
    return () => window.removeEventListener('scroll', alDesplazar);
  }, []);

  useLayoutEffect(() => {
    // Lo primero, apuntar dónde se quedaba la pantalla que se deja; después ya se puede mover la nueva.
    const mapa = posiciones.current;
    if (anterior.current && anterior.current !== location.key) {
      mapa.set(anterior.current, ultima.current);
      if (mapa.size > MAX_POSICIONES) mapa.delete(mapa.keys().next().value as string);
    }
    anterior.current = location.key;

    if (!cargado.current) {
      cargado.current = true;
      return undefined;
    }
    if ((location.state as { anclaje?: unknown } | null)?.anclaje) return undefined;
    if (tipo === 'REPLACE') return undefined;

    const destino = tipo === 'POP' ? (mapa.get(location.key) ?? 0) : 0;
    ultima.current = destino;
    window.scrollTo(0, destino);
    if (destino === 0) return undefined;

    /* Y SE INSISTE UNOS FOTOGRAMAS, solo al volver y solo hasta llegar. La pantalla a la que se vuelve no tiene
       todavía su altura en el instante del efecto: el listado está virtualizado y se pinta por trozos, así que
       pedirle 600 px de scroll a un documento que aún mide lo que la ventana no hace nada —el navegador lo
       recorta a cero— y el usuario aparece arriba.
       Se para en cuanto se llega, al agotar los intentos, o si quien mira se pone a desplazar por su cuenta:
       pelearle el scroll a alguien que ya está moviéndose es peor que no restaurar nada. */
    let frame = 0;
    let quieto = 0;
    let altoAnterior = 0;
    let cancelado = false;
    const limite = performance.now() + TOPE_MS;
    const rendirse = () => { cancelado = true; };
    const eventos = ['wheel', 'touchstart', 'keydown'] as const;
    eventos.forEach((evento) => window.addEventListener(evento, rendirse, { once: true, passive: true }));

    const insistir = () => {
      if (cancelado || performance.now() > limite) return;
      if (Math.abs(window.scrollY - destino) <= 4) return;

      const alto = document.documentElement.scrollHeight;
      quieto = alto === altoAnterior ? quieto + 1 : 0;
      altoAnterior = alto;
      if (quieto >= QUIETO_MAX) return; // ya no crece: no va a llegar más lejos por esperar

      window.scrollTo(0, destino);
      frame = window.requestAnimationFrame(insistir);
    };
    frame = window.requestAnimationFrame(insistir);

    return () => {
      cancelado = true;
      window.cancelAnimationFrame(frame);
      eventos.forEach((evento) => window.removeEventListener(evento, rendirse));
    };
  }, [location.key, location.state, tipo]);
}
