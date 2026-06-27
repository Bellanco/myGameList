import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { GameTable } from '../GameTable';
import { StarRating } from '../StarRating';
import { HubAvatar } from './HubAvatar';
import { TAB_IDS, type GameItem, type TabId } from '../../../model/types/game';
import type { SocialSharedGame } from '../../../model/repository/gistRepository';

// Paginación de los juegos del perfil: se muestran de 15 en 15 para evitar scroll excesivo al abrir el detalle.
const LIST_PAGE_SIZE = 15;

const TAB_LABELS: Record<TabId, string> = {
  c: 'profileListTabCompleted',
  v: 'profileListTabVisited',
  e: 'profileListTabPlaying',
  p: 'profileListTabPlanned',
};

/**
 * Texto de reseña truncado a unas líneas, con un botón suave para expandir/colapsar.
 * El botón solo aparece cuando el texto realmente desborda (medido sobre el recorte).
 */
function ReviewText({ text, moreLabel, lessLabel }: { text: string; moreLabel: string; lessLabel: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  useEffect(() => {
    // Medimos solo en estado recortado; una vez expandido, conservamos el botón ("Ver menos").
    if (expanded) return;
    const el = ref.current;
    if (!el) return;
    const check = () => setCanExpand(el.scrollHeight - el.clientHeight > 2);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [text, expanded]);

  return (
    <>
      <p ref={ref} className={`hub-feed-review-text hub-review-text ${expanded ? 'is-expanded' : ''}`.trim()}>
        {text}
      </p>
      {canExpand ? (
        <button
          type="button"
          className="hub-more-soft hub-review-more"
          aria-expanded={expanded}
          aria-label={expanded ? lessLabel : moreLabel}
          title={expanded ? lessLabel : moreLabel}
          onClick={() => setExpanded((prev) => !prev)}
        >
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} />
        </button>
      ) : null}
    </>
  );
}

/**
 * Pantalla de detalle de perfil social.
 * Presentacional, sin lógica de negocio.
 */
type SocialProfileDetail = {
  displayName: string;
  photoURL?: string;
  visibility?: {
    hiddenTabs?: TabId[];
    hideReplayable?: boolean;
    hideRetry?: boolean;
    hideGameTime?: boolean;
  };
  sharedLists?: Partial<Record<TabId, Array<GameItem | SocialSharedGame>>>;
  favorites?: string[];
};

export function SocialProfileDetailScreen({
  SOCIAL_UI,
  activeProfileDetail,
  isOwnProfile = false,
  onEditProfile,
  onBack,
  status,
  statusKind
}: {
  SOCIAL_UI: any;
  activeProfileDetail: SocialProfileDetail | null;
  isOwnProfile?: boolean;
  onEditProfile?: () => void;
  onBack: () => void;
  status: string;
  statusKind: string;
}) {
  const [activeListTab, setActiveListTab] = useState<TabId>('c');
  const [expandedByTab, setExpandedByTab] = useState<Partial<Record<TabId, number | null>>>({});
  const [visibleCount, setVisibleCount] = useState(LIST_PAGE_SIZE);
  const [showReviews, setShowReviews] = useState(false);

  // Reseñas tomadas del LISTADO de juegos del perfil (no del feed social): cada juego con texto de reseña en
  // cualquiera de sus listados. Ordenadas por fecha (_ts) de más reciente a más antigua; los perfiles ajenos
  // (index-only, sin _ts) conservan el orden del listado.
  const reviews = useMemo(() => {
    const lists = activeProfileDetail?.sharedLists || {};
    const seen = new Set<number>();
    const items: { id: number; gameName: string; rating: number; reviewText: string; ts: number }[] = [];

    TAB_IDS.forEach((tab) => {
      (lists[tab] || []).forEach((game: any) => {
        const reviewText = String(game.review || game.snippet || '').trim();
        if (!reviewText) return;
        const id = Number(game.id || 0);
        if (seen.has(id)) return;
        seen.add(id);
        items.push({
          id,
          gameName: String(game.name || ''),
          rating: Number(game.score || game.rating || 0),
          reviewText,
          ts: typeof game._ts === 'number' ? game._ts : 0,
        });
      });
    });

    return items.sort((a, b) => b.ts - a.ts);
  }, [activeProfileDetail]);

  // Al cambiar de perfil, volver siempre a la vista de perfil (no arrastrar la de reseñas).
  useEffect(() => {
    setShowReviews(false);
  }, [activeProfileDetail]);

  const visibleTabs = useMemo(() => {
    if (!activeProfileDetail?.visibility) {
      return [...TAB_IDS];
    }

    const hidden = new Set(activeProfileDetail.visibility.hiddenTabs || []);
    return TAB_IDS.filter((tab) => !hidden.has(tab));
  }, [activeProfileDetail]);

  const currentTab = visibleTabs.includes(activeListTab) ? activeListTab : visibleTabs[0] || 'c';

  const currentGames: GameItem[] = useMemo(() => {
    const sharedGames = activeProfileDetail?.sharedLists?.[currentTab] || [];
    return sharedGames.map((game: any) => ({
      id: Number(game.id || 0),
      _ts: 0,
      name: String(game.name || ''),
      platforms: Array.isArray(game.platforms) ? game.platforms : [],
      genres: Array.isArray(game.genres) ? game.genres : [],
      steamDeck: Boolean(game.steamDeck),
      // Canal público index-only: para perfiles de otros solo hay snippet/rating; para datos propios, review/score completos.
      review: String(game.review || game.snippet || ''),
      score: Number(game.score || game.rating || 0),
      strengths: Array.isArray(game.strengths) ? game.strengths : [],
      weaknesses: Array.isArray(game.weaknesses) ? game.weaknesses : [],
      reasons: Array.isArray(game.reasons) ? game.reasons : [],
      replayable: Boolean(game.replayable),
      retry: Boolean(game.retry),
      hours: typeof game.hours === 'number' ? game.hours : null,
    }));
  }, [activeProfileDetail, currentTab]);

  // Al cambiar de pestaña o de perfil, volver a la primera página (15) para no arrastrar scroll.
  useEffect(() => {
    setVisibleCount(LIST_PAGE_SIZE);
  }, [currentTab, activeProfileDetail]);

  const visibleGames = useMemo(() => currentGames.slice(0, visibleCount), [currentGames, visibleCount]);
  const hasMoreGames = currentGames.length > visibleCount;

  const favoriteGames = activeProfileDetail?.favorites || [];

  // ¿Hay algún listado público con juegos? (para perfiles ajenos suele estar vacío por privacidad E3).
  const hasSharedLists = useMemo(
    () => TAB_IDS.some((tab) => (activeProfileDetail?.sharedLists?.[tab]?.length || 0) > 0),
    [activeProfileDetail],
  );

  if (!activeProfileDetail) {
    return (
      <section className="hub-hub hub-screen" aria-label={SOCIAL_UI.feed.sectionAria}>
        <div className="hub-hub-card hub-screen-card hub-feed-card-shell">
          <header className="hub-screen-header">
            <div className="hub-hub-title-wrap">
              <Icon name="bottom-hub" className="hub-hub-icon" />
              <h2>{SOCIAL_UI.feed.profileDetailTitle}</h2>
            </div>
            <p>{SOCIAL_UI.feed.profileDetailSubtitle}</p>
          </header>
          <div className="hub-screen-actions hub-screen-actions-split" aria-label={SOCIAL_UI.feed.profileDetailActionsAria}>
            <div className="hub-screen-actions-left">
              <button className="btn btn-secondary" type="button" onClick={onBack}>
                <Icon name="arrow-back" />
                {SOCIAL_UI.feed.backToFeed}
              </button>
            </div>
          </div>
          <p>{SOCIAL_UI.feed.profileDetailMissing}</p>
          {status ? <div className={`sync-status-msg ${statusKind}`}>{status}</div> : null}
        </div>
      </section>
    );
  }
  return (
    <section className="hub-hub hub-screen" aria-label={SOCIAL_UI.feed.sectionAria}>
      <div className="hub-hub-card hub-screen-card hub-feed-card-shell">
        <header className="hub-screen-header">
          <div className="hub-hub-title-wrap">
            <Icon name="bottom-hub" className="hub-hub-icon" />
            <h2>{SOCIAL_UI.feed.profileDetailTitle}</h2>
          </div>
          <p>{SOCIAL_UI.feed.profileDetailSubtitle}</p>
        </header>
        <div className="hub-screen-actions hub-screen-actions-split" aria-label={SOCIAL_UI.feed.profileDetailActionsAria}>
          <div className="hub-screen-actions-left">
            <button className="btn btn-secondary" type="button" onClick={onBack}>
              <Icon name="arrow-back" />
              {SOCIAL_UI.feed.backToFeed}
            </button>
            {isOwnProfile && onEditProfile ? (
              <button className="btn btn-secondary btn-accent" type="button" onClick={onEditProfile}>
                <Icon name="edit" />
                {SOCIAL_UI.feed.profile}
              </button>
            ) : null}
            <button
              className={`btn btn-secondary ${showReviews ? 'is-active' : ''}`.trim()}
              type="button"
              aria-pressed={showReviews}
              onClick={() => setShowReviews((prev) => !prev)}
            >
              <Icon name={showReviews ? 'dice-d20' : 'star'} />
              {showReviews ? SOCIAL_UI.feed.reviewsBack : SOCIAL_UI.feed.reviewsButton}
            </button>
          </div>
        </div>
        <article className="hub-feed-card hub-feed-card-detail">
          <div className="hub-profile-hero">
            <HubAvatar name={activeProfileDetail.displayName} photoURL={activeProfileDetail.photoURL} sizeClass="hub-avatar-lg" />
            <h3 className="hub-profile-hero-name">{activeProfileDetail.displayName}</h3>
            <p className="hub-profile-hero-meta">{SOCIAL_UI.feed.profileFavoritesCount(favoriteGames.length)}</p>
          </div>
          {showReviews ? (
            <div className="hub-detail-metadata">
              <div className="hub-metadata-section">
                <strong>{SOCIAL_UI.feed.reviewsTitle}</strong>
                {reviews.length === 0 ? (
                  <p>{SOCIAL_UI.feed.reviewsEmptyProfile}</p>
                ) : (
                  <div className="hub-feed-activity-list hub-profile-reviews-list" role="list" aria-label={SOCIAL_UI.feed.reviewsTitle}>
                    {reviews.map((review) => {
                      const itemDate = new Date(review.ts || 0);
                      const hasValidDate = review.ts > 0 && !Number.isNaN(itemDate.getTime());
                      return (
                        <article key={review.id} className="hub-feed-card hub-feed-activity-item is-review hub-review-entry" role="listitem">
                          <header className="hub-review-entry-head">
                            {review.gameName ? <h4 className="hub-review-game">{review.gameName}</h4> : null}
                            <div className="hub-review-meta">
                              <StarRating value={Number(review.rating || 0)} />
                              {hasValidDate ? <span className="hub-review-date">{SOCIAL_UI.feed.analyzedAt(itemDate)}</span> : null}
                            </div>
                          </header>
                          {review.reviewText ? (
                            <ReviewText
                              text={review.reviewText}
                              moreLabel={SOCIAL_UI.feed.reviewExpand}
                              lessLabel={SOCIAL_UI.feed.reviewCollapse}
                            />
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
          <div className="hub-detail-metadata">
            <div className="hub-metadata-section">
              <strong>{SOCIAL_UI.feed.profileFavoritesTitle}</strong>
              {favoriteGames.length > 0 ? (
                <div className="hub-profile-fav-chips">
                  {favoriteGames.map((favorite: string, i: number) => (
                    <span key={`${favorite}-${i}`} className="hub-feed-game-chip">{favorite}</span>
                  ))}
                </div>
              ) : (
                <p>{SOCIAL_UI.feed.noFavorites}</p>
              )}
            </div>
            <div className="hub-metadata-section">
              <strong>{SOCIAL_UI.feed.profileListsTitle}</strong>
              {hasSharedLists && visibleTabs.length > 0 ? (
                <>
                  <div className="hub-feed-filters" role="tablist" aria-label={SOCIAL_UI.feed.profileListsTitle}>
                    {visibleTabs.map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        className={`hub-filter-chip ${currentTab === tab ? 'is-active' : ''}`}
                        onClick={() => setActiveListTab(tab)}
                      >
                        {SOCIAL_UI.feed[TAB_LABELS[tab]]}
                      </button>
                    ))}
                  </div>
                  <GameTable
                    games={visibleGames}
                    currentTab={currentTab}
                    expandedId={expandedByTab[currentTab] ?? null}
                    onExpandedChange={(id) => setExpandedByTab((prev) => ({ ...prev, [currentTab]: id }))}
                    onEdit={() => undefined}
                    onDelete={() => undefined}
                    onMigrate={() => undefined}
                    tabActions={[]}
                    readOnly
                    visibility={{
                      showYears: false,
                      showReplayable: !activeProfileDetail.visibility?.hideReplayable,
                      showRetry: !activeProfileDetail.visibility?.hideRetry,
                      showHours: !activeProfileDetail.visibility?.hideGameTime,
                    }}
                  />
                  {hasMoreGames ? (
                    <button
                      className="hub-more-soft hub-feed-load-more"
                      type="button"
                      aria-label={SOCIAL_UI.feed.feedLoadMore}
                      title={SOCIAL_UI.feed.feedLoadMore}
                      onClick={() => setVisibleCount((prev) => prev + LIST_PAGE_SIZE)}
                    >
                      <Icon name="chevron-down" />
                    </button>
                  ) : null}
                </>
              ) : (
                <p>{SOCIAL_UI.feed.profileListsEmpty}</p>
              )}
            </div>
          </div>
          )}
        </article>
        {status ? <div className={`sync-status-msg ${statusKind}`}>{status}</div> : null}
      </div>
    </section>
  );
}

