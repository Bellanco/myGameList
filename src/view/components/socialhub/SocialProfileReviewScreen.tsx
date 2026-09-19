import type { SocialUiLabels } from '../../../core/constants/socialLabels';
import type { ReviewAuthor } from '../ReviewDetailHead';
import { ReviewScreen } from './ReviewScreen';

/** Reseña de un juego abierta a pantalla completa desde la lista de reseñas de un perfil. */
export type ProfileReview = {
  id: number;
  name: string;
  review: string;
  score: number;
  grade: number | null;
  platforms: string[];
  genres: string[];
  strengths: string[];
  weaknesses: string[];
  reasons: string[];
  hours: number | null;
  ts: number;
};

/**
 * La reseña tal y como vive en el LISTADO de un perfil: `/social/profiles/:profileId/game/:gameId/review`, y
 * también tus propias reseñas del panel de estadísticas, que reutilizan esta ruta con el comodín `me`.
 *
 * Es un ADAPTADOR: lo único suyo es de dónde salen los datos —las listas compartidas de ese perfil, ya
 * hidratadas— y cómo se nombra la pantalla. Lo que se pinta lo pone `ReviewScreen`, la misma vista que usa el
 * detalle del feed; allí está escrito por qué hay dos caminos y una sola pantalla.
 */
export function SocialProfileReviewScreen({
  SOCIAL_UI,
  review,
  author = null,
  onBack,
  backLabel,
  status,
  statusKind,
  actions = null,
  related = null,
  coversAllowed = false,
}: {
  SOCIAL_UI: SocialUiLabels;
  review: ProfileReview | null;
  /**
   * Quien firma. AUSENTE en el panel de estadísticas: allí todas las reseñas son tuyas, así que la firma no
   * distingue ninguna de las demás y la cabecera se queda con el nombre del juego (ver `ReviewDetailHead`).
   */
  author?: ReviewAuthor | null;
  onBack: () => void;
  /** Rótulo del botón de volver. Por defecto, la lista de reseñas; el panel de estadísticas pasa el suyo. */
  backLabel?: string;
  status: string;
  statusKind: string;
  /**
   * Botones de la derecha, bajo el encabezado. Hoy es uno: compartir la reseña con un enlace público, que solo
   * tiene sentido sobre las TUYAS —el panel de estadísticas lo pasa y el hub social no—.
   */
  actions?: React.ReactNode;
  /**
   * Bloque de reseñas RELACIONADAS al pie del análisis, montado por quien usa la pantalla. Existe por lo mismo
   * que `actions`: el hub social lo pasa porque tiene el directorio con el que relacionar, y el panel de
   * estadísticas —que reutiliza esta misma pantalla para TUS reseñas— no pasa nada, porque allí no hay canal
   * social del que tirar y no debe haberlo (funciona sin tenerlo montado).
   */
  related?: React.ReactNode;
  /** ¿Se puede pedir la carátula del juego para el fondo? Lo decide quien monta (ver `useReviewCover`). */
  coversAllowed?: boolean;
}) {
  const reviewDate = review ? new Date(review.ts || 0) : null;
  const hasValidDate = Boolean(review && review.ts > 0 && reviewDate && !Number.isNaN(reviewDate.getTime()));

  return (
    <ReviewScreen
      SOCIAL_UI={SOCIAL_UI}
      title={SOCIAL_UI.feed.reviewDetailTitle}
      subtitle={SOCIAL_UI.feed.reviewDetailSubtitle}
      icon="signature"
      content={review ? {
        gameName: review.name,
        reviewText: review.review,
        score: review.score,
        grade: review.grade,
        platforms: review.platforms,
        genres: review.genres,
        strengths: review.strengths,
        weaknesses: review.weaknesses,
      } : null}
      author={author}
      dateLabel={hasValidDate && reviewDate ? SOCIAL_UI.feed.analyzedAt(reviewDate) : ''}
      onBack={onBack}
      backLabel={backLabel || SOCIAL_UI.feed.reviewsBackToList}
      status={status}
      statusKind={statusKind}
      actions={actions}
      related={related}
      coversAllowed={coversAllowed}
      // Aquí no se espera a nadie: o la reseña está en las listas que ya tenemos, o no está.
      missingLabel={SOCIAL_UI.feed.detailMissing}
    />
  );
}
