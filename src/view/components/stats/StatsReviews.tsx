import { memo, useMemo } from 'react';
import { SOCIAL_UI, UI_MESSAGES } from '../../../core/constants/labels';
import { Icon } from '../Icon';
import { HubBackButton } from '../socialhub/HubBackButton';
import { ProfileReviewsList, type ReviewEntry } from '../socialhub/ProfileReviewsList';
import { SocialProfileReviewScreen } from '../socialhub/SocialProfileReviewScreen';
import { resolveGrade, starsFromGrade } from '../../../core/utils/scoreScale';
import { TAB_IDS, type GameItem, type TabData } from '../../../model/types/game';

const L = UI_MESSAGES.stats.reviews;

/** Tus reseñas, tomadas de las listas en memoria: cualquiera con texto, esté en la lista que esté. */
function collectReviews(games: TabData): Array<ReviewEntry & { game: GameItem }> {
  const items: Array<ReviewEntry & { game: GameItem }> = [];

  for (const tab of TAB_IDS) {
    for (const game of games[tab] || []) {
      const reviewText = String(game.review || '').trim();
      if (!reviewText || !game?.name?.trim()) continue;
      items.push({
        id: game.id,
        gameName: game.name.trim(),
        rating: starsFromGrade(resolveGrade(game)),
        grade: typeof game.grade === 'number' ? game.grade : null,
        reviewText,
        ts: Number(game._ts) || 0,
        game,
      });
    }
  }

  // De mejor a peor nota, que es como se leen en el panel; a igualdad, por nombre para que el orden sea estable.
  return items.sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0) || a.gameName.localeCompare(b.gameName, 'es'));
}

interface StatsReviewsProps {
  games: TabData;
  /** Juego cuya reseña se abre a pantalla completa; 0 = la lista. */
  gameId: number;
  onBack: () => void;
  onOpenReview: (gameId: number) => void;
  /** Volver de una reseña concreta a la lista. */
  onBackToList: () => void;
}

/**
 * TUS reseñas dentro del panel de estadísticas.
 *
 * No monta una lista nueva: reutiliza la del hub social (`ProfileReviewsList`) y su pantalla de detalle
 * (`SocialProfileReviewScreen`), que ya sabían pintar esto para el perfil de cualquiera. Lo único propio es de
 * dónde salen los datos —aquí, de tus listas en memoria, con el texto completo— y a dónde vuelve el botón de
 * atrás, que es al panel.
 *
 * Va por ruta propia y no enlazando al hub social porque tus reseñas son tuyas: enlazar allí las habría dejado
 * detrás del asistente de configuración del espacio social para quien no lo tenga montado.
 */
export const StatsReviews = memo(function StatsReviews({ games, gameId, onBack, onOpenReview, onBackToList }: StatsReviewsProps) {
  const reviews = useMemo(() => collectReviews(games), [games]);
  const open = gameId > 0 ? reviews.find((entry) => entry.id === gameId) : undefined;

  if (open) {
    const { game } = open;
    return (
      <SocialProfileReviewScreen
        SOCIAL_UI={SOCIAL_UI}
        review={{
          id: game.id,
          name: open.gameName,
          review: open.reviewText,
          score: open.rating,
          grade: open.grade,
          platforms: game.platforms || [],
          genres: game.genres || [],
          strengths: game.strengths || [],
          weaknesses: game.weaknesses || [],
          reasons: game.reasons || [],
          hours: game.hours ?? null,
          ts: open.ts,
        }}
        profileName={L.mine}
        onBack={onBackToList}
        status=""
        statusKind=""
      />
    );
  }

  return (
    <section className="hub-hub hub-screen" aria-label={L.screenTitle}>
      <div className="hub-hub-card hub-screen-card hub-feed-card-shell">
        <header className="hub-screen-header">
          <div className="hub-hub-title-wrap">
            <Icon name="signature" className="hub-hub-icon" />
            <h2>{L.screenTitle}</h2>
          </div>
          <p>{L.screenSubtitle}</p>
        </header>

        <div className="hub-screen-actions" aria-label={L.screenTitle}>
          <div className="hub-screen-actions-left">
            <HubBackButton onBack={onBack} label={L.backToStats} />
          </div>
        </div>

        <article className="hub-feed-card hub-feed-card-detail">
          <div className="hub-detail-metadata">
            <div className="hub-metadata-section">
              <strong>{SOCIAL_UI.feed.reviewsTitle}</strong>
              <ProfileReviewsList
                SOCIAL_UI={SOCIAL_UI}
                reviews={reviews}
                onOpenReview={onOpenReview}
                emptyLabel={L.screenEmpty}
              />
            </div>
          </div>
        </article>
      </div>
    </section>
  );
});
