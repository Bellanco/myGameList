import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '../Icon';
import { GameTable } from '../GameTable';
import { StarRating } from '../StarRating';
import { HubAvatar } from './HubAvatar';
import { TAB_IDS, type GameItem, type TabId } from '../../../model/types/game';
import { DEFAULT_SORT, sortGames } from '../../../core/utils/sortGames';
import type { SocialSharedGame } from '../../../model/repository/gistRepository';
import { RouletteModal } from '../roulette/RouletteModal';
import { buildProfilePool, profileWeight } from '../../../core/roulette/roulette';
import { FriendshipButton } from './FriendshipButton';
import type { RelationshipState } from '../../../model/types/social';

// Paginación de los juegos del perfil: se muestran de 15 en 15 para evitar scroll excesivo al abrir el detalle.
const LIST_PAGE_SIZE = 15;

// Paginación de las reseñas: lote inicial pequeño y se amplía por scroll infinito (centinela al final) para no
// renderizar todo de golpe ni dejar un scroll interminable. El filtro reinicia el lote.
const REVIEW_PAGE_SIZE = 8;

const TAB_LABELS: Record<TabId, string> = {
  c: 'profileListTabCompleted',
  v: 'profileListTabVisited',
  e: 'profileListTabPlaying',
  p: 'profileListTabPlanned',
};

/**
 * Categorías de "Juegos" del detalle de perfil. Control segmentado con pastilla deslizante entre
 * categorías; cuando solo hay una visible (el resto están ocultas), se muestra como encabezado limpio
 * en vez de una pestaña solitaria.
 */
