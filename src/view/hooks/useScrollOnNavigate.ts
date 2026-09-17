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
 * Ha tenido tres formas y las dos primeras eran finas de más. Un número fijo de fotogramas (veinte, ~330 ms) se
 * quedaba corto en la pantalla del perfil, cuyos bloques se pintan poco a poco. Mirar «si la página sigue
 * creciendo» y rendirse cuando el alto se estabilizaba tampoco: un listado virtualizado puede tener el alto
 * quieto un instante y crecer después, así que abandonaba antes de tiempo y fallaba una de cada quince veces.
 *
 * Ahora solo hay un tope de tiempo. Insistir no cuesta nada cuando ya se ha llegado —se sale en la primera
 * comprobación— y quien esté desplazando por su cuenta lo corta con el primer gesto.
 */
const TOPE_MS = 1500;

export function useScrollOnNavigate(): void {
  const location = useLocation();
  const tipo = useNavigationType();
  const posiciones = useRef(new Map<string, number>());
  /** Última posición conocida, mantenida al día por el oyente de scroll (ver la cabecera). */
  const ultima = useRef(0);
  /** ¿Hay una navegación en marcha? Mientras lo esté, el scroll que llegue no es de nadie (ver abajo). */
  const navegando = useRef(false);
  /** Qué pantalla estábamos mirando: es a la que hay que apuntarle la posición cuando se cambia. */
  const anterior = useRef<string | null>(null);
  /* La PRIMERA vez no es una navegación: es la carga. Ahí manda el navegador, que restaura por su cuenta la
     posición al recargar (`history.scrollRestoration`), y pisarlo subiría al principio a quien recarga a media
     lista sin haber pedido ir a ninguna parte. */
  const cargado = useRef(false);

  useEffect(() => {
    /* EL CERO DE LA NAVEGACIÓN NO ES UN GESTO DE NADIE, y distinguirlo es lo único que hace que volver funcione.
       Al cambiar de pantalla el navegador pone el scroll a cero por su cuenta y dispara su evento ANTES de que
       corra ningún efecto de React, así que machaca la última posición justo antes de que se apunte.
       LA PRIMERA VERSIÓN LO ADIVINABA POR EL RELOJ —un salto a cero en menos de 100 ms— y era frágil por
       diseño: en una máquina lenta ese hueco se estira, el filtro no dispara y se guarda el cero. Pasaba en
       local y fallaba en integración continua, que es la peor clase de prueba: la que solo delata a veces.
       Ahora no se adivina, se SABE. Toda navegación empieza por un gesto que podemos ver antes que React: un
       clic (en captura, antes de que nadie lo procese) o el «atrás» del navegador (`popstate`). Desde ese
       instante y hasta que la pantalla nueva esté montada, lo que diga el scroll no es de nadie y no se apunta.
       Y como un clic puede no llevar a ninguna parte —abrir un menú, marcar una casilla—, cualquier gesto de
       desplazamiento de verdad vuelve a abrir la puerta. */
    const alDesplazar = () => {
      if (!navegando.current) ultima.current = window.scrollY;
    };
    const alNavegar = () => { navegando.current = true; };
    const alDesplazarAMano = () => { navegando.current = false; };

    window.addEventListener('scroll', alDesplazar, { passive: true });
    document.addEventListener('click', alNavegar, true);
    window.addEventListener('popstate', alNavegar);
    const gestos = ['wheel', 'touchstart', 'keydown'] as const;
    gestos.forEach((gesto) => window.addEventListener(gesto, alDesplazarAMano, { passive: true }));

    return () => {
      window.removeEventListener('scroll', alDesplazar);
      document.removeEventListener('click', alNavegar, true);
      window.removeEventListener('popstate', alNavegar);
      gestos.forEach((gesto) => window.removeEventListener(gesto, alDesplazarAMano));
    };
  }, []);

  useLayoutEffect(() => {
    // Lo primero, apuntar dónde se quedaba la pantalla que se deja; después ya se puede mover la nueva.
    const mapa = posiciones.current;
    if (anterior.current && anterior.current !== location.key) {
      mapa.set(anterior.current, ultima.current);
      if (mapa.size > MAX_POSICIONES) mapa.delete(mapa.keys().next().value as string);
    }
    anterior.current = location.key;
    navegando.current = false;

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
    let cancelado = false;
    const limite = performance.now() + TOPE_MS;
    const rendirse = () => { cancelado = true; };
    const eventos = ['wheel', 'touchstart', 'keydown'] as const;
    eventos.forEach((evento) => window.addEventListener(evento, rendirse, { once: true, passive: true }));

    const insistir = () => {
      if (cancelado || performance.now() > limite) return;
      if (Math.abs(window.scrollY - destino) <= 4) return;
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
