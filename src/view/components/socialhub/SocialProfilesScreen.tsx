import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { HubAvatar } from './HubAvatar';
import type { SocialUiLabels } from '../../../core/constants/labels';
import { PROFILE_TIER_LABELS, normalizeTier } from '../../../core/constants/tiers';
import { HubStatus } from './HubStatus';
import { HubBackButton } from './HubBackButton';
import { FriendshipButton } from './FriendshipButton';
import type { RelationshipState } from '../../../model/types/social';
import type { SocialDirectoryEntry } from '../../../viewmodel/useSocialViewModel';

/** Lo que esta pantalla necesita de una entrada del directorio: identidad, nombre, foto y rango. Nada más. */
type DirectoryCard = Pick<SocialDirectoryEntry, 'id' | 'uid' | 'displayName' | 'photoURL' | 'tier'>;

/**
 * Cuántas FILAS se pintan de entrada en cada sección, y cuántas añade cada "mostrar más".
 *
 * En filas y no en un número fijo de tarjetas: la rejilla tiene de 1 a 12 columnas según el ancho, así que un tope
 * fijo sería una pantalla razonable en escritorio y una pila interminable en un móvil de una columna. Con cuatro
 * filas, el primer golpe de vista ocupa lo mismo en cualquier dispositivo.
 * El precio es que en móvil cada pulsación añade solo cuatro tarjetas; se aceptó a cambio de no tener que bajar
 * dos pantallas de scroll antes de encontrar el botón.
 */
const PROFILE_ROWS_PER_PAGE = 4;

