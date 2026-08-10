import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import type { StatsScope } from '../../../viewmodel/useStatsViewModel';

const L = UI_MESSAGES.stats.scope;

/** Cuántos años se enseñan mientras no se ha medido nada (primer pintado y entornos sin layout, como los tests). */
const YEARS_BEFORE_MEASURE = 6;
/** Aire entre el último botón y los controles flotantes de la esquina, para que no se toquen. */
const FLOAT_CLEARANCE = 12;

interface ScopeTabsProps {
  scope: StatsScope;
  years: number[];
  onChange: (scope: StatsScope) => void;
}

/**
 * Selector de periodo: "General", los últimos años y un menú con el resto. Los años los pone el propio
 * contenido —solo aquellos en los que completaste algo—, así que nunca se ofrece una pestaña que llevaría a una
 * pantalla vacía.
 *
 * Con un botón por año, la barra crecía un año por año y acababa con desplazamiento horizontal: en pantalla
 * estrecha, los años antiguos quedaban fuera de la vista sin ninguna señal de que estuvieran ahí. Ahora la
 * barra tiene un tamaño fijo y lo que no cabe se pide expresamente. El año activo, si es de los antiguos, se
 * queda SIEMPRE visible: si no, al elegir 2014 desaparecía de la barra la única pista de dónde estás.
 *
 * Mismo patrón de conmutador que el resto de la app (`aria-pressed` sobre `.btn-toggle`) en vez de `role="tab"`:
 * unas pestañas ARIA a medias (sin navegación por flechas) se anuncian como algo que luego no cumplen.
 */
export const ScopeTabs = memo(function ScopeTabs({ scope, years, onChange }: ScopeTabsProps) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(YEARS_BEFORE_MEASURE);
  /** Anchos reales de las piezas, medidos una vez: no cambian al estrechar la ventana, solo cuántas caben. */
  const sizes = useRef<{ general: number; year: number; more: number; gap: number } | null>(null);

  /**
   * Cuántos años caben DE VERDAD en una línea. Se mide el contenedor y se descuenta lo que ocupan "General",
   * el botón de "Más años" y —si se solapan con la barra— los controles flotantes de la esquina, que están en
   * `position: fixed` y no empujan el contenido. Con esto la barra se llena en un monitor y se queda en uno o
   * dos años en un móvil, sin números mágicos por breakpoint.
   */
  useLayoutEffect(() => {
    const node = bar.current;
    if (!node || typeof ResizeObserver !== 'function') return;

    const measure = () => {
      const buttons = [...node.querySelectorAll<HTMLElement>(':scope > button')];
      if (!sizes.current && buttons.length > 1) {
        const style = getComputedStyle(node);
        sizes.current = {
          // "General" lleva un hueco propio a su derecha (se distingue del resto), y `offsetWidth` no cuenta
          // márgenes: sin sumarlo, el cálculo creería que hay más sitio para años del que hay.
          general: buttons[0].offsetWidth + (parseFloat(getComputedStyle(buttons[0]).marginInlineEnd) || 0),
          // El más ancho de los años medidos: todos son de cuatro cifras, así que basta con uno.
          year: Math.max(...buttons.slice(1).map((button) => button.offsetWidth)),
          more: node.querySelector<HTMLElement>('.scope-more-btn')?.offsetWidth || 0,
          gap: parseFloat(style.columnGap) || 6,
        };
      }

      const sizing = sizes.current;
      if (!sizing || !sizing.year) return;
      // El botón de "Más años" puede no existir en la primera medición (si entonces cabían todos): en cuanto
      // aparece se apunta su ancho, o el cálculo seguiría creyendo que no ocupa nada.
      const moreButton = node.querySelector<HTMLElement>('.scope-more-btn');
      if (moreButton) sizing.more = moreButton.offsetWidth;

      const box = node.getBoundingClientRect();
      const floats = document.querySelector('.floating-controls');
      let reserved = 0;
      if (floats) {
        const floatBox = floats.getBoundingClientRect();
        // Se descuenta solo si de verdad se cruzan en vertical: en móvil los controles están en otra franja.
        if (floatBox.width > 0 && floatBox.bottom > box.top && floatBox.top < box.bottom) {
          reserved = Math.max(0, box.right - floatBox.left + FLOAT_CLEARANCE);
        }
      }

      const available = box.width - reserved - sizing.general;
      // El botón de "Más años" solo ocupa sitio si al final sobra algún año, así que se prueban las dos ramas.
      const moreCost = sizing.more ? sizing.more + sizing.gap : 0;
      const roomFor = (extra: number) => Math.floor((available - extra) / (sizing.year + sizing.gap));
      const withoutMore = Math.max(0, roomFor(0));
      const next = withoutMore >= years.length ? years.length : Math.max(1, roomFor(moreCost));

      setFit(Math.min(next, years.length));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [years.length]);

  // El menú se cierra al elegir, al pulsar Escape y al tocar fuera: es un desplegable, no un panel pegajoso.
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const onOutside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onOutside);
    };
  }, [open]);

  const choose = useCallback((year: number) => {
    onChange(year);
    setOpen(false);
  }, [onChange]);

  if (years.length === 0) return null;

  const visible = years.slice(0, fit);
  const hidden = years.slice(fit);
  // El año elegido siempre a la vista, aunque sea antiguo: es la referencia de dónde estás.
  const pinned = typeof scope === 'number' && hidden.includes(scope) ? scope : null;
  const rest = pinned ? hidden.filter((year) => year !== pinned) : hidden;

  const yearButton = (year: number) => (
    <button
      key={year}
      type="button"
      className={`btn btn-toggle${scope === year ? ' active' : ''}`}
      aria-pressed={scope === year}
      aria-label={L.yearAria(year)}
      onClick={() => onChange(year)}
    >
      <span>{year}</span>
    </button>
  );

  return (
    <div className="scope-tabs" role="group" aria-label={L.groupAria} ref={bar}>
      <button
        type="button"
        className={`btn btn-toggle${scope === 'general' ? ' active' : ''}`}
        aria-pressed={scope === 'general'}
        onClick={() => onChange('general')}
      >
        <span>{L.general}</span>
      </button>

      {visible.map(yearButton)}
      {pinned ? yearButton(pinned) : null}

      {rest.length > 0 ? (
        <div className="scope-more" ref={menu}>
          <button
            type="button"
            className="btn btn-toggle scope-more-btn"
            aria-expanded={open}
            aria-label={L.moreAria(rest.length)}
            onClick={() => setOpen((was) => !was)}
          >
            <span>{L.more}</span>
            <span className="scope-more-count">{rest.length}</span>
          </button>

          {open ? (
            /* Rejilla y no lista: veinte años en columna obligan a desplazar el menú; en rejilla se ven todos
               de una vez y se pincha el que sea. */
            <div className="scope-more-panel" role="group" aria-label={L.more}>
              {rest.map((year) => (
                <button
                  key={year}
                  type="button"
                  className={`btn btn-toggle${scope === year ? ' active' : ''}`}
                  aria-pressed={scope === year}
                  aria-label={L.yearAria(year)}
                  onClick={() => choose(year)}
                >
                  <span>{year}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
