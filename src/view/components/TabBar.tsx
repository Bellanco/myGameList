import { memo, useLayoutEffect, useRef, useState } from 'react';
import { TAB_TITLES, TAB_TOOLTIPS, UI_MESSAGES } from '../../core/constants/labels';
import { TAB_ICONS } from '../../core/constants/icons';
import type { TabId } from '../../model/types/game';
import { FLOATING_CONTROLS_ID } from './FloatingControls';
import { fitTabBar, type TabBarLayout } from './tabBarLayout';

interface TabBarProps {
  /** Las pestañas que se enseñan, en orden (la de deseos se puede esconder en Ajustes). */
  tabs: readonly TabId[];
  currentTab: TabId;
  tabCounts: Record<TabId, number>;
  onTabChange: (tab: TabId) => void;
}

/** Las clases de la franja y de la pastilla en cada forma (ver `tabBarLayout`), separadas por `/`. */
const LAYOUT_CLASSES: Record<TabBarLayout, string> = {
  inline: 'is-inline/',
  below: '/',
  'icons-inline': 'is-inline/is-icons',
  'tight-below': '/is-icons is-tight is-stretch',
};

export const TabBar = memo(function TabBar({ tabs, currentTab, tabCounts, onTabChange }: TabBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const copiesRef = useRef<HTMLDivElement[]>([]);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const [layout, setLayout] = useState<TabBarLayout>('below');

  /*
   * ¿CABE EN LA FILA DE LA LUPA Y EL TEMA? Se MIDE en lugar de fijar anchos de corte, por lo mismo que la barra
   * inferior: lo que pide la pastilla cambia con la letra de cada tema, con el ajuste de MAYÚSCULAS y con el cuerpo
   * de letra, y un corte a ojo no ve nada de eso.
   *
   * Lo que se mide son dos COPIAS INVISIBLES de la pastilla (`.is-measure`), una por forma, con las mismas clases
   * que la de verdad para que las pieles de cada tema les pongan su letra y su filete. Así la medida no depende de
   * la forma que esté pintada —no hay que ir bajando de escalón ni puede oscilar— y un `ResizeObserver` sobre las
   * copias se entera solo de todo lo que cambia el texto: la fuente que llega, otro tema, las mayúsculas.
   *
   * La misma pasada coloca la pastilla deslizante (`.tab-ind`) tras la pestaña activa, y la sigue por lo mismo que
   * la de la barra inferior: al cambiar de tema o al llegar la fuente la pestaña cambia de ancho sin que la ventana
   * se mueva, y la pastilla se quedaba asomando por un lado. Al cambiar de forma también la sigue: la pastilla de
   * verdad cambia de tamaño y el observador vuelve a pasar.
   */
  useLayoutEffect(() => {
    const bar = barRef.current;
    const inner = innerRef.current;
    const active = inner?.querySelector<HTMLElement>('.tab-btn.active');
    // La lupa llega en ocioso (`GlobalSearch`), y con ella el grupo de controles se ensancha: también se observa.
    const controls = document.getElementById(FLOATING_CONTROLS_ID);
    if (!bar || !inner || !active) return;
    const measure = () => {
      const box = bar.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(bar).paddingLeft) || 0;
      const edge = controls?.getBoundingClientRect();
      const controlsLeft = edge?.width ? edge.left : null;
      const [withLabels = 0, icons = 0] = copiesRef.current.map((copy) => copy.getBoundingClientRect().width);
      setLayout(fitTabBar({ left: box.left + pad, right: box.right - pad, controlsLeft, withLabels, icons }));
      setIndicator((prev) => (
        prev && prev.left === active.offsetLeft && prev.width === active.offsetWidth
          ? prev
          : { left: active.offsetLeft, width: active.offsetWidth }
      ));
      // Cuando ni apretada cabe y la pastilla se desplaza, la activa se trae al centro: podía ser la quinta y quedar
      // fuera. Se mueve SOLO la pastilla (`scrollLeft`), no la página, que es lo que haría `scrollIntoView`.
      if (inner.scrollWidth > inner.clientWidth) {
        inner.scrollLeft = active.offsetLeft - (inner.clientWidth - active.offsetWidth) / 2;
      }
    };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    [bar, inner, active, controls, ...copiesRef.current].forEach((node) => node && observer?.observe(node));
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [currentTab, tabCounts, tabs]);

  const content = (tab: TabId) => (
    <>
      <svg className="tab-icon" aria-hidden="true">
        <use href={`#icon-${TAB_ICONS[tab]}`} />
      </svg>
      <span className="tab-text-full">{TAB_TITLES[tab]}</span>
      {/* El espacio no se pinta (la pestaña es `inline-flex`), pero sin él el texto visible se leía «…completista149»
          y no estaba dentro del nombre accesible: la etiqueta tiene que formar parte del nombre (WCAG 2.5.3). */}
      {' '}
      <span className="count-badge">{tabCounts[tab]}</span>
    </>
  );
  const copy = (index: number, className: string) => (
    <div
      className={`tabs-inner is-measure ${className}`.trim()}
      ref={(node) => { if (node) copiesRef.current[index] = node; }}
      aria-hidden="true"
    >
      {tabs.map((tab) => <span key={tab} className="tab-btn">{content(tab)}</span>)}
    </div>
  );
  const [barClass, pillClass] = LAYOUT_CLASSES[layout].split('/');

  return (
    <div className={`tabs ${barClass}`.trim()} ref={barRef}>
      {/* La pastilla: el mismo cristal que la barra inferior y los botones redondos, a lo que miden sus pestañas. */}
      <div className={`tabs-inner ${pillClass}`.trim()} ref={innerRef} data-tour="tabs">
        {indicator ? (
          <span
            className="tab-ind"
            aria-hidden="true"
            style={{ transform: `translateX(${indicator.left}px)`, width: `${indicator.width}px` }}
          />
        ) : null}
        {tabs.map((tab) => (
          <button
            key={tab}
            className={`tab-btn ${currentTab === tab ? 'active' : ''}`}
            type="button"
            data-tooltip={TAB_TOOLTIPS[tab]}
            // A11y-4: nombre explícito (el título visible se oculta en estrecho y quedaba solo el contador) y
            // `aria-current` para decir qué lista se está viendo, que hasta ahora era información puramente visual
            // (la clase `.active`). Cada pestaña navega a su ruta, así que "page" es el valor que corresponde; es el
            // mismo patrón que ya usa la barra inferior.
            aria-label={UI_MESSAGES.tabAria(TAB_TITLES[tab], tabCounts[tab])}
            aria-current={currentTab === tab ? 'page' : undefined}
            onClick={() => onTabChange(tab)}
          >
            {content(tab)}
          </button>
        ))}
      </div>
      {copy(0, '')}
      {copy(1, 'is-icons')}
    </div>
  );
});
