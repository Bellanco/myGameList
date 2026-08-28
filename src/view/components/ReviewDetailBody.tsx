import { SOCIAL_UI } from '../../core/constants/socialLabels';
import { MetaSection } from './MetaSection';

/**
 * Cuerpo del detalle de una reseña: el texto y, debajo, sus metadatos en chips.
 *
 * Existe porque estaba copiado en los CUATRO sitios que enseñan una reseña entera —la pantalla pública de un
 * enlace compartido, el detalle de una actividad del feed, la reseña de un perfil ajeno y la ficha de la
 * ruleta—, con el mismo marcado y las mismas cuatro secciones en el mismo orden. `MetaSection` ya extraía la
 * fila; faltaba el escalón de encima, que es el que se repetía.
 *
 * Los rótulos salen de `SOCIAL_UI` en los cuatro. La ruleta usaba literales sin dos puntos («Plataformas») y
 * ahora dice lo mismo que el resto: eran la única excepción de las cuatro.
 *
 * NO incluye la cabecera (nombre del juego, autor, fecha, nota): cada pantalla la compone distinto y forzarla
 * aquí habría exigido media docena de props para tapar las diferencias.
 */
export interface ReviewDetailBodyProps {
  /** Texto de la reseña. Vacío o ausente: no se pinta el párrafo. */
  review?: string | null;
  platforms?: string[];
  genres?: string[];
  strengths?: string[];
  weaknesses?: string[];
}

export function ReviewDetailBody({ review, platforms, genres, strengths, weaknesses }: ReviewDetailBodyProps) {
  const text = String(review ?? '').trim();
  // Sin un solo chip no se pinta el contenedor. Cada `MetaSection` ya se anula sola cuando su lista está vacía,
  // pero el `div` quedaría igualmente en el árbol aportando su espaciado: un hueco debajo de una reseña que no
  // tiene metadatos. Es también lo que hacía a mano el detalle del feed, que envolvía el bloque en un ternario.
  const hasMetadata = [platforms, genres, strengths, weaknesses].some((list) => (list?.length ?? 0) > 0);

  return (
    <div className="hub-detail-body">
      {text ? <p className="hub-feed-review-text">{text}</p> : null}
      {hasMetadata ? (
        <div className="hub-detail-metadata">
          <MetaSection label={SOCIAL_UI.feed.metadataPlatforms} items={platforms} cls="chip-plat" />
          <MetaSection label={SOCIAL_UI.feed.metadataGenres} items={genres} cls="chip-genre" />
          <MetaSection label={SOCIAL_UI.feed.metadataStrengths} items={strengths} cls="chip-pf" />
          <MetaSection label={SOCIAL_UI.feed.metadataWeaknesses} items={weaknesses} cls="chip-pd" />
        </div>
      ) : null}
    </div>
  );
}
