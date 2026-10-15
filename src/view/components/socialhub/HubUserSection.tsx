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
  gridClassName = 'hub-user-grid',
  infinite = false,
  showCount = true,
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
  /**
   * La rejilla. Por defecto la de tarjetas; «Perfiles» pasa la de renglones (`hub-person-rows`). La paginación vale
   * para las dos, porque cuenta las columnas que el CSS haya resuelto, sean del ancho que sean.
   */
  gridClassName?: string;
  /**
   * SCROLL INFINITO (15-10-2026, «Perfiles»): el botón del final hace de centinela y, al acercarse a la pantalla,
   * añade otra página él solo; sigue siendo pulsable como alternativa accesible. Es el mismo patrón del feed y de
   * las listas del perfil. Sin él, la página siguiente solo llega al pulsar «mostrar más».
   */
  infinite?: boolean;
  /**
   * ¿Se dice cuántos hay? Por defecto sí. «Descubrir» no lo lleva (15-10-2026): su lista sale de una consulta con
   * tope (los recientes), así que el número no es «cuánta gente hay» sino cuántos cupieron, y engañaba.
   */
  showCount?: boolean;
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
  const hayMas = restantes > 0;

  // El centinela del scroll infinito. Depende también de `visibles` para volver a observar tras cada página: si el
  // centinela sigue a la vista después de crecer la lista (pantalla alta, pocas filas), un observador que ya vio la
  // intersección no vuelve a avisar.
  const centinelaRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!infinite || !hayMas) return;
    const el = centinelaRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setPages((n) => n + 1);
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [infinite, hayMas, visibles]);

  // Nada que listar y nada que explicar: el bloque entero desaparece en vez de dejar un rótulo con un hueco.
  if (items.length === 0 && !emptyText) {
    return null;
  }

  return (
    <div className="fg">
      <span className="flabel">
        {title}
        {showCount ? <> <span className="hub-section-count">· {items.length}</span></> : null}
      </span>
      {items.length === 0 ? (
        <p>{emptyText}</p>
      ) : (
        <>
          <div
            ref={gridRef}
            className={gridClassName}
            aria-label={showCount ? groupAriaLabel(title, items.length) : title}
            role="group"
          >
            {items.slice(0, visibles).map((item) => (
              <React.Fragment key={keyOf(item)}>{renderItem(item)}</React.Fragment>
            ))}
          </div>
          {hayMas && infinite ? (
            // Solo la flecha, como en el feed: no hace falta pulsarlo, así que no pide atención con un rótulo.
            <button
              ref={centinelaRef}
              className="hub-more-soft hub-feed-load-more"
              type="button"
              aria-label={showMoreLabel(restantes)}
              title={showMoreLabel(restantes)}
              onClick={() => setPages((n) => n + 1)}
            >
              <Icon name="chevron-down" />
            </button>
          ) : hayMas ? (
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
