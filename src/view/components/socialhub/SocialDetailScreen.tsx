import { ScoreDisplay } from '../ScoreDisplay';
import { NoScoreMedal } from '../NoScoreMedal';
import { resolveGrade } from '../../../core/utils/scoreScale';
import { ReviewDetailBody } from '../ReviewDetailBody';
import { HubAvatar } from './HubAvatar';
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
  shareable = false
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
              <HubBackButton onBack={onBack} label={SOCIAL_UI.feed.backToFeed} />
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
            <HubBackButton onBack={onBack} label={SOCIAL_UI.feed.backToFeed} />
          </div>
          {shareable && gameItem && reviewText ? (
            <div className="hub-screen-actions-right">
              <ShareReviewButton game={gameItem} reviewText={reviewText} />
            </div>
          ) : null}
        </div>
        <article className="hub-feed-card hub-feed-card-detail">
          <header className="hub-feed-card-head">
            <button
              className="hub-avatar-link"
              type="button"
              aria-label={SOCIAL_UI.feed.openProfileAria(activeDetailEvent.profileDisplayName)}
              title={SOCIAL_UI.feed.openProfileAria(activeDetailEvent.profileDisplayName)}
              onClick={() => onOpenProfileDetail(activeDetailEvent.profileId)}
            >
              <HubAvatar photoURL={activeDetailEvent.photoURL} />
            </button>
            <div className="hub-feed-card-head-text">
              <h3>
                <button
                  className="hub-detail-profile-link"
                  type="button"
                  aria-label={SOCIAL_UI.feed.openProfileAria(activeDetailEvent.profileDisplayName)}
                  onClick={() => onOpenProfileDetail(activeDetailEvent.profileId)}
                >
                  {activeDetailEvent.profileDisplayName}
                </button>
              </h3>
              {activeDetailEvent.gameName ? <span className="hub-feed-game-chip">{activeDetailEvent.gameName}</span> : null}
            </div>
          </header>
          <p className="hub-feed-date">{analyzedAtLabel}</p>
          {resolveGrade({ score: Number(activeDetailEvent.rating || 0), grade: activeDetailEvent.grade ?? null }) > 0
            ? <ScoreDisplay game={{ score: Number(activeDetailEvent.rating || 0), grade: activeDetailEvent.grade ?? null }} />
            : <NoScoreMedal />}
          <ReviewDetailBody
            review={reviewText}
            platforms={gameItem?.platforms}
            genres={gameItem?.genres}
            strengths={gameItem?.strengths}
            weaknesses={gameItem?.weaknesses}
          />
        </article>
        <HubStatus status={status} statusKind={statusKind} />
    </HubScreen>
  );
}

