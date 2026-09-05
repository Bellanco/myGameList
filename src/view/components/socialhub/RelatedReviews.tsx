import { memo, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { resolveGrade, reviewAccent } from '../../../core/utils/scoreScale';
import { useScoreScale } from '../../hooks/useScoreScale';
import type { SocialUiLabels } from '../../../core/constants/socialLabels';
import type { RelatedReview } from '../../../core/social/relatedReviews';
// Ver `ProfileReviewsList`: este bloque lo pinta también la pantalla pública de un enlace compartido, que se
// monta SIN el hub.
import '../../../styles/reviews.scss';

/**
 * Filas que se pintan como mucho. El ancho decide cuántas tarjetas caben en cada una, así que esto es lo que
 * acota el bloque: tres filas son tres en el móvil (una columna) y hasta quince en un monitor grande.
 */
const MAX_ROWS = 3;

/**
 * Cuántas columnas está pintando la rejilla ahora mismo.
 *
 * Se PREGUNTA al navegador en vez de calcularlo: el número de columnas sale de `repeat(auto-fill, minmax(…))`,
 * que es una cuenta que hace el motor de CSS con el ancho real del contenedor, y rehacerla en JavaScript
 * significaría duplicar en dos idiomas la hoja de estilos —incluido el `padding` del contenedor y el `gap`— para
 * que se separasen al primer retoque. `gridTemplateColumns` ya viene resuelto: «359px 359px» son dos columnas.
 *
 * Se mide en `useLayoutEffect` y no en `useEffect` para que el recorte ocurra ANTES de pintar; si no, el bloque
 * se estrena con una sola columna y da un salto al medirse.
 */
function useGridColumns(ref: React.RefObject<HTMLElement | null>): number {
  const [columns, setColumns] = useState(1);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') {
      return;
    }
    const measure = () => {
      const template = getComputedStyle(node).gridTemplateColumns;
      // En un entorno sin motor de maquetación (las pruebas) esto viene vacío o 'none': una columna, que es el
      // caso degradado correcto —se pintan todas las tarjetas— y no cero, que las escondería todas.
      const count = template && template !== 'none' ? template.split(' ').filter(Boolean).length : 1;
      setColumns(Math.max(1, count));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return columns;
}

/**
 * Reseñas relacionadas al final de una reseña abierta: por dónde seguir leyendo.
 *
 * UNA LISTA MEZCLADA, SIN DECIR POR QUÉ ESTÁ CADA UNA. Llevaron un chip con el motivo —«Mismo juego», «Otra
 * tuya»— y sobraba: la tarjeta ya enseña el título y la firma, así que el motivo se lee solo, y escribirlo era
 * repetir con una etiqueta lo que estaba dos centímetros más arriba. El orden ya hace ese trabajo.
 *
 * DENSA A PROPÓSITO. Esto es el epílogo de la pantalla y su tarea es que quepan varias opciones de un vistazo,
 * no lucirse: tarjeta compacta y el mínimo aire entre ellas. Quien quiera leer una, la abre.
 *
 * TANTAS COMO QUEPAN, EN FILAS ENTERAS. Cuántas se pintan no es un número fijo sino el que llene la rejilla: en
 * el móvil, tres; en un monitor ancho, dos filas de cinco. Y si sobran candidatas se recorta a un múltiplo de
 * las columnas, porque una última fila con una tarjeta suelta y cuatro huecos se lee como algo que falta. La
 * única fila que puede quedar a medias es la primera —cuando no hay más reseñas que ofrecer—, y ahí el hueco no
 * es un descuadre: es que no hay más.
 *
 * NO PINTA NADA SI NO HAY NADA. Un «no hay reseñas relacionadas» al final de cada reseña sería ruido en la
 * mayoría de las bibliotecas pequeñas, que es justo donde este bloque tiene menos que ofrecer.
 */
export const RelatedReviews = memo(function RelatedReviews({
  SOCIAL_UI,
  items,
  onOpen,
}: {
  SOCIAL_UI: SocialUiLabels;
  items: RelatedReview[];
  onOpen: (entry: RelatedReview) => void;
}) {
  const scoreScale = useScoreScale();
  const listRef = useRef<HTMLDivElement>(null);
  const columns = useGridColumns(listRef);

  const visible = useMemo(() => {
    // Menos candidatas que columnas: caben todas en una fila y no hay nada que recortar (el hueco sobrante no es
    // un descuadre, es que no hay más reseñas).
    if (items.length <= columns) {
      return items;
    }
    const rows = Math.min(MAX_ROWS, Math.floor(items.length / columns));
    return items.slice(0, rows * columns);
  }, [items, columns]);

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="hub-related" aria-label={SOCIAL_UI.feed.relatedTitle}>
      <h4 className="hub-related-title">{SOCIAL_UI.feed.relatedTitle}</h4>
      <div ref={listRef} className="hub-feed-activity-list hub-related-list" role="list">
        {visible.map((entry) => {
          const rating = Number(entry.rating || 0);
          // Igual que en la lista de reseñas: sin nota, medallón con interrogación y sin color de acento.
          const hasRating = rating > 0;
          const accent = reviewAccent(rating);
          // Todas las reseñas se firman con el nombre de quien las escribió, las propias incluidas: en una lista
          // donde el resto son personas con nombre, un «Tú» era la única firma que no lo parecía. Que una sea
          // tuya se dice con el color de la firma (`is-own`), no cambiándola por un pronombre.
          const author = entry.authorName;

          return (
            <article
              key={entry.key}
              className={`hub-feed-card hub-feed-activity-item is-review hub-review-entry hub-related-entry ${hasRating ? '' : 'is-noscore'}`.trim()}
              role="listitem"
              style={hasRating ? ({ '--rev-hue': String(accent.hue), '--rev-ladj': `${accent.lightnessAdjust}%` } as CSSProperties) : undefined}
            >
              {/* Toda la tarjeta es pulsable; el botón cubre la superficie y se queda con el foco y el rótulo. */}
              <button
                type="button"
                className="hub-review-open"
                aria-label={SOCIAL_UI.feed.relatedOpenAria(entry.gameName, author)}
                onClick={() => onOpen(entry)}
              />
              <span className="hub-review-medal" aria-hidden="true">
                {hasRating
                  ? (scoreScale === 'grade'
                    ? Math.round(resolveGrade({ grade: entry.grade, score: rating }))
                    : Math.round(rating))
                  : '¿?'}
              </span>
              {/* Título y firma apilados: en una columna estrecha no caben en el mismo renglón, y el nombre del
                  juego es lo que se busca, así que se queda con la línea entera. */}
              <header className="hub-review-entry-head">
                <h5 className="hub-review-game">{entry.gameName}</h5>
                {author ? (
                  <span className={`hub-related-author${entry.isOwn ? ' is-own' : ''}`}>{author}</span>
                ) : null}
              </header>
              {entry.snippet ? (
                <div className="hub-review-body">
                  <p className="hub-feed-review-text hub-review-text">{entry.snippet}</p>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
});
