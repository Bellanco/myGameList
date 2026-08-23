import React from 'react';
import { Icon } from '../Icon';
import { ScoreDisplay } from '../ScoreDisplay';
import { NoScoreMedal } from '../NoScoreMedal';
import { resolveGrade } from '../../../core/utils/scoreScale';
import type { SocialUiLabels } from '../../../core/constants/socialLabels';
import type {
  SocialActivityFeedItem,
  SocialFeedDayGroup,
  SocialFeedItem,
} from '../../../viewmodel/useSocialViewModel';
import { HubStatus } from './HubStatus';
import { PostBody } from './PostText';
import { HubAvatar } from './HubAvatar';
import { HubOfflineNotice } from './HubOfflineNotice';

/** Pantalla principal del feed social. */
function SocialFeedScreenBase({
  SOCIAL_UI,
  socialDisplayName,
  ownPhotoURL,
  currentSocialGistId,
  loadingDirectory,
  openProfileDetail,
  onOpenProfiles,
  onOpenOwnProfile,
  onOpenRequests,
  pendingIncomingCount,
  groupedFeedItems,
  feedItems,
  hasMoreFeed,
  showMoreFeed,
  openActivityDetail,
  openMoveReview,
  handleActivityItemKeyDown,
  composePostText,
  setComposePostText,
  publishingPost,
  handlePublishPost,
  canPublishPosts,
  postMaxLength,
  showPostCounter,
  status,
  statusKind,
  handleSignOut,
  offline,
  offlineHasCachedData
}: {
  SOCIAL_UI: SocialUiLabels;
  socialDisplayName: string;
  ownPhotoURL: string;
  currentSocialGistId: string;
  loadingDirectory: boolean;
  openProfileDetail: (id: string) => void;
  onOpenProfiles: () => void;
  onOpenOwnProfile: () => void;
  onOpenRequests: () => void;
  pendingIncomingCount: number;
  groupedFeedItems: SocialFeedDayGroup[];
  feedItems: SocialFeedItem[];
  hasMoreFeed: boolean;
  showMoreFeed: () => void;
  openActivityDetail: (entry: SocialActivityFeedItem) => void;
  /**
   * F4 — abre el análisis del autor sobre ese juego desde el nombre del juego de un movimiento. El primer
   * argumento es el `actorProfileId` de la reseña (el del gist), NO el id de la entrada del directorio.
   */
  openMoveReview: (actorProfileId: string, gameId: number) => void;
  handleActivityItemKeyDown: (event: React.KeyboardEvent<HTMLElement>, entry: SocialActivityFeedItem) => void;
  composePostText: string;
  setComposePostText: (v: string) => void;
  publishingPost: boolean;
  handlePublishPost: () => void;
  /** Rango de quien mira: bronce no publica. */
  canPublishPosts: boolean;
  postMaxLength: number;
  /** Mithril no lleva contador: no hay límite que mostrar. */
  showPostCounter: boolean;
  status: string;
  statusKind: string;
  handleSignOut: () => void;
  /** Sin conexión: se avisa arriba y el estado vacío deja de culpar a la falta de amigos. */
  offline: boolean;
  /** ¿Hay algo guardado que enseñar mientras no hay red? Decide cuál de los dos avisos toca. */
  offlineHasCachedData: boolean;
}) {
  const feedSentinelRef = React.useRef<HTMLButtonElement>(null);
  const composerRef = React.useRef<HTMLTextAreaElement>(null);

  // Autocrecimiento del compositor: parte de una línea (el tamaño del campo de antes) y se estira con el
  // contenido, tanto al saltar de línea con Enter como al desbordar por ancho. Se hace midiendo `scrollHeight`
  // con la altura reseteada; el tope lo pone el CSS (`max-height`), que a partir de ahí saca su propio scroll.
  React.useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [composePostText, canPublishPosts]);

  // Contador de la publicación: mismas bandas que el de la reseña (aviso al 90 %, error al 100 %), para que el
  // usuario reconozca el patrón sin aprenderlo dos veces.
  const postProgress = showPostCounter
    ? Math.min(100, Math.round((composePostText.length / postMaxLength) * 100))
    : 0;
  const postProgressClass = postProgress >= 100 ? 'has-error' : postProgress >= 90 ? 'has-warning' : '';
  const postLiveMessage =
    postProgress >= 100
      ? SOCIAL_UI.feed.postCharLimitReached
      : postProgress >= 90
        ? SOCIAL_UI.feed.postCharNearLimit
        : '';

  // Cuántos elementos hay pintados ahora mismo. Es lo ÚNICO que debe rearmar el observador de abajo: cuando el lote
  // crece y el centinela sigue en pantalla, hace falta una observación nueva para que vuelva a dispararse (el
  // observador no reemite si el elemento ya estaba intersecando).
  const visibleFeedCount = groupedFeedItems.reduce((total, group) => total + group.items.length, 0);

  // Scroll infinito: el botón "mostrar más" del final hace de centinela; cuando entra en viewport, amplía el lote
  // automáticamente (y se mantiene clicable como alternativa accesible). Sin más elementos, no se observa nada.
  //
  // La dependencia es el RECUENTO visible, no `groupedFeedItems`: ese array estrena identidad con cualquier cambio
  // del directorio (y el feed se recalcula a menudo), así que el observador se destruía y se recreaba en repintados
  // que no habían añadido ni un elemento.
  React.useEffect(() => {
    if (loadingDirectory || !hasMoreFeed) return;
    const el = feedSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          showMoreFeed();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadingDirectory, hasMoreFeed, showMoreFeed, visibleFeedCount]);

  return (
    <section className="hub-hub hub-screen" aria-label={SOCIAL_UI.feed.sectionAria}>
      <div className="hub-hub-card hub-screen-card hub-feed-card-shell">
        <header className="hub-screen-header hub-feed-header">
          <div className="hub-feed-header-text">
            <div className="hub-hub-title-wrap">
              <Icon name="bottom-hub" className="hub-hub-icon" />
              <h2>{SOCIAL_UI.feed.title}</h2>
            </div>
            <p>{SOCIAL_UI.feed.subtitle}</p>
          </div>
          <button
            className="hub-avatar-link hub-feed-owner-avatar"
            type="button"
            aria-label={SOCIAL_UI.feed.openOwnProfile}
            title={socialDisplayName || SOCIAL_UI.feed.openOwnProfile}
            onClick={onOpenOwnProfile}
          >
            <HubAvatar photoURL={ownPhotoURL} />
          </button>
        </header>
        <div className="hub-screen-actions hub-screen-actions-split" aria-label={SOCIAL_UI.feed.actionsAria}>
          <div className="hub-screen-actions-left">
            <button className="btn btn-secondary btn-accent" type="button" onClick={onOpenProfiles}>
              <Icon name="bottom-hub" />
              {SOCIAL_UI.feed.openProfiles}
            </button>
            <button
              className="btn btn-secondary hub-requests-btn"
              type="button"
              onClick={onOpenRequests}
              aria-label={SOCIAL_UI.feed.openRequestsAria(pendingIncomingCount)}
              title={SOCIAL_UI.feed.openRequests}
            >
              <Icon name="bell" />
              {pendingIncomingCount > 0 ? (
                <span className="hub-requests-count is-active" aria-hidden="true">
                  {pendingIncomingCount}
                </span>
              ) : null}
            </button>
          </div>
          <div className="hub-screen-actions-right">
            <button className="btn btn-danger" type="button" onClick={handleSignOut}>
              <Icon name="logout" />
              {SOCIAL_UI.feed.signOut}
            </button>
          </div>
        </div>
        {/* Encima de todo lo que depende de la red (compositor y actividad), porque explica por qué nada de eso
            se va a mover hasta que vuelva la conexión. */}
        {offline ? <HubOfflineNotice hasCachedData={offlineHasCachedData} /> : null}
        {/* Sin rango para publicar (bronce), el bloque entero desaparece: ni compositor ni título ni explicación.
            Se oculta también el `flabel` porque este `fg` solo contiene el compositor; dejarlo sería un
            encabezado presidiendo un hueco vacío. Las publicaciones ajenas se siguen leyendo en el feed. */}
        {canPublishPosts ? (
          <div className="fg">
            <span className="flabel">{SOCIAL_UI.feed.postsTitle}</span>
            <div className="hub-post-composer">
                <label className="sr-only" htmlFor="hub-post-text">{SOCIAL_UI.feed.postComposerLabel}</label>
                <textarea
                  id="hub-post-text"
                  ref={composerRef}
                  className="ftextarea hub-post-input"
                  // Arranca con la altura de una línea (como el campo de antes) y crece sola con el contenido.
                  rows={1}
                  value={composePostText}
                  placeholder={SOCIAL_UI.feed.postPlaceholder}
                  // Mithril no lleva tope: sin `maxLength`, el navegador no corta al escribir.
                  maxLength={showPostCounter ? postMaxLength : undefined}
                  onChange={(event) => setComposePostText(event.target.value.slice(0, postMaxLength))}
                  onKeyDown={(event) => {
                    // Enter ya NO publica: ahora hace lo que se espera en un campo de varias líneas, saltar de
                    // línea. Con textos de hasta 10.000 caracteres, publicar al pulsar Enter sería soltar el post
                    // a medio escribir. Se publica con el botón, o con Ctrl/⌘+Enter para quien va por teclado.
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault();
                      if (!publishingPost && composePostText.trim()) handlePublishPost();
                    }
                  }}
                />
                <button
                  className="btn btn-steam hub-post-publish"
                  type="button"
                  disabled={publishingPost || !composePostText.trim()}
                  onClick={handlePublishPost}
                  aria-label={publishingPost ? SOCIAL_UI.feed.postPublishing : SOCIAL_UI.feed.postPublish}
                  title={publishingPost ? SOCIAL_UI.feed.postPublishing : SOCIAL_UI.feed.postPublish}
                >
                  {publishingPost ? <span className="hub-spinner" aria-hidden="true" /> : <Icon name="angle-right" />}
                </button>
              </div>
              {/* Mismo patrón que el contador de la reseña (FormModal): conteo visible SIN aria-live y una región
                  viva aparte que solo lleva texto en los umbrales, para no anunciar en cada pulsación. */}
              {showPostCounter ? (
                <div className="field-footer">
                  <small className={`tag-hint ${postProgressClass}`.trim()}>
                    {SOCIAL_UI.feed.postCharCount(composePostText.length, postMaxLength)}
                  </small>
                  <span className="sr-only" role="status" aria-live="polite">
                    {postLiveMessage}
                  </span>
                </div>
              ) : null}
          </div>
        ) : null}
        <div className="fg">
          <span className="flabel">{SOCIAL_UI.feed.activityTitle}</span>
          {loadingDirectory ? (
            <div className="hub-feed-activity-list" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <article key={i} className="hub-feed-card hub-feed-activity-item hub-skeleton-card">
                  <header className="hub-feed-card-head">
                    <span className="hub-avatar hub-skeleton" />
                    <div className="hub-feed-card-head-text">
                      <span className="hub-skeleton hub-skeleton-line" style={{ width: '45%' }} />
                    </div>
                  </header>
                  <span className="hub-skeleton hub-skeleton-line" style={{ width: '30%' }} />
                  <span className="hub-skeleton hub-skeleton-line" style={{ width: '92%' }} />
                  <span className="hub-skeleton hub-skeleton-line" style={{ width: '70%' }} />
                </article>
              ))}
            </div>
          ) : null}
          {/* Vacío SIN red: no es que no tengas amigos, es que no se ha podido leer nada. Mandar a "descubrir
              perfiles" aquí sería un diagnóstico falso y además un botón que no puede funcionar. */}
          {!loadingDirectory && feedItems.length === 0 && offline ? (
            <div className="hub-feed-empty">
              <p>{SOCIAL_UI.offline.bodyEmpty}</p>
            </div>
          ) : null}
          {!loadingDirectory && feedItems.length === 0 && !offline ? (
            <div className="hub-feed-empty">
              <p>{SOCIAL_UI.feed.activityEmptyNoFriends}</p>
              <button className="btn btn-secondary btn-accent" type="button" onClick={onOpenProfiles}>
                <Icon name="bottom-hub" />
                {SOCIAL_UI.feed.discoverFriends}
              </button>
            </div>
          ) : null}
          {!loadingDirectory && feedItems.length > 0 ? (
            <div className="hub-feed-activity-list" role="list" aria-label={SOCIAL_UI.feed.activityListAria}>
              {groupedFeedItems.map((group, groupIndex) => (
                <div key={`${group.dayHeader}-${groupIndex}`} className="hub-feed-day-group">
                  <div className="hub-feed-day-header">
                    <h4>{group.dayHeader}</h4>
                  </div>
                  {group.items.map((entry) => {
                    const itemDate = new Date(entry.updatedAt || '');
                    const hasValidDate = !Number.isNaN(itemDate.getTime());
                    // El id vacío NO es propiedad: sin la guarda, dos ids desconocidos casaban entre sí y la
                    // actividad ajena se pintaba como propia.
                    const isOwnActivity = Boolean(currentSocialGistId) && entry.socialGistId === currentSocialGistId;
                    const ownershipClass = isOwnActivity ? 'is-own-activity' : 'is-external-activity';

                    if (entry.kind === 'post') {
                      return (
                        <article
                          key={entry.id}
                          className={`hub-feed-card hub-feed-activity-item is-post ${ownershipClass}`}
                          role="listitem"
                        >
                          <header className="hub-feed-card-head">
                            <button
                              className="hub-avatar-link"
                              type="button"
                              aria-label={SOCIAL_UI.feed.openProfileAria(entry.profileDisplayName || entry.authorName)}
                              onClick={() => openProfileDetail(entry.profileId)}
                            >
                              <HubAvatar photoURL={entry.photoURL} />
                            </button>
                            <div className="hub-feed-card-head-text">
                              <h3>
                                <button className="hub-name-link" type="button" onClick={() => openProfileDetail(entry.profileId)}>
                                  {entry.profileDisplayName || entry.authorName || 'Usuario'}
                                </button>
                              </h3>
                            </div>
                          </header>
                          <p className="hub-feed-date">{hasValidDate ? SOCIAL_UI.feed.postedAt(itemDate) : SOCIAL_UI.feed.analyzedRecently}</p>
                          <PostBody
                            text={entry.text}
                            sharedFilePageHint={SOCIAL_UI.feed.postSharedFileHint}
                            expandLabel={SOCIAL_UI.feed.postExpand}
                            collapseLabel={SOCIAL_UI.feed.postCollapse}
                          />
                        </article>
                      );
                    }

                    // F4 — MOVIMIENTO DE LISTA. Una línea y se acaba: quién, qué hizo, con qué juego y a qué
                    // hora. La tarjeta NO es pulsable —no hay pantalla de «movimiento» que abrir— y de ella solo
                    // llevan a algún sitio dos cosas: el autor (su perfil) y, cuando de verdad existe, el nombre
                    // del juego (el análisis de ese autor sobre él).
                    //
                    // La hora usa su propia clase y no `hub-feed-date`: varias paletas convierten esa clase en
                    // una cápsula o le cuelgan un prefijo («//», «>»), y aquí tiene que ser un dato al final del
                    // renglón. El día no se repite: lo dice la cabecera del grupo, y la fecha entera está en el
                    // `title`.
                    if (entry.kind === 'move') {
                      const nombreAutor = entry.profileDisplayName || 'Usuario';
                      const fechaCompleta = hasValidDate ? SOCIAL_UI.feed.movedAt(itemDate) : SOCIAL_UI.feed.moveRecently;
                      return (
                        <article
                          key={`${entry.socialGistId}:${entry.id}`}
                          className={`hub-feed-card hub-feed-activity-item is-move ${ownershipClass}`}
                          role="listitem"
                        >
                          <button
                            className="hub-avatar-link"
                            type="button"
                            aria-label={SOCIAL_UI.feed.openProfileAria(nombreAutor)}
                            onClick={() => openProfileDetail(entry.profileId)}
                          >
                            <HubAvatar photoURL={entry.photoURL} sizeClass="hub-avatar-xs" />
                          </button>
                          <p className="hub-feed-move-line">
                            <button
                              className="hub-name-link hub-feed-move-who"
                              type="button"
                              onClick={() => openProfileDetail(entry.profileId)}
                            >
                              {nombreAutor}
                            </button>
                            {' '}
                            <span className="hub-feed-move-verb">{SOCIAL_UI.feed.moveHeadline[entry.tab]}</span>
                            {' '}
                            {entry.reviewActorId ? (
                              <button
                                className="hub-feed-move-game"
                                type="button"
                                aria-label={SOCIAL_UI.feed.openMoveReviewAria(nombreAutor, entry.gameName)}
                                // El actor de la RESEÑA, no el id de la entrada del directorio: el detalle resuelve
                                // por `actorProfileId` y con el otro id no encontraba nada.
                                onClick={() => openMoveReview(entry.reviewActorId as string, entry.gameId)}
                              >
                                {entry.gameName}
                              </button>
                            ) : (
                              <span className="hub-feed-move-game is-plain">{entry.gameName}</span>
                            )}
                            {' '}
                            <span className="hub-feed-move-hour" title={fechaCompleta}>
                              {hasValidDate ? SOCIAL_UI.feed.movedAtHour(itemDate) : SOCIAL_UI.feed.moveRecently}
                            </span>
                          </p>
                        </article>
                      );
                    }

                    const reviewText = String(entry.snippet || '').trim();
                    const analyzedAtLabel = hasValidDate
                      ? SOCIAL_UI.feed.analyzedAt(itemDate)
                      : SOCIAL_UI.feed.analyzedRecently;
                    const cardTypeClass = entry.type === 'review' ? 'is-review' : 'is-recommendation';
                    return (
                      <article
                        key={entry.id}
                        className={`hub-feed-card hub-feed-activity-item ${cardTypeClass} ${ownershipClass}`}
                        role="listitem"
                        tabIndex={0}
                        aria-label={SOCIAL_UI.feed.openActivityAria(entry.profileDisplayName, entry.gameName)}
                        onClick={() => openActivityDetail(entry)}
                        onKeyDown={(event) => handleActivityItemKeyDown(event, entry)}
                      >
                        <header className="hub-feed-card-head">
                          <button
                            className="hub-avatar-link"
                            type="button"
                            aria-label={SOCIAL_UI.feed.openProfileAria(entry.profileDisplayName)}
                            onClick={(event) => { event.stopPropagation(); openProfileDetail(entry.profileId); }}
                          >
                            <HubAvatar photoURL={entry.photoURL} />
                          </button>
                          <div className="hub-feed-card-head-text">
                            <h3>
                              <button
                                className="hub-name-link"
                                type="button"
                                onClick={(event) => { event.stopPropagation(); openProfileDetail(entry.profileId); }}
                              >
                                {entry.profileDisplayName}
                              </button>
                            </h3>
                            {entry.gameName ? <span className="hub-feed-game-chip">{entry.gameName}</span> : null}
                          </div>
                        </header>
                        <p className="hub-feed-date">{analyzedAtLabel}</p>
                        {resolveGrade({ score: Number(entry.rating || 0), grade: entry.grade ?? null }) > 0
                          ? <ScoreDisplay game={{ score: Number(entry.rating || 0), grade: entry.grade ?? null }} />
                          : <NoScoreMedal />}
                        {reviewText ? <p className="hub-feed-review-text" title={reviewText}>{reviewText}</p> : null}
                      </article>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : null}
          {!loadingDirectory && hasMoreFeed ? (
            <button
              ref={feedSentinelRef}
              className="hub-more-soft hub-feed-load-more"
              type="button"
              aria-label={SOCIAL_UI.feed.feedLoadMore}
              title={SOCIAL_UI.feed.feedLoadMore}
              onClick={showMoreFeed}
            >
              <Icon name="chevron-down" />
            </button>
          ) : null}
        </div>
        <HubStatus status={status} statusKind={statusKind} />
      </div>
    </section>
  );
}

// Memoizada: el hub re-renderiza con cualquier cambio de estado del VM; con props estables (handlers de
// SocialHub via useCallback + valores memoizados del VM) esta pantalla evita re-renders no relacionados.
export const SocialFeedScreen = React.memo(SocialFeedScreenBase);

