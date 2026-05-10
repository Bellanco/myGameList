import { useMemo, useState } from 'react';
import { Icon } from '../Icon';
import { GameTable } from '../GameTable';
import type { GameItem, TabId } from '../../../model/types/game';

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
export function SocialProfileDetailScreen({
  SOCIAL_UI,
  activeProfileDetail,
  onBack,
  status,
  statusKind
}: {
  SOCIAL_UI: any;
  activeProfileDetail: any;
  onBack: () => void;
  status: string;
  statusKind: string;
}) {
  const [activeListTab, setActiveListTab] = useState<TabId>('c');
  const [expandedByTab, setExpandedByTab] = useState<Partial<Record<TabId, number | null>>>({});

  const visibleTabs = useMemo(() => {
    if (!activeProfileDetail?.visibility) {
      return ['c', 'v', 'e', 'p'] as TabId[];
    }

    const hidden = new Set(activeProfileDetail.visibility.hiddenTabs || []);
    return (['c', 'v', 'e', 'p'] as TabId[]).filter((tab) => !hidden.has(tab));
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
      review: String(game.review || ''),
      score: Number(game.score || 0),
      strengths: Array.isArray(game.strengths) ? game.strengths : [],
      weaknesses: Array.isArray(game.weaknesses) ? game.weaknesses : [],
      reasons: Array.isArray(game.reasons) ? game.reasons : [],
      replayable: Boolean(game.replayable),
      retry: Boolean(game.retry),
      hours: typeof game.hours === 'number' ? game.hours : null,
    }));
  }, [activeProfileDetail, currentTab]);

  if (!activeProfileDetail) {
    return (
      <section className="social-hub social-screen" aria-label="Social">
        <div className="social-hub-card social-screen-card social-feed-card-shell">
          <header className="social-screen-header">
            <div className="social-hub-title-wrap">
              <Icon name="bottom-hub" className="social-hub-icon" />
              <h2>{SOCIAL_UI.feed.profileDetailTitle}</h2>
            </div>
            <p>{SOCIAL_UI.feed.profileDetailSubtitle}</p>
          </header>
          <div className="social-screen-actions social-screen-actions-split" aria-label="Acciones del detalle de perfil social">
            <div className="social-screen-actions-left">
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
    <section className="social-hub social-screen" aria-label="Social">
      <div className="social-hub-card social-screen-card social-feed-card-shell">
        <header className="social-screen-header">
          <div className="social-hub-title-wrap">
            <Icon name="bottom-hub" className="social-hub-icon" />
            <h2>{SOCIAL_UI.feed.profileDetailTitle}</h2>
          </div>
          <p>{SOCIAL_UI.feed.profileDetailSubtitle}</p>
        </header>
        <div className="social-screen-actions social-screen-actions-split" aria-label="Acciones del detalle de perfil social">
          <div className="social-screen-actions-left">
            <button className="btn btn-secondary" type="button" onClick={onBack}>
              <Icon name="arrow-back" />
              {SOCIAL_UI.feed.backToFeed}
            </button>
          </div>
        </div>
        <article className="social-feed-card social-feed-card-detail">
          <header>
            <h3>{activeProfileDetail.displayName}</h3>
          </header>
          <div className="social-detail-metadata">
            <div className="social-metadata-section">
              <strong>{SOCIAL_UI.feed.profileFavoritesTitle}</strong>
              {activeProfileDetail.favorites.length > 0 ? (
                <div className="social-card-row">
                  {activeProfileDetail.favorites.map((favorite: string) => (
                    <div key={favorite} className="social-game-card is-read-only">
                      <span className="social-game-card-title">{favorite}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p>{SOCIAL_UI.feed.noFavorites}</p>
              )}
            </div>
            <div className="social-metadata-section">
              <strong>{SOCIAL_UI.feed.profileListsTitle}</strong>
              {visibleTabs.length > 0 ? (
                <>
                  <div className="social-feed-filters" role="tablist" aria-label={SOCIAL_UI.feed.profileListsTitle}>
                    {visibleTabs.map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        className={`social-filter-chip ${currentTab === tab ? 'is-active' : ''}`}
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
                      showReplayable: !Boolean(activeProfileDetail.visibility?.hideReplayable),
                      showRetry: !Boolean(activeProfileDetail.visibility?.hideRetry),
                      showHours: !Boolean(activeProfileDetail.visibility?.hideGameTime),
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
