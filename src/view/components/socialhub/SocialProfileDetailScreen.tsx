import { useMemo, useState } from 'react';
import { Icon } from '../Icon';
import { GameTable } from '../GameTable';
import { avatarInitial, avatarTone } from './avatar';
import { TAB_IDS, type GameItem, type TabId } from '../../../model/types/game';
import type { SocialSharedGame } from '../../../model/repository/gistRepository';

const TAB_LABELS: Record<TabId, string> = {
  c: 'profileListTabCompleted',
  v: 'profileListTabVisited',
  e: 'profileListTabPlaying',
  p: 'profileListTabPlanned',
};

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
  onBack,
  onRefresh,
  refreshing,
  status,
  statusKind
}: {
  SOCIAL_UI: any;
  activeProfileDetail: SocialProfileDetail | null;
  onBack: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  status: string;
  statusKind: string;
}) {
  const [activeListTab, setActiveListTab] = useState<TabId>('c');
  const [expandedByTab, setExpandedByTab] = useState<Partial<Record<TabId, number | null>>>({});

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
            {onRefresh ? (
              <button className="btn btn-secondary" type="button" disabled={refreshing} onClick={onRefresh}>
                <Icon name="refresh" />
                {refreshing ? SOCIAL_UI.feed.profileDetailRefreshing : SOCIAL_UI.feed.profileDetailRefresh}
              </button>
            ) : null}
          </div>
        </div>
        <article className="hub-feed-card hub-feed-card-detail">
          <div className="hub-profile-hero">
            {activeProfileDetail.photoURL ? (
              <img className="hub-avatar hub-avatar-lg hub-avatar-img" src={activeProfileDetail.photoURL} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className={`hub-avatar hub-avatar-lg hub-avatar--${avatarTone(activeProfileDetail.displayName)}`} aria-hidden="true">
                {avatarInitial(activeProfileDetail.displayName)}
              </span>
            )}
            <h3 className="hub-profile-hero-name">{activeProfileDetail.displayName}</h3>
            <p className="hub-profile-hero-meta">{SOCIAL_UI.feed.profileFavoritesCount(favoriteGames.length)}</p>
          </div>
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
                    games={currentGames}
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
                </>
              ) : (
                <p>{SOCIAL_UI.feed.profileListsEmpty}</p>
              )}
            </div>
          </div>
        </article>
        {status ? <div className={`sync-status-msg ${statusKind}`}>{status}</div> : null}
      </div>
    </section>
  );
}

