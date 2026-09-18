import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { IconName } from '../../core/constants/icons';
import { UI_MESSAGES } from '../../core/constants/labels';
import { SETTINGS_MENU_ID } from '../../core/constants/uiConfig';
import { Icon } from './Icon';

// 'legal' NO está en NAV_ITEMS a propósito: los documentos legales se alcanzan por enlace (aviso de cookies,
// tarjeta de cuenta, puerta del hub social), no ocupan un hueco en la barra inferior. 'admin' tampoco: es una
// ruta oculta que solo sirve al administrador (ver AdminHub) y no debe anunciarse en la interfaz de nadie.
import type { AppSection } from '../../core/constants/routes';
export type { AppSection };

interface BottomNavigationProps {
  currentSection: AppSection;
  onSectionChange: (section: AppSection) => void;
  /** ¿Está desplegado el menú de Ajustes? Solo para anunciarlo; de abrirlo y cerrarlo se encarga el navegador. */
  settingsMenuOpen: boolean;
}

// LAS CUATRO ZONAS DE LA APLICACIÓN, en un solo plano. Ajustes vuelve aquí desde el botón flotante en el que
// estuvo: arriba a la derecha era la esquina peor alcanzable con el pulgar, tenía la misma forma que el cambio
// de tema —que no lleva a ninguna parte— y se escondía al hacer scroll, así que media aplicación desaparecía a
// mitad de página. Cuenta no es una cuarta pestaña sino contenido de Ajustes (ver el menú de la pestaña).
const NAV_ITEMS: Array<{ key: AppSection; label: string; icon: IconName }> = [
  { key: 'lists', label: UI_MESSAGES.nav.lists, icon: 'bottom-lists' },
  { key: 'social', label: UI_MESSAGES.nav.social, icon: 'bottom-hub' },
  { key: 'stats', label: UI_MESSAGES.nav.stats, icon: 'bottom-stats' },
  { key: 'settings', label: UI_MESSAGES.nav.settings, icon: 'bottom-settings' },
];

/**
 * Aire mínimo entre el contenido de un botón y su pastilla: por debajo de esto el rótulo va pegado al borde y
 * la barra se lee apretada, aunque técnicamente «quepa».
 */
const BTN_AIR = 10;

/*
 * AQUÍ VIVÍA `STACK_FONT_RATIO`, y su desaparición es la mitad del arreglo.
 *
 * Estimaba lo que mide el rótulo apilado multiplicando lo que mide en una línea por `--fs-2xs / --fs-sm`. El
 * problema no era la idea, era que ese número tiene que seguir a mano un cuerpo de letra que vive en el CSS — y
 * dejó de seguirlo: en pantalla estrecha (`max-width:620px`) el rótulo en línea no es `--fs-sm` sino `--fs-xs`,
 * así que la estimación se quedaba un 8 % corta y el escalón se decidía con un número que no era el real.
 *
 * Ahora no se estima: se mide en dos pasadas (ver `measure`). Cuesta un fotograma cuando hay que bajar de
 * escalón y a cambio no hay ninguna constante que mantener en sintonía con la hoja de estilos.
 */

/**
 * Cómo se dibuja cada botón según el sitio que haya, de más a menos: `row` es el de siempre (icono y rótulo en
 * una línea), `stack` pone el icono ENCIMA del rótulo —el gesto clásico de una barra inferior, y lo que hace que
 * el nombre siga viéndose en un móvil estrecho, porque deja de pagar el ancho del icono— y `icon` renuncia al
 * rótulo a la vista cuando ni así cabe.
 */
type NavLayout = 'row' | 'stack' | 'icon';

/**
 * Navegacion inferior principal al estilo BottomNavigationView.
 *
 * En una pantalla estrecha los rótulos no caben en una línea y el más largo se salía de su pastilla
 * —«Estadísticas» tocando el borde de la barra—. La barra baja entonces un escalón: primero apila icono y
 * nombre, y solo si tampoco hay sitio se queda en ICONO, con el nombre en el DOM para el lector de pantalla.
 * Así se ve entera, con sus dianas de 48 px, desde un móvil de 280 px hasta un escritorio.
 */
