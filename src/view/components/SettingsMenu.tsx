import { memo, useCallback, useEffect, useRef, useMemo } from 'react';
import { usePremiosVisible } from '../../viewmodel/premios/usePremiosVisible';
/** La sección de premios. Literal y no importado de `premiosRoutes`, que vive en el chunk de esa sección. */
const PREMIOS_HOME = '/premios';
import { Link, useLocation } from 'react-router-dom';
import { UI_MESSAGES } from '../../core/constants/labels';
import { SETTINGS_ROUTES, type SettingsGroup } from '../../core/constants/routes';
import { SETTINGS_MENU_ID } from '../../core/constants/uiConfig';

const MENU = UI_MESSAGES.settingsMenu;

interface SettingsMenuProps {
  /** ¿Hay espacio social? Sin él, «Diseño» no tiene nada que enseñar y no se pinta. */
  hasSocialProfile: boolean;
  /** Avisa a `App` de que el menú se ha abierto o cerrado: de eso depende que el contenido se atenúe. */
  onToggle: (open: boolean) => void;
}

/**
 * LOS PUNTOS DEL MENÚ, EN ORDEN DE LECTURA Y CON SU RANGO.
 *
 * El orden y el tamaño no son decoración: son la frecuencia con la que se entra en cada sitio, y por eso cada
 * punto es MENOR que el anterior. Arriba y en grande, la apariencia, que es lo que se cambia por gusto y a
 * menudo; en medio, las etiquetas con las que clasificas, que se retocan de vez en cuando; y abajo del todo
 * «Datos», que se toca al empezar (conectar la sincronización, importar), cuando algo va mal (las copias) o
 * una vez al año (la analítica, los documentos, el borrado).
 *
 * ERAN CUATRO PUNTOS. «Integración» y «Legal» ocupaban dos para lo mismo —tus datos—, así que comparten
 * pantalla; lo legal no pierde acceso por eso: sigue a un toque de aquí, que es lo que promete el aviso de
 * cookies cuando dice que puedes cambiar de idea.
 *
 * El rango va EN EL DATO y no en la posición: sin espacio social, «Personalización» no se pinta, y con el rango
 * contado por índice el segundo punto heredaría un tamaño que no le toca.
 */
const PUNTOS: ReadonlyArray<{ group: SettingsGroup; label: string; rank?: 'second' | 'third' }> = [
  { group: 'design', label: MENU.design },
  { group: 'filters', label: MENU.filters, rank: 'second' },
  { group: 'data', label: MENU.data, rank: 'third' },
];

/**
 * LOS PREMIOS, que no son un grupo de ajustes sino un salto a otra sección —de ahí que no estén en `PUNTOS`, que
 * indexa `SETTINGS_ROUTES`—.
 *
 * VA EN ÁMBAR, con el color de aviso de cada tema y no con el acento: es lo único de este menú que lleva fuera de
 * Ajustes, y el color es lo que lo dice sin necesidad de explicarlo. Cambia de piel con el tema como todo lo
 * demás; un amarillo fijo se habría salido del sistema y no habría pasado el contraste en las paletas claras.
 *
 * AL NIVEL DE «Filtros» y sin mover a los otros dos. La escalera de este menú tiene tres peldaños medidos
 * (1,20 · 1,00 · 0,86) y el propio componente avisa de que bajar más el tono «sería abrir un caso que nadie ha
 * medido»: un cuarto escalón dejaría a «Datos» en letra de pie de foto, que es de donde se venía. Repetir tamaño
 * es más barato que inventarse un peldaño, y aquí el que distingue es el color.
 *
 * SOLO SE PINTA CUANDO HAY ALGO QUE VER (ver `usePremiosVisible`): votación abierta, resultados recientes, o
 * porque lo diga el interruptor del panel. Fuera de temporada, este menú vuelve a tener tres puntos.
 */
const PUNTO_PREMIOS = { to: PREMIOS_HOME, label: MENU.premios, rank: 'second' as const };

/**
 * EL MENÚ DE LA PESTAÑA DE AJUSTES — tres puntos y nada más, cada uno menor que el anterior (ver `PUNTOS`).
 *
 * No hay panel, ni velo, ni caja: solo los rótulos flotando sobre la pantalla, con un punto de luz delante.
 * Quien sostiene el contraste no es una superficie sino el CONTENIDO DE DEBAJO, que baja al 30 % mientras el
 * menú está abierto (ver `.main.is-dimmed`). Medido sobre el peor fondo imaginable —una carátula blanca en tema
 * oscuro, una negra en claro— da 6,4:1 y 6,6:1 en el peor píxel del trazo. La sombra del texto remata, pero no
 * carga con el trabajo: sola, sobre blanco, no pasaba de 2:1 por más capas que se le echaran.
 *
 * ES UN `popover`, NO UN `<dialog>`: `showModal()` habría dejado la barra inferior inerte, así que con el menú
 * abierto no se podría tocar «Listados» directamente. Un menú no debe secuestrar la pantalla. A cambio, el
 * navegador se encarga del cierre al pulsar fuera, del Esc y de la capa superior; y el botón que lo abre lo
 * gobierna con `popovertarget`, que resuelve solo el caso peliagudo de volver a pulsarlo estando abierto.
 *
 * Y SON ENLACES DENTRO DE UN `<nav>`, no botones dentro de un `role="menu"`. Un menú ARIA promete un teclado
 * que hay que escribir —flechas, Inicio, Fin, tabulador que cierra— y anunciarlo sin dárselo es peor que no
 * anunciarlo: quien lo oye pulsa flechas y no pasa nada. Esto es navegación, lleva a cuatro direcciones, así
 * que enlaces: se abren en otra pestaña, se copian, se recorren con el tabulador de siempre.
 */
