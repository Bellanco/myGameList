import { ReviewDetailBody } from '../ReviewDetailBody';
import { ReviewDetailHead } from '../ReviewDetailHead';
import type { SocialUiLabels } from '../../../core/constants/socialLabels';
import type { GameItem } from '../../../model/types/game';
import type { SocialActivityFeedItem } from '../../../viewmodel/useSocialViewModel';
import { HubScreen } from './HubScreen';
import { HubStatus } from './HubStatus';
import { HubBackButton } from './HubBackButton';
import { ShareReviewButton } from '../stats/ShareReviewButton';

/** Pantalla de detalle de actividad social. */
export function SocialDetailScreen({
  SOCIAL_UI,
  activeDetailEvent,
  getGameItemById,
  onOpenProfileDetail,
  onBack,
  status,
  statusKind,
  shareable = false,
  related = null,
  backLabel,
}: {
  SOCIAL_UI: SocialUiLabels;
  /**
   * Solo los campos que esta pantalla PINTA, no la entrada del feed entera: es un componente presentacional y
   * declarar de más la ataría a cambios del modelo que no le afectan (y obligaría a las pruebas a fabricar
   * objetos completos para renderizar una tarjeta).
   */
  activeDetailEvent: Pick<
    SocialActivityFeedItem,
    'gameId' | 'gameName' | 'grade' | 'photoURL' | 'profileDisplayName' | 'profileId' | 'rating' | 'snippet' | 'updatedAt'
  > | null;
  getGameItemById: (profileId: string, id: number) => GameItem | null;
  onOpenProfileDetail: (id: string) => void;
  onBack: () => void;
  status: string;
  statusKind: string;
  /**
   * ¿Es MÍA esta reseña? Entonces se ofrece compartirla con un enlace público. Lo decide el hub con la identidad
   * del viewmodel, no esta pantalla: aquí solo se pinta lo que corresponda.
   */
  shareable?: boolean;
  /**
   * Bloque de reseñas RELACIONADAS al pie del análisis. Llega montado, como `actions`, y por el mismo motivo:
   * quién puede relacionar reseñas depende de qué datos tenga a mano quien usa esta pantalla, y eso lo sabe el
   * hub —que tiene el directorio— y no un componente de presentación.
   */
  related?: React.ReactNode;
  /**
   * Rótulo del botón de volver. Por defecto, la actividad; quien haya llegado saltando desde otro análisis pasa
   * el suyo, porque vuelve ahí y no al feed.
   */
  backLabel?: string;
}) {
  if (!activeDetailEvent) {
    return (
      <HubScreen
        ariaLabel={SOCIAL_UI.feed.sectionAria}
        title={SOCIAL_UI.feed.detailTitle}
        subtitle={SOCIAL_UI.feed.detailSubtitle}
      >
          <div className="hub-screen-actions hub-screen-actions-split" aria-label={SOCIAL_UI.feed.detailActionsAria}>
            <div className="hub-screen-actions-left">
              <HubBackButton onBack={onBack} label={backLabel || SOCIAL_UI.feed.backToFeed} />
            </div>
          </div>
          <p>{SOCIAL_UI.feed.detailMissing}</p>
          <HubStatus status={status} statusKind={statusKind} />
      </HubScreen>
    );
  }
  const gameItem = getGameItemById(activeDetailEvent.profileId, activeDetailEvent.gameId);
  // Reseña COMPLETA para juegos propios (gameItem.review); para eventos ajenos cae al snippet (≤160) del evento.
  const reviewText = String((gameItem?.review ?? activeDetailEvent.snippet) || '').trim();
  const updatedAtDate = new Date(activeDetailEvent.updatedAt);
  const hasValidUpdatedAt = !Number.isNaN(updatedAtDate.getTime());
  const analyzedAtLabel = hasValidUpdatedAt
    ? SOCIAL_UI.feed.analyzedAt(updatedAtDate)
    : SOCIAL_UI.feed.analyzedRecently;
  return (
    <HubScreen
      ariaLabel={SOCIAL_UI.feed.sectionAria}
      title={SOCIAL_UI.feed.detailTitle}
      subtitle={SOCIAL_UI.feed.detailSubtitle}
    >
        <div className="hub-screen-actions hub-screen-actions-split" aria-label={SOCIAL_UI.feed.detailActionsAria}>
          <div className="hub-screen-actions-left">
            <HubBackButton onBack={onBack} label={backLabel || SOCIAL_UI.feed.backToFeed} />
          </div>
          {shareable && gameItem && reviewText ? (
            <div className="hub-screen-actions-right">
              <ShareReviewButton game={gameItem} reviewText={reviewText} />
            </div>
          ) : null}
        </div>
        <article className="hub-feed-card hub-feed-card-detail">
          {/* Aquí la firma SÍ lleva avatar y enlace: se llega desde el feed, donde lo que se sigue es a la
              persona, y su perfil está a un clic. Ver `ReviewDetailHead`. */}
          <ReviewDetailHead
            gameName={activeDetailEvent.gameName}
            author={{
              name: activeDetailEvent.profileDisplayName,
              photoURL: activeDetailEvent.photoURL,
              onOpen: () => onOpenProfileDetail(activeDetailEvent.profileId),
              openAria: SOCIAL_UI.feed.openProfileAria(activeDetailEvent.profileDisplayName),
            }}
            dateLabel={analyzedAtLabel}
            score={{ score: Number(activeDetailEvent.rating || 0), grade: activeDetailEvent.grade ?? null }}
          />
          <ReviewDetailBody
            review={reviewText}
            platforms={gameItem?.platforms}
            genres={gameItem?.genres}
            strengths={gameItem?.strengths}
            weaknesses={gameItem?.weaknesses}
          />
        </article>
        {related}
        <HubStatus status={status} statusKind={statusKind} />
    </HubScreen>
  );
}

