import { SOCIAL_UI } from '../../core/constants/socialLabels';
import { resolveGrade, type ScoreScale, type ScoredLike } from '../../core/utils/scoreScale';
import { useScoreScale } from '../hooks/useScoreScale';
import { MetaSection } from './MetaSection';
import { NoScoreMedal } from './NoScoreMedal';
import { ScoreRing } from './ScoreRing';

/**
 * ¿La nota va en la columna de metadatos (y no bajo la fecha, en la cabecera)? El aro 0–100 y el medallón «¿?»
 * sí; las ESTRELLAS no, que son una fila de cinco y no encabezan una columna de 17rem. Lo preguntan las dos piezas
 * —la cabecera para no pintarla, el cuerpo para pintarla— y por eso es una sola regla.
 */
export function scoreInMetadata(score: ScoredLike, scale: ScoreScale): boolean {
  return resolveGrade(score) <= 0 || scale === 'grade';
}

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
 * NO incluye la cabecera (nombre del juego, autor, fecha, nota): esa es `ReviewDetailHead`, y las dos se montan
 * juntas. Estuvieron separadas porque "cada pantalla la componía distinto", que era cierto y era el problema:
 * de las cuatro copias habían salido dos órdenes distintos para lo mismo. Siguen siendo dos componentes porque
 * son dos piezas —una identifica la reseña y la otra la cuenta—, no porque la cabecera no se pueda compartir.
 */
export interface ReviewDetailBodyProps {
  /** Texto de la reseña. Vacío o ausente: no se pinta el párrafo. */
  review?: string | null;
  platforms?: string[];
  genres?: string[];
  strengths?: string[];
  weaknesses?: string[];
  /**
   * La nota de la reseña. Encabeza la columna de metadatos, encima de las plataformas: es lo primero que se busca
   * en un análisis, y entre la fecha y el texto se leía como el arranque de la reseña. Al ir DENTRO de la columna
   * la acompaña en todo: en pantalla ancha, a la derecha del texto y pegajosa al desplazar una reseña larga; en
   * el teléfono, debajo del texto, con los chips. Solo aro o «¿?» (ver `scoreInMetadata`).
   */
  score?: ScoredLike;
}

export function ReviewDetailBody({ review, platforms, genres, strengths, weaknesses, score }: ReviewDetailBodyProps) {
  const scale = useScoreScale();
  const text = String(review ?? '').trim();
  const showScore = score !== undefined && scoreInMetadata(score, scale);
  // Sin un solo chip no se pinta el contenedor. Cada `MetaSection` ya se anula sola cuando su lista está vacía,
  // pero el `div` quedaría igualmente en el árbol aportando su espaciado: un hueco debajo de una reseña que no
  // tiene metadatos. Es también lo que hacía a mano el detalle del feed, que envolvía el bloque en un ternario.
  const hasMetadata = showScore || [platforms, genres, strengths, weaknesses].some((list) => (list?.length ?? 0) > 0);

  return (
    <div className="hub-detail-body">
      {text ? <p className="hub-feed-review-text">{text}</p> : null}
      {hasMetadata ? (
        <div className="hub-detail-metadata">
          {showScore && score ? (
            <div className="hub-detail-score">
              {resolveGrade(score) > 0 ? <ScoreRing grade={resolveGrade(score)} /> : <NoScoreMedal />}
            </div>
          ) : null}
          <MetaSection label={SOCIAL_UI.feed.metadataPlatforms} items={platforms} cls="chip-plat" />
          <MetaSection label={SOCIAL_UI.feed.metadataGenres} items={genres} cls="chip-genre" />
          <MetaSection label={SOCIAL_UI.feed.metadataStrengths} items={strengths} cls="chip-pf" />
          <MetaSection label={SOCIAL_UI.feed.metadataWeaknesses} items={weaknesses} cls="chip-pd" />
        </div>
      ) : null}
    </div>
  );
}