/** Pantalla de perfiles sociales (directorio), con filtro por nombre. */
function SocialProfilesScreenBase({
  SOCIAL_UI,
  profileSearch,
  setProfileSearch,
  filteredSocialDirectory,
  loadingDirectory,
  openProfileDetail,
  handleProfileCardKeyDown,
  relationshipWith,
  friendshipBusyUid,
  onAddOrAcceptFriend,
  onCancelFriendRequest,
  onBack,
  status,
  statusKind
}: {
  SOCIAL_UI: SocialUiLabels;
  profileSearch: string;
  setProfileSearch: (v: string) => void;
  filteredSocialDirectory: DirectoryCard[];
  loadingDirectory: boolean;
  openProfileDetail: (id: string) => void;
  handleProfileCardKeyDown: (event: React.KeyboardEvent<HTMLElement>, id: string) => void;
  relationshipWith: (uid: string) => RelationshipState;
  friendshipBusyUid: string;
  onAddOrAcceptFriend: (uid: string) => void;
  onCancelFriendRequest: (uid: string) => void;
  onBack: () => void;
  status: string;
  statusKind: string;
}) {
  // Dos listas: amigos y no-amigos. La relación sale de `relationshipWith`.
  const friendProfiles = filteredSocialDirectory.filter((entry) => relationshipWith(entry.uid) === 'friends');
  const otherProfiles = filteredSocialDirectory.filter((entry) => relationshipWith(entry.uid) !== 'friends');

  // CUÁNTAS COLUMNAS HAY DE VERDAD. Se lee del propio layout (`grid-template-columns` resuelto) y no se deduce de
  // un breakpoint: quien decide el número de columnas es el CSS —con `auto-fill` sobre el ancho de la TARJETA del
  // hub, no de la ventana—, y duplicar aquí esa cuenta sería una segunda fuente de verdad que se desincroniza en
  // el primer ajuste de tamaños. Solo se usa para el tamaño de página; si fallara, la consecuencia máxima es
  // paginar de 4 en 4 en vez de por filas completas.
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [columnas, setColumnas] = useState(1);
  const haySecciones = friendProfiles.length > 0 || otherProfiles.length > 0;

  useLayoutEffect(() => {
    const medir = () => {
      const el = gridRef.current;
      if (!el) return;
      const tracks = getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length;
      setColumnas((prev) => (prev === tracks ? prev : Math.max(1, tracks)));
    };

    medir();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    if (gridRef.current) observer?.observe(gridRef.current);
    window.addEventListener('resize', medir);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', medir);
    };
  }, [haySecciones]);

  const pageSize = Math.max(1, columnas) * PROFILE_ROWS_PER_PAGE;

  // Se guardan PÁGINAS y no un número de tarjetas: así, al cambiar de columnas (girar el móvil, redimensionar), lo
  // visible se recalcula solo y se mantiene en "cuatro filas" en vez de quedarse en la cuenta de otro ancho.
  const [friendPages, setFriendPages] = useState(1);
  const [otherPages, setOtherPages] = useState(1);

  // Al cambiar la búsqueda se vuelve a empezar: si venías de pulsar "mostrar más" varias veces, la siguiente
  // búsqueda arrancaría ya expandida y el filtro parecería no haber hecho nada.
  useEffect(() => {
    setFriendPages(1);
    setOtherPages(1);
  }, [profileSearch]);

  const renderProfileCard = (entry: DirectoryCard) => (
    <article
      key={entry.id}
      className="hub-feed-card hub-feed-profile-item"
      tabIndex={0}
      aria-label={SOCIAL_UI.profiles.openProfileAria(entry.displayName)}
      onClick={() => openProfileDetail(entry.id)}
      onKeyDown={(event) => handleProfileCardKeyDown(event, entry.id)}
    >
      {/* Punto de rango, esquina superior derecha. El color solo no informa a quien no lo distingue: el nombre
          del rango va en `title` y, para lectores de pantalla, en un texto oculto. */}
      <span className={`hub-tier-dot tier-${normalizeTier(entry.tier)}`} title={PROFILE_TIER_LABELS[normalizeTier(entry.tier)]}>
        <span className="sr-only">{PROFILE_TIER_LABELS[normalizeTier(entry.tier)]}</span>
      </span>
      <header className="hub-feed-card-head">
        <HubAvatar photoURL={entry.photoURL} />
        <div className="hub-feed-card-head-text">
          <h3>{entry.displayName}</h3>
        </div>
      </header>
      {/* La acción de amistad no debe abrir el detalle: se detiene la propagación del click/teclado. */}
      <div
        className="hub-card-friend-action"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        role="presentation"
      >
        <FriendshipButton
          SOCIAL_UI={SOCIAL_UI}
          state={relationshipWith(entry.uid)}
          name={entry.displayName}
          busy={friendshipBusyUid === entry.uid}
          onAddOrAccept={() => onAddOrAcceptFriend(entry.uid)}
          onCancel={() => onCancelFriendRequest(entry.uid)}
        />
      </div>
    </article>
  );

  /** Sección con su recuento, su rejilla y su "mostrar más". Las dos comparten forma; solo cambian los datos. */
  const renderSection = (
    title: string,
    perfiles: DirectoryCard[],
    vacio: string,
    pages: number,
    verMas: () => void,
  ) => {
    const visibles = pages * pageSize;
    const restantes = perfiles.length - visibles;
    return (
      <div className="fg">
        <span className="flabel">
          {title} <span className="hub-section-count">· {perfiles.length}</span>
        </span>
        {perfiles.length === 0 ? (
          <p>{vacio}</p>
        ) : (
          <>
            <div
              ref={gridRef}
              className="hub-profile-grid"
              aria-label={SOCIAL_UI.profiles.sectionGroupAria(title, perfiles.length)}
              role="group"
            >
              {perfiles.slice(0, visibles).map(renderProfileCard)}
            </div>
            {restantes > 0 ? (
              <button className="hub-more-soft hub-feed-load-more" type="button" onClick={verMas}>
                <Icon name="chevron-down" />
                <span>{SOCIAL_UI.profiles.showMore(restantes)}</span>
              </button>
            ) : null}
          </>
        )}
      </div>
    );
  };

  return (
    <section className="hub-hub hub-screen" aria-label={SOCIAL_UI.profiles.sectionAria}>
      <div className="hub-hub-card hub-screen-card hub-feed-card-shell">
        <header className="hub-screen-header">
          <div className="hub-hub-title-wrap">
            <Icon name="bottom-hub" className="hub-hub-icon" />
            <h2>{SOCIAL_UI.profiles.title}</h2>
          </div>
          <p>{SOCIAL_UI.profiles.subtitle}</p>
        </header>
        <div className="hub-screen-actions hub-screen-actions-split" aria-label={SOCIAL_UI.profiles.actionsAria}>
          <div className="hub-screen-actions-left">
            <HubBackButton onBack={onBack} label={SOCIAL_UI.profiles.back} />
          </div>
        </div>

        <div className="hub-feed-toolbar" aria-label={SOCIAL_UI.profiles.toolbarAria}>
          <label className="hub-feed-search">
            <span>{SOCIAL_UI.profiles.searchLabel}</span>
            <input
              type="text"
              className="finput"
              value={profileSearch}
              placeholder={SOCIAL_UI.profiles.searchPlaceholder}
              onChange={(event) => setProfileSearch(event.target.value)}
            />
          </label>
          <p className="hub-feed-result-count">{SOCIAL_UI.profiles.resultCount(filteredSocialDirectory.length)}</p>
        </div>

        {loadingDirectory ? (
          <div className="fg">
            <p className="sr-only">{SOCIAL_UI.profiles.loading}</p>
            <div className="hub-profile-grid" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <article key={i} className="hub-feed-card hub-feed-profile-item hub-skeleton-card">
                  <header className="hub-feed-card-head">
                    <span className="hub-avatar hub-skeleton" />
                    <div className="hub-feed-card-head-text">
                      <span className="hub-skeleton hub-skeleton-line" style={{ width: '60%' }} />
                    </div>
                  </header>
                  <span className="hub-skeleton hub-skeleton-line" style={{ width: '85%' }} />
                </article>
              ))}
            </div>
          </div>
        ) : filteredSocialDirectory.length === 0 ? (
          <div className="fg"><p>{SOCIAL_UI.profiles.empty}</p></div>
        ) : (
          <>
            {renderSection(
              SOCIAL_UI.profiles.friendsTitle,
              friendProfiles,
              SOCIAL_UI.profiles.friendsEmpty,
              friendPages,
              () => setFriendPages((n) => n + 1),
            )}
            {renderSection(
              SOCIAL_UI.profiles.othersTitle,
              otherProfiles,
              SOCIAL_UI.profiles.othersEmpty,
              otherPages,
              () => setOtherPages((n) => n + 1),
            )}
          </>
        )}
        <HubStatus status={status} statusKind={statusKind} />
      </div>
    </section>
  );
}

// Memoizada (ver nota en SocialFeedScreen): evita re-renders del directorio ante cambios de estado no relacionados.
export const SocialProfilesScreen = React.memo(SocialProfilesScreenBase);
