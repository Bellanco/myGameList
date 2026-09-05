import { ReviewDetailBody } from '../ReviewDetailBody';
import { ReviewDetailHead, type ReviewAuthor } from '../ReviewDetailHead';
import type { SocialUiLabels } from '../../../core/constants/socialLabels';
import { HubScreen } from './HubScreen';
import { HubStatus } from './HubStatus';
import { HubBackButton } from './HubBackButton';
// Ver `ProfileReviewsList`: esta pantalla la reutiliza el panel de estadísticas para TUS reseñas, y allí no se
// carga el chunk del hub.
import '../../../styles/reviews.scss';

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
 * Detalle de una reseña del perfil: nota, texto COMPLETO y metadatos (plataformas, géneros, puntos fuertes/débiles).
 * El botón de "volver" regresa a la lista de reseñas del perfil (no a la vista general del perfil).
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
   * Acciones propias de quien usa esta pantalla, a la derecha del botón de volver.
   *
   * Existe para el botón de COMPARTIR, que solo tiene sentido sobre una reseña PROPIA: esta pantalla la reutilizan
   * el hub social (donde la reseña es de otra persona y no hay nada que compartir) y el panel de estadísticas
   * (donde es tuya). En vez de meter aquí un `esMía`, cada sitio pasa lo que le corresponde.
   */
  actions?: React.ReactNode;
  /**
   * Bloque de reseñas RELACIONADAS al pie del análisis, montado por quien usa la pantalla. Existe por lo mismo
   * que `actions`: el hub social lo pasa porque tiene el directorio con el que relacionar, y el panel de
   * estadísticas —que reutiliza esta misma pantalla para TUS reseñas— no pasa nada, porque allí no hay canal
   * social del que tirar y no debe haberlo (funciona sin tenerlo montado).
   */
  related?: React.ReactNode;
}) {
  /** Fila de acciones bajo el encabezado. El encabezado en sí lo pone `HubScreen`. */
  const actionsRow = (
    <div className="hub-screen-actions hub-screen-actions-split" aria-label={SOCIAL_UI.feed.detailActionsAria}>
      <div className="hub-screen-actions-left">
        <HubBackButton onBack={onBack} label={backLabel || SOCIAL_UI.feed.reviewsBackToList} />
      </div>
      {actions ? <div className="hub-screen-actions-right">{actions}</div> : null}
    </div>
  );

  /** Props comunes de la cáscara: las dos salidas de esta pantalla pintan el mismo encabezado. */
  const shell = {
    ariaLabel: SOCIAL_UI.feed.sectionAria,
    title: SOCIAL_UI.feed.reviewDetailTitle,
    subtitle: SOCIAL_UI.feed.reviewDetailSubtitle,
    icon: 'signature' as const,
  };

  if (!review) {
    return (
      <HubScreen {...shell}>
        {actionsRow}
        <p>{SOCIAL_UI.feed.detailMissing}</p>
        <HubStatus status={status} statusKind={statusKind} />
      </HubScreen>
    );
  }

  const reviewDate = new Date(review.ts || 0);
  const hasValidDate = review.ts > 0 && !Number.isNaN(reviewDate.getTime());

  return (
    <HubScreen {...shell}>
      {actionsRow}
        <article className="hub-feed-card hub-feed-card-detail">
          <ReviewDetailHead
            gameName={review.name}
            author={author}
            dateLabel={hasValidDate ? SOCIAL_UI.feed.analyzedAt(reviewDate) : ''}
            score={{ score: review.score, grade: review.grade }}
          />
          <ReviewDetailBody
            review={review.review}
            platforms={review.platforms}
            genres={review.genres}
            strengths={review.strengths}
            weaknesses={review.weaknesses}
          />
        </article>
      {related}
      <HubStatus status={status} statusKind={statusKind} />
    </HubScreen>
  );
}
