import { memo, useLayoutEffect, useRef, useState } from 'react';
import type { IconName } from '../../core/constants/icons';
import { UI_MESSAGES } from '../../core/constants/labels';
import { Icon } from './Icon';

// 'legal' NO está en NAV_ITEMS a propósito: los documentos legales se alcanzan por enlace (aviso de cookies,
// tarjeta de cuenta, puerta del hub social), no ocupan un hueco en la barra inferior. 'admin' tampoco: es una
// ruta oculta que solo sirve al administrador (ver AdminHub) y no debe anunciarse en la interfaz de nadie.
import type { AppSection } from '../../core/constants/routes';
export type { AppSection };

interface BottomNavigationProps {
  currentSection: AppSection;
  onSectionChange: (section: AppSection) => void;
}

// Ajustes y Cuenta ya no viven aquí: son botones flotantes (ver FloatingControls). La barra inferior
// queda con las secciones "de contenido": los listados, el hub social y las estadísticas propias.
const NAV_ITEMS: Array<{ key: AppSection; label: string; icon: IconName }> = [
  { key: 'lists', label: UI_MESSAGES.nav.lists, icon: 'bottom-lists' },
  { key: 'social', label: UI_MESSAGES.nav.social, icon: 'bottom-hub' },
  { key: 'stats', label: UI_MESSAGES.nav.stats, icon: 'bottom-stats' },
];

/**
 * Aire mínimo entre el contenido de un botón y su pastilla: por debajo de esto el rótulo va pegado al borde y
 * la barra se lee apretada, aunque técnicamente «quepa».
 */
const BTN_AIR = 10;

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
export const BottomNavigation = memo(function BottomNavigation({ currentSection, onSectionChange }: BottomNavigationProps) {
  const innerRef = useRef<HTMLDivElement>(null);
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
    const measure = () => {
      const buttons = Array.from(container.querySelectorAll<HTMLElement>('.bottom-nav-btn'));
      const column = buttons[0]?.getBoundingClientRect().width ?? 0;
      // Sin medidas reales (jsdom, o la barra aún sin pintar) se deja como está: mejor el diseño completo que
      // uno recortado por unos ceros.
      if (!column) return;
      if (layoutRef.current === 'row') {
        const widths = buttons.map((button) => {
          const icon = button.querySelector<SVGElement>('.bottom-nav-icon');
          const label = button.querySelector<HTMLElement>('span');
          const gap = parseFloat(getComputedStyle(button).columnGap) || 0;
          const text = label?.scrollWidth ?? 0;
          return { row: (icon?.getBoundingClientRect().width ?? 0) + gap + text + BTN_AIR, stack: text + BTN_AIR };
        });
        needsRef.current = {
          row: Math.max(...widths.map((width) => width.row)),
          stack: Math.max(...widths.map((width) => width.stack)),
        };
      }
      const { row, stack } = needsRef.current;
      const next: NavLayout = column >= row ? 'row' : column >= stack ? 'stack' : 'icon';
      layoutRef.current = next;
      setLayout(next);
    };
    measure();
    window.addEventListener('resize', measure);
    // La primera medida cae con la tipografía de reserva, que es MÁS ESTRECHA que la de la app: sin esto, la
    // barra se quedaba en una línea creyendo que cabía y, al entrar la fuente buena, el rótulo largo pasaba a
    // rozar el borde de su pastilla. `fonts` no existe en todos los entornos (jsdom), de ahí la guarda.
    document.fonts?.ready.then(measure).catch(() => undefined);
    // El ajuste de MAYÚSCULAS ensancha los rótulos sin que la ventana se mueva, así que el `resize` no se entera.
    // Se vuelve a `row` antes de medir porque la medida buena solo puede tomarse con el rótulo en su sitio.
    const settings = new MutationObserver(() => {
      layoutRef.current = 'row';
      setLayout('row');
      requestAnimationFrame(measure);
    });
    settings.observe(document.documentElement, { attributes: true, attributeFilter: ['data-uppercase'] });
    return () => {
      window.removeEventListener('resize', measure);
      settings.disconnect();
    };
  }, []);

  // Pastilla deslizante: mide el botón de la sección activa y coloca `.bottom-nav-ind` tras él. En las
  // secciones flotantes (Ajustes/Cuenta) no hay botón activo aquí: la pastilla se oculta (indicator = null).
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

  return (
    <nav
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
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`bottom-nav-btn ${currentSection === item.key ? 'active' : ''}`.trim()}
            aria-current={currentSection === item.key ? 'page' : undefined}
            onClick={() => onSectionChange(item.key)}
          >
            <Icon name={item.icon} className="bottom-nav-icon" />
            {/* En modo icono el nombre no se borra: se oculta A LA VISTA. Es lo único que da nombre al botón,
                así que quitarlo del DOM dejaría tres dianas mudas para un lector de pantalla. */}
            <span className={layout === 'icon' ? 'sr-only' : undefined}>{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
});
