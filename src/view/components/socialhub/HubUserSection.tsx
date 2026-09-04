import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';

/**
 * Bloque de PERSONAS del hub: rótulo con su recuento, rejilla de tarjetas y "mostrar más".
 *
 * Lo comparten el directorio (Amigos / Descubrir) y la bandeja de solicitudes (Recibidas / Enviadas / Amigos),
 * que antes se pintaban de dos maneras distintas: la bandeja apilaba las tres listas enteras, sin recuento ni
 * tope, así que con unos cuantos amigos había que recorrer media pantalla para llegar al siguiente bloque.
 *
 * SE PAGINA POR FILAS, no por un número fijo de tarjetas: la rejilla tiene de 2 a 8 columnas según el ancho, así
 * que un tope fijo sería una pantalla razonable en escritorio y una pila interminable en un móvil. Con un número
 * de filas, el primer golpe de vista ocupa lo mismo en cualquier dispositivo.
 */
export function HubUserSection<T>({
  title,
  items,
  keyOf,
  renderItem,
  emptyText,
  groupAriaLabel,
  showMoreLabel,
  rowsPerPage,
  resetKey = '',
}: {
  title: string;
  items: readonly T[];
  keyOf: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  /**
   * Qué decir cuando la lista está vacía. SIN ÉL, un bloque vacío no se pinta —ni el rótulo—, que es lo que
   * quieren las peticiones: "no tienes peticiones pendientes" es una frase que solo ocupa sitio, porque no hay
   * nada que hacer con ella. Se pasa donde el vacío sí explica algo (los amigos se piden desde Perfiles).
   */
  emptyText?: string;
  groupAriaLabel: (title: string, count: number) => string;
  showMoreLabel: (remaining: number) => string;
  /** Filas visibles por página. Cada "mostrar más" añade otras tantas. */
  rowsPerPage: number;
  /** Al cambiar (p. ej. el texto de búsqueda) se vuelve a la primera página. */
  resetKey?: string;
}) {
  // CUÁNTAS COLUMNAS HAY DE VERDAD. Se lee del propio layout (`grid-template-columns` resuelto) y no se deduce de
  // un breakpoint: quien decide el número de columnas es el CSS —con `auto-fill` sobre el ancho de la TARJETA, no
  // de la ventana—, y duplicar aquí esa cuenta sería una segunda fuente de verdad que se desincroniza en el primer
  // ajuste de tamaños. Solo se usa para el tamaño de página; si fallara, la consecuencia máxima es paginar de
  // `rowsPerPage` en `rowsPerPage`.
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [columnas, setColumnas] = useState(1);
  const hayItems = items.length > 0;

  useLayoutEffect(() => {
    const medir = () => {
      const el = gridRef.current;
      if (!el) return;
      const tracks = getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length;
      setColumnas((prev) => (prev === tracks ? prev : Math.max(1, tracks)));
    };

    medir();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    if (gridRef.current) observer?.observe(gridRef.current);
    window.addEventListener('resize', medir);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', medir);
    };
  }, [hayItems]);

  // Se guardan PÁGINAS y no un número de tarjetas: así, al cambiar de columnas (girar el móvil, redimensionar), lo
  // visible se recalcula solo y se mantiene en "N filas" en vez de quedarse en la cuenta de otro ancho.
  const [pages, setPages] = useState(1);

  // Al cambiar la búsqueda se vuelve a empezar: si venías de pulsar "mostrar más" varias veces, la siguiente
  // búsqueda arrancaría ya expandida y el filtro parecería no haber hecho nada.
  useEffect(() => {
    setPages(1);
  }, [resetKey]);

  const visibles = pages * Math.max(1, columnas) * rowsPerPage;
  const restantes = items.length - visibles;

  // Nada que listar y nada que explicar: el bloque entero desaparece en vez de dejar un rótulo con un hueco.
  if (items.length === 0 && !emptyText) {
    return null;
  }

  return (
    <div className="fg">
      <span className="flabel">
        {title} <span className="hub-section-count">· {items.length}</span>
      </span>
      {items.length === 0 ? (
        <p>{emptyText}</p>
      ) : (
        <>
          <div
            ref={gridRef}
            className="hub-user-grid"
            aria-label={groupAriaLabel(title, items.length)}
            role="group"
          >
            {items.slice(0, visibles).map((item) => (
              <React.Fragment key={keyOf(item)}>{renderItem(item)}</React.Fragment>
            ))}
          </div>
          {restantes > 0 ? (
            <button className="hub-more-soft hub-feed-load-more" type="button" onClick={() => setPages((n) => n + 1)}>
              <Icon name="chevron-down" />
              <span>{showMoreLabel(restantes)}</span>
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