export const BottomNavigation = memo(function BottomNavigation({ currentSection, onSectionChange, settingsMenuOpen }: BottomNavigationProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const [layout, setLayout] = useState<NavLayout>('row');
  /** Espejo de `layout` para leerlo dentro del medidor sin re-suscribir el `resize` en cada cambio. */
  const layoutRef = useRef<NavLayout>('row');
  /** Lo que pide el botón más ancho: en una línea (`row`) y solo con su rótulo (`stack`). */
  const needsRef = useRef({ row: 0, stack: 0 });
  const items = NAV_ITEMS;

  // ¿Caben los rótulos? Se MIDE en lugar de fijar un ancho de corte: lo que ocupa el texto cambia con el idioma,
  // con el ajuste de MAYÚSCULAS de los ajustes y con el cuerpo de letra del navegador, y un punto de corte a ojo
  // no ve nada de eso. Solo se mide en `row`, que es como se pinta el primer render y donde el rótulo está a la
  // vista; luego se compara contra esa medida, así que la decisión no puede oscilar —la columna mide igual en
  // los tres modos (rejilla de fracciones iguales) y el rótulo no cambia de cuerpo al apilarse—.
  useLayoutEffect(() => {
    const container = innerRef.current;
    if (!container) return;
    const aplicar = (next: NavLayout) => {
      layoutRef.current = next;
      setLayout(next);
    };

    /**
     * EL ESCALÓN SE MIDE EN DOS PASADAS, y cada una mide lo que de verdad se va a pintar.
     *
     * Un rótulo solo se puede medir cuando está a la vista y con su cuerpo de letra definitivo, y cada escalón
     * lo pinta distinto. Así que:
     *   · en `row` se mide el ancho de una línea (icono + hueco + rótulo). Si cabe, ahí se queda.
     *   · si no cabe, se PASA a `stack` y se vuelve a medir en el siguiente fotograma: ahora el rótulo está
     *     apilado y con su cuerpo reducido, así que su ancho es el de verdad y no una estimación.
     *   · si tampoco cabe apilado, `icon`.
     *
     * NO PUEDE OSCILAR: la columna mide igual en los tres escalones (rejilla de fracciones iguales), así que
     * cada pasada solo puede bajar. Y termina siempre: `row` → `stack` → (`stack` | `icon`).
     *
     * EN `icon` NO SE MIDE, y no es un olvido: ahí el rótulo está fuera de la pantalla (`sr-only`) y su ancho no
     * dice nada. Se re-decide con lo último medido, que es lo que permite volver a subir de escalón al ensanchar
     * la ventana.
     */
    const measure = () => {
      const buttons = Array.from(container.querySelectorAll<HTMLElement>('.bottom-nav-btn'));
      const column = buttons[0]?.getBoundingClientRect().width ?? 0;
      // Sin medidas reales (jsdom, o la barra aún sin pintar) se deja como está: mejor el diseño completo que
      // uno recortado por unos ceros.
      if (!column) return;
      const anchoDelRotulo = () => Math.max(...buttons.map((button) => button.querySelector<HTMLElement>('span')?.scrollWidth ?? 0));

      if (layoutRef.current === 'row') {
        needsRef.current.row = Math.max(...buttons.map((button) => {
          const icon = button.querySelector<SVGElement>('.bottom-nav-icon');
          const label = button.querySelector<HTMLElement>('span');
          const gap = parseFloat(getComputedStyle(button).columnGap) || 0;
          return (icon?.getBoundingClientRect().width ?? 0) + gap + (label?.scrollWidth ?? 0) + BTN_AIR;
        }));
        if (column >= needsRef.current.row) {
          aplicar('row');
          return;
        }
        aplicar('stack'); // segunda pasada: con el rótulo ya apilado, su ancho se mide en vez de estimarse
        requestAnimationFrame(measure);
        return;
      }

      if (layoutRef.current === 'stack') {
        needsRef.current.stack = anchoDelRotulo() + BTN_AIR;
        aplicar(column >= needsRef.current.stack ? 'stack' : 'icon');
        return;
      }

      const { row, stack } = needsRef.current;
      aplicar(column >= row ? 'row' : column >= stack ? 'stack' : 'icon');
    };

    /**
     * VOLVER A MEDIRLO TODO, y esto es la otra mitad del arreglo.
     *
     * Las medidas solo se pueden tomar con el rótulo a la vista, así que cuando lo que cambia es CUÁNTO MIDE EL
     * TEXTO —la tipografía que acaba de llegar, el ajuste de mayúsculas— no basta con volver a decidir: hay que
     * volver al escalón de arriba y medir desde ahí.
     *
     * Sin esto había un pestillo de un solo sentido: si la primera medida caía con la tipografía de reserva —más
     * ancha en unos sistemas que en otros— y bajaba a `icon`, la llegada de la fuente buena ya no podía
     * rescatarla, porque en `icon` no hay rótulo que medir. El síntoma era una barra MUDA en un móvil normal, en
     * unas máquinas y no en otras. Se cazó en la integración continua, donde la fuente de reserva es más ancha.
     */
    const remeasure = () => {
      aplicar('row');
      requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('resize', measure);
    // La primera medida cae con la tipografía de RESERVA, que no mide igual que la de la app —ni igual en todos
    // los sistemas—, así que cuando llega la buena hay que medir otra vez desde arriba (`remeasure`, no
    // `measure`). `fonts` no existe en todos los entornos (jsdom), de ahí la guarda.
    document.fonts?.ready.then(remeasure).catch(() => undefined);
    // El ajuste de MAYÚSCULAS ensancha los rótulos sin que la ventana se mueva, así que el `resize` no se entera.
    // Se vuelve a `row` antes de medir porque la medida buena solo puede tomarse con el rótulo en su sitio.
    const settings = new MutationObserver(remeasure);
    settings.observe(document.documentElement, { attributes: true, attributeFilter: ['data-uppercase'] });
    return () => {
      window.removeEventListener('resize', measure);
      settings.disconnect();
    };
  }, []);

  // Pastilla deslizante: mide el botón de la sección activa y coloca `.bottom-nav-ind` tras él. En las
  // secciones que no tienen pestaña (Cuenta, Bandeja, los documentos legales) no hay botón activo aquí: la
  // pastilla se oculta (indicator = null).
  useLayoutEffect(() => {
    const container = innerRef.current;
    const active = container?.querySelector<HTMLElement>('.bottom-nav-btn.active');
    if (!container || !active) {
      setIndicator(null);
      return;
    }
    const update = () => setIndicator({ left: active.offsetLeft, width: active.offsetWidth });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [currentSection, layout]);

  /**
   * PUBLICA SU ALTURA REAL en `--bottom-nav-h`, para que lo que se apoya encima sepa cuánto tiene que subir.
   *
   * ⚑ EL FALLO QUE CIERRA: el carril de las cápsulas (aviso de logro y aviso del administrador) se levantaba una
   * cantidad FIJA de 4,6rem, que es la altura de esta barra en escritorio. Pero la barra crece: en un móvil
   * estrecho los botones pasan a `stack` —icono encima del rótulo— y con el `env(safe-area-inset-bottom)` de un
   * teléfono con gesto inferior sube todavía más. Medido en un Pixel de 390 px: la barra ocupaba 81 px y la
   * cápsula se le metía 8 px por debajo, tocándola.
   *
   * Es el mismo recurso que ya usa `ConsentBanner` con `--consent-h`, y por la misma razón: quien se aparta no
   * debe duplicar la medida de aquello de lo que se aparta.
   *
   * `ResizeObserver` y no un `resize` de ventana: la barra cambia de alto sin que la ventana cambie (al pasar de
   * `row` a `stack`, o al terminar de cargar la fuente). Donde no exista, se cae al listener.
   */
  useEffect(() => {
    const node = navRef.current;
    if (!node) return;
    const root = document.documentElement;
    const publish = () => {
      root.style.setProperty('--bottom-nav-h', `${Math.round(node.getBoundingClientRect().height)}px`);
    };
    publish();

    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(publish) : null;
    if (observer) observer.observe(node);
    else window.addEventListener('resize', publish);

    return () => {
      if (observer) observer.disconnect();
      else window.removeEventListener('resize', publish);
      // La barra no está en todas las pantallas: al irse, quien se apartaba vuelve a su valor de reserva.
      root.style.removeProperty('--bottom-nav-h');
    };
  }, [layout]);

  return (
    <nav
      ref={navRef}
      className={`bottom-nav${layout === 'stack' ? ' is-stacked' : ''}${layout === 'icon' ? ' is-icons' : ''}`}
      aria-label={UI_MESSAGES.nav.ariaLabel}
    >
      <div className="bottom-nav-inner" ref={innerRef}>
        {indicator ? (
          <span
            className="bottom-nav-ind"
            aria-hidden="true"
            style={{ transform: `translateX(${indicator.left}px)`, width: `${indicator.width}px` }}
          />
        ) : null}
        {items.map((item) => {
          // AJUSTES NO NAVEGA: despliega el menú de sus cuatro grupos. Se gobierna con `popovertarget` en vez de
          // con un `onClick` propio porque así lo resuelve el navegador, incluido el caso peliagudo —volver a
          // pulsar el botón estando abierto—: con un manejador a mano, el cierre por pulsar-fuera se adelanta al
          // clic y el menú se reabre al instante.
          const abreMenu = item.key === 'settings';
          return (
          <button
            key={item.key}
            type="button"
            className={`bottom-nav-btn ${currentSection === item.key ? 'active' : ''}`.trim()}
            aria-current={currentSection === item.key ? 'page' : undefined}
            popoverTarget={abreMenu ? SETTINGS_MENU_ID : undefined}
            // `true` y no `menu`: lo que se despliega es un `<nav>` de enlaces, no un menú ARIA con su
            // teclado de flechas. Anunciar «menú» sin dar ese teclado deja a quien lo oye pulsando flechas.
            aria-haspopup={abreMenu ? true : undefined}
            aria-expanded={abreMenu ? settingsMenuOpen : undefined}
            onClick={abreMenu ? undefined : () => onSectionChange(item.key)}
          >
            <Icon name={item.icon} className="bottom-nav-icon" />
            {/* En modo icono el nombre no se borra: se oculta A LA VISTA. Es lo único que da nombre al botón,
                así que quitarlo del DOM dejaría tres dianas mudas para un lector de pantalla. */}
            <span className={layout === 'icon' ? 'sr-only' : undefined}>{item.label}</span>
          </button>
          );
        })}
      </div>
    </nav>
  );
});