export const SettingsMenu = memo(function SettingsMenu({ hasSocialProfile, onToggle }: SettingsMenuProps) {
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  /** ¿La entrada de historial de ESTE menú sigue siendo la de arriba? Evita retroceder de más al cerrar. */
  const ownsHistoryRef = useRef(false);

  const cerrar = useCallback(() => {
    // `hidePopover` lanza si el menú ya no está abierto (p. ej. el navegador lo cerró antes): no es un error.
    try { ref.current?.hidePopover(); } catch { /* ya estaba cerrado */ }
  }, []);

  /**
   * EL BOTÓN DE ATRÁS TIENE QUE CERRAR EL MENÚ, no salir de la aplicación. En un móvil es el gesto natural para
   * deshacer lo último, y sin esto lo último que se deshace es la visita entera. Se empuja una entrada al abrir
   * y se consume al cerrar, con una marca para no retroceder una entrada que ya no es nuestra.
   */
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const onPopState = () => {
      ownsHistoryRef.current = false;
      if (node.matches(':popover-open')) cerrar();
    };

    const onToggleEvent = (event: Event) => {
      const open = (event as ToggleEvent).newState === 'open';
      onToggle(open);
      if (open) {
        window.history.pushState({ settingsMenu: true }, '');
        ownsHistoryRef.current = true;
        return;
      }
      // Cerrado por Esc, por pulsar fuera o por elegir un grupo: se retira la entrada que se empujó al abrir.
      if (ownsHistoryRef.current) {
        ownsHistoryRef.current = false;
        window.history.back();
      }
    };

    node.addEventListener('toggle', onToggleEvent);
    window.addEventListener('popstate', onPopState);
    return () => {
      node.removeEventListener('toggle', onToggleEvent);
      window.removeEventListener('popstate', onPopState);
    };
  }, [cerrar, onToggle]);

  /**
   * ELEGIR UN GRUPO SUSTITUYE la entrada del menú en vez de retroceder por ella (`<Link replace>`), y esto no es
   * un matiz: cerrar hace `history.back()` para consumir lo que se empujó al abrir, así que con una navegación
   * normal las dos cosas corren a la vez y el retroceso DESHACÍA el salto —se abría el grupo y la pantalla
   * volvía sola a los listados—. Con `replace`, la entrada del menú pasa a ser la del grupo: no queda nada que
   * consumir, de ahí el `ownsHistory = false`, y el botón de atrás lleva a donde se estaba.
   */
  const alElegir = useCallback(() => {
    ownsHistoryRef.current = false;
    cerrar();
  }, [cerrar]);

  const ofrecePremios = usePremiosVisible();

  /**
   * Los puntos del menú, EN ORDEN. Premios va detrás de Diseño —no al final—, que es donde se decidió que
   * estuviera: es lo segundo que se ofrece cuando hay edición, no una nota al pie.
   *
   * Se compone una sola lista en vez de pintar el de premios aparte: con dos bloques, su posición dependía del
   * orden del marcado y acababa siempre al final sin que nada lo dijera.
   */
  const puntos = useMemo(() => {
    const base = hasSocialProfile ? PUNTOS : PUNTOS.filter((p) => p.group !== 'design');
    const lista: Array<{ key: string; to: string; label: string; rank?: string; premios?: boolean }> = base.map(
      (punto) => ({ key: punto.group, to: SETTINGS_ROUTES[punto.group], label: punto.label, rank: punto.rank }),
    );
    if (!ofrecePremios) return lista;

    const tras = lista.findIndex((punto) => punto.key === 'design');
    const entrada = { key: 'premios', to: PUNTO_PREMIOS.to, label: PUNTO_PREMIOS.label, rank: PUNTO_PREMIOS.rank, premios: true };
    lista.splice(tras + 1, 0, entrada);
    return lista;
  }, [hasSocialProfile, ofrecePremios]);

  return (
    <nav
      ref={ref}
      id={SETTINGS_MENU_ID}
      popover="auto"
      className="settings-menu"
      aria-label={MENU.ariaLabel}
    >
      {puntos.map(({ key, to, label, rank, premios }) => {
        const actual = premios ? pathname.startsWith(to) : pathname === to;
        return (
          <Link
            key={key}
            to={to}
            replace
            className={`settings-menu-point ${rank ? `is-${rank}` : ''} ${premios ? 'is-premios' : ''} ${actual ? 'is-current' : ''}`.replace(/\s+/g, ' ').trim()}
            aria-current={actual ? 'page' : undefined}
            onClick={alElegir}
          >
            <span className="settings-menu-dot" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
});