function GameCategoryTabs({
  tabs,
  currentTab,
  onChange,
  labelFor,
}: {
  tabs: TabId[];
  currentTab: TabId;
  onChange: (tab: TabId) => void;
  labelFor: (tab: TabId) => string;
}) {
  const segRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const active = segRef.current?.querySelector<HTMLElement>('.hub-seg-btn.is-active');
    if (!active) return;
    const update = () => setIndicator({ left: active.offsetLeft, width: active.offsetWidth });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [currentTab, tabs]);

  if (tabs.length === 0) return null;
  if (tabs.length === 1) {
    return (
      <div className="hub-games-solo">
        <span className="hub-games-solo-label">{labelFor(tabs[0])}</span>
      </div>
    );
  }

  return (
    <div className="hub-seg" role="tablist" ref={segRef}>
      {indicator ? (
        <span
          className="hub-seg-ind"
          aria-hidden="true"
          style={{ transform: `translateX(${indicator.left}px)`, width: `${indicator.width}px` }}
        />
      ) : null}
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={currentTab === tab}
          className={`hub-seg-btn ${currentTab === tab ? 'is-active' : ''}`}
          onClick={() => onChange(tab)}
        >
          {labelFor(tab)}
        </button>
      ))}
    </div>
  );
}

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
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? lessLabel : moreLabel}
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
  statusKind,
  onAddToProximos,
  hasGameInLists,
  moveGameToCurrentByName,
  friendshipState = 'none',
  friendshipBusy = false,
  onAddOrAcceptFriend,
  onCancelFriendRequest,
  onRemoveFriend,
}: {
  SOCIAL_UI: any;
  activeProfileDetail: SocialProfileDetail | null;
  isOwnProfile?: boolean;
  onEditProfile?: () => void;
  onBack: () => void;
  status: string;
  statusKind: string;
  onAddToProximos?: (game: Partial<GameItem>) => 'added' | 'duplicate' | 'invalid';
  hasGameInLists?: (name: string) => boolean;
  moveGameToCurrentByName?: (name: string) => void;
  friendshipState?: RelationshipState;
  friendshipBusy?: boolean;
  onAddOrAcceptFriend?: () => void;
  onCancelFriendRequest?: () => void;
  onRemoveFriend?: () => void;
}) {
  const [activeListTab, setActiveListTab] = useState<TabId>('c');
  const [rouletteOpen, setRouletteOpen] = useState(false);
  const [expandedByTab, setExpandedByTab] = useState<Partial<Record<TabId, number | null>>>({});
  const [visibleCount, setVisibleCount] = useState(LIST_PAGE_SIZE);
  const [showReviews, setShowReviews] = useState(false);
  const [gameQuery, setGameQuery] = useState('');
  const [reviewQuery, setReviewQuery] = useState('');
  const [reviewVisibleCount, setReviewVisibleCount] = useState(REVIEW_PAGE_SIZE);
  const reviewSentinelRef = useRef<HTMLButtonElement>(null);

  // Amistad: solo el perfil propio o el de un amigo muestra reseñas, ruleta y listados. Para no-amigos, "solo nombre
  // y foto" + CTA de "Añadir amigo"; el resto queda bloqueado con un aviso.
  const canSeeFullProfile = isOwnProfile || friendshipState === 'friends';

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

  // Ruleta (perfil social): pool = SOLO la lista de completados de este perfil.
  const roulettePool = useMemo(
    () => buildProfilePool(activeProfileDetail?.sharedLists),
    [activeProfileDetail],
  );

  // Al cambiar de perfil, volver siempre a la vista de perfil (no arrastrar la de reseñas) y limpiar filtros.
  useEffect(() => {
    setShowReviews(false);
    setReviewQuery('');
    setRouletteOpen(false);
  }, [activeProfileDetail]);

  // Filtro de reseñas por título del juego (insensible a mayúsculas), automático al escribir.
  const filteredReviews = useMemo(() => {
    const q = reviewQuery.trim().toLowerCase();
    if (!q) return reviews;
    return reviews.filter((review) => review.gameName.toLowerCase().includes(q));
  }, [reviews, reviewQuery]);

  // Reinicia la paginación de reseñas al filtrar o al (re)entrar en la vista de reseñas.
  useEffect(() => {
    setReviewVisibleCount(REVIEW_PAGE_SIZE);
  }, [reviewQuery, showReviews]);

  const visibleReviews = useMemo(
    () => filteredReviews.slice(0, reviewVisibleCount),
    [filteredReviews, reviewVisibleCount],
  );
  const hasMoreReviews = filteredReviews.length > reviewVisibleCount;

  // Scroll infinito: el botón "mostrar más" del final hace de centinela; cuando entra en viewport, amplía el lote
  // automáticamente (y se mantiene clicable como alternativa accesible). Sin más reseñas, no se observa nada.
  useEffect(() => {
    if (!showReviews || !hasMoreReviews) return;
    const el = reviewSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setReviewVisibleCount((prev) => prev + REVIEW_PAGE_SIZE);
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [showReviews, hasMoreReviews, filteredReviews]);

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
    const mapped: GameItem[] = sharedGames.map((game: any) => ({
      id: Number(game.id || 0),
      _ts: typeof game._ts === 'number' ? game._ts : 0,
      name: String(game.name || ''),
      platforms: Array.isArray(game.platforms) ? game.platforms : [],
      genres: Array.isArray(game.genres) ? game.genres : [],
      steamDeck: Boolean(game.steamDeck),
      // Canal público index-only: para perfiles de otros solo hay snippet/rating; para datos propios, review/score completos.
      review: String(game.review || game.snippet || ''),
      score: Number(game.score || game.rating || 0),
      // `years`/`listedAt` solo llegan en datos propios/hidratados (no en la proyección pública index-only),
      // pero son necesarios para ordenar igual que el listado principal (año + desempate por fecha de añadido).
      years: Array.isArray(game.years) ? game.years.map(Number).filter(Number.isFinite) : [],
      listedAt: typeof game.listedAt === 'number' ? game.listedAt : undefined,
      strengths: Array.isArray(game.strengths) ? game.strengths : [],
      weaknesses: Array.isArray(game.weaknesses) ? game.weaknesses : [],
      reasons: Array.isArray(game.reasons) ? game.reasons : [],
      replayable: Boolean(game.replayable),
      retry: Boolean(game.retry),
      hours: typeof game.hours === 'number' ? game.hours : null,
    }));
    // Misma lógica de orden que el listado principal (fuente única en core/utils/sortGames).
    return sortGames(mapped, DEFAULT_SORT[currentTab], currentTab);
  }, [activeProfileDetail, currentTab]);

  // Al cambiar de pestaña o de perfil, volver a la primera página (15) y limpiar el filtro.
  useEffect(() => {
    setVisibleCount(LIST_PAGE_SIZE);
    setGameQuery('');
  }, [currentTab, activeProfileDetail]);

  // Al escribir en el filtro, volver a la primera página.
  useEffect(() => {
    setVisibleCount(LIST_PAGE_SIZE);
  }, [gameQuery]);

  // Filtro por título (insensible a mayúsculas), automático al escribir.
  const filteredGames = useMemo(() => {
    const q = gameQuery.trim().toLowerCase();
    if (!q) return currentGames;
    return currentGames.filter((game) => game.name.toLowerCase().includes(q));
  }, [currentGames, gameQuery]);

  const visibleGames = useMemo(() => filteredGames.slice(0, visibleCount), [filteredGames, visibleCount]);
  const hasMoreGames = filteredGames.length > visibleCount;

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
            {canSeeFullProfile ? (
              <>
                <button
                  className={`btn btn-secondary ${showReviews ? 'is-active' : ''}`.trim()}
                  type="button"
                  aria-pressed={showReviews}
                  onClick={() => setShowReviews((prev) => !prev)}
                >
                  <Icon name={showReviews ? 'grav' : 'signature'} />
                  {showReviews ? SOCIAL_UI.feed.reviewsBack : SOCIAL_UI.feed.reviewsButton}
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => setRouletteOpen(true)}
                  disabled={!roulettePool.length}
                >
                  <Icon name="dice-d20" />
                  Elige tu próximo juego
                </button>
              </>
            ) : null}
          </div>
          {isOwnProfile && onEditProfile ? (
            <div className="hub-screen-actions-right">
              <button className="btn btn-secondary btn-accent" type="button" onClick={onEditProfile}>
                <Icon name="edit" />
                {SOCIAL_UI.feed.profile}
              </button>
            </div>
          ) : !isOwnProfile && onAddOrAcceptFriend ? (
            <div className="hub-screen-actions-right">
              <FriendshipButton
                SOCIAL_UI={SOCIAL_UI}
                state={friendshipState}
                name={activeProfileDetail.displayName}
                busy={friendshipBusy}
                onAddOrAccept={onAddOrAcceptFriend}
                onCancel={onCancelFriendRequest || (() => undefined)}
                onRemove={onRemoveFriend}
              />
            </div>
          ) : null}
        </div>
        <article className="hub-feed-card hub-feed-card-detail">
          <div className="hub-profile-hero">
            <HubAvatar name={activeProfileDetail.displayName} photoURL={activeProfileDetail.photoURL} sizeClass="hub-avatar-lg" />
            <h3 className="hub-profile-hero-name">{activeProfileDetail.displayName}</h3>
            {canSeeFullProfile ? (
              <p className="hub-profile-hero-meta">{SOCIAL_UI.feed.profileFavoritesCount(favoriteGames.length)}</p>
            ) : null}
          </div>
          {!canSeeFullProfile ? (
            <div className="hub-detail-metadata">
              <div className="hub-metadata-section">
                <strong>{SOCIAL_UI.feed.profileFriendsOnlyTitle}</strong>
                <p>{SOCIAL_UI.feed.profileFriendsOnly}</p>
              </div>
            </div>
          ) : showReviews ? (
            <div className="hub-detail-metadata">
              <div className="hub-metadata-section">
                <strong>{SOCIAL_UI.feed.reviewsTitle}</strong>
                {reviews.length === 0 ? (
                  <p>{SOCIAL_UI.feed.reviewsEmptyProfile}</p>
                ) : (
                  <>
                  <input
                    type="text"
                    className="input-base hub-game-filter"
                    value={reviewQuery}
                    onChange={(event) => setReviewQuery(event.target.value)}
                    placeholder={SOCIAL_UI.feed.gameFilterPlaceholder}
                    aria-label={SOCIAL_UI.feed.gameFilterPlaceholder}
                  />
                  {filteredReviews.length === 0 ? (
                    <p className="hub-game-filter-empty">{SOCIAL_UI.feed.gameFilterEmpty}</p>
                  ) : (
                  <div className="hub-feed-activity-list hub-profile-reviews-list" role="list" aria-label={SOCIAL_UI.feed.reviewsTitle}>
                    {visibleReviews.map((review) => {
                      const rating = Number(review.rating || 0);
                      // Reseña sin puntuación (p. ej. juegos de la lista de la vergüenza): medallón azul con
                      // un icono en vez del número y sin estrellas.
                      const hasRating = rating > 0;
                      const itemDate = new Date(review.ts || 0);
                      const hasValidDate = review.ts > 0 && !Number.isNaN(itemDate.getTime());
                      // Color por nota: 1=rojo, 2=amarillo; 3/4/5 bien separados en tono (lima→verde→esmeralda)
                      // y en luminosidad (3 más claro, 5 el más profundo) para distinguirlos de un vistazo.
                      const rScore = Math.max(1, Math.min(5, Math.round(rating)));
                      const reviewHue = [0, 4, 50, 82, 120, 156][rScore];
                      const reviewLAdj = [0, 0, 0, 10, 5, 0][rScore];
                      return (
                        <article
                          key={review.id}
                          className={`hub-feed-card hub-feed-activity-item is-review hub-review-entry ${hasRating ? '' : 'is-noscore'}`.trim()}
                          role="listitem"
                          style={hasRating ? ({ '--rev-hue': String(reviewHue), '--rev-ladj': `${reviewLAdj}%` } as CSSProperties) : undefined}
                        >
                          <span className="hub-review-medal" aria-hidden="true">
                            {hasRating ? Math.round(rating) : '??'}
                          </span>
                          <header className="hub-review-entry-head">
                            {review.gameName ? <h4 className="hub-review-game">{review.gameName}</h4> : null}
                            <div className="hub-review-meta">
                              {hasRating ? <StarRating value={rating} /> : null}
                              {hasValidDate ? (
                                <span className="hub-review-date">
                                  {itemDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </span>
                              ) : null}
                            </div>
                          </header>
                          {review.reviewText ? (
                            <div className="hub-review-body">
                              <ReviewText
                                text={review.reviewText}
                                moreLabel={SOCIAL_UI.feed.reviewExpand}
                                lessLabel={SOCIAL_UI.feed.reviewCollapse}
                              />
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                  )}
                  {hasMoreReviews ? (
                    <button
                      ref={reviewSentinelRef}
                      className="hub-more-soft hub-feed-load-more"
                      type="button"
                      aria-label={SOCIAL_UI.feed.feedLoadMore}
                      title={SOCIAL_UI.feed.feedLoadMore}
                      onClick={() => setReviewVisibleCount((prev) => prev + REVIEW_PAGE_SIZE)}
                    >
                      <Icon name="chevron-down" />
                    </button>
                  ) : null}
                  </>
                )}
              </div>
            </div>
          ) : (
          <div className="hub-detail-metadata">
            <div className="hub-metadata-section">
              <strong>{SOCIAL_UI.feed.profileFavoritesTitle}</strong>
              {favoriteGames.length > 0 ? (
                <div className="hub-fav-shelf">
                  {favoriteGames.map((favorite: string, i: number) => (
                    <span key={`${favorite}-${i}`} className={`hub-fav-cart hub-fav-cart--${i % 5}`} title={favorite}>
                      <span className="hub-fav-cart-top" aria-hidden="true" />
                      <span className="hub-fav-cart-title">{favorite}</span>
                    </span>
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
                  <GameCategoryTabs
                    tabs={visibleTabs}
                    currentTab={currentTab}
                    onChange={setActiveListTab}
                    labelFor={(tab) => SOCIAL_UI.feed[TAB_LABELS[tab]]}
                  />
                  <input
                    type="text"
                    className="input-base hub-game-filter"
                    value={gameQuery}
                    onChange={(event) => setGameQuery(event.target.value)}
                    placeholder={SOCIAL_UI.feed.gameFilterPlaceholder}
                    aria-label={SOCIAL_UI.feed.gameFilterPlaceholder}
                  />
                  {gameQuery.trim() && filteredGames.length === 0 ? (
                    <p className="hub-game-filter-empty">{SOCIAL_UI.feed.gameFilterEmpty}</p>
                  ) : (
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
                  )}
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

      <RouletteModal
        open={rouletteOpen}
        onClose={() => setRouletteOpen(false)}
        title="Elige tu próximo juego"
        candidates={roulettePool}
        weight={profileWeight}
        reviewAuthor={{ name: activeProfileDetail.displayName, photoURL: activeProfileDetail.photoURL }}
        action={
          onAddToProximos
            ? (game) => {
                // Si ya es tuyo (perfil propio o duplicado por nombre) → llevarlo a "En curso";
                // si no, añadirlo a tu lista de próximos.
                const owned = isOwnProfile || (hasGameInLists?.(game.name) ?? false);
                return owned
                  ? {
                      btnClass: 'btn-complete',
                      icon: 'play',
                      label: 'Pasa a "En curso"',
                      doneLabel: '✓ En curso',
                      onAct: (candidate) => moveGameToCurrentByName?.(candidate.game.name),
                    }
                  : {
                      btnClass: 'btn-accent',
                      icon: 'plus',
                      label: 'Añadir a próximos',
                      doneLabel: '✓ Añadido a próximos',
                      onAct: (candidate) => onAddToProximos(candidate.game),
                    };
              }
            : null
        }
      />
    </section>
  );
}

