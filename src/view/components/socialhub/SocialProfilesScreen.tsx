import React from 'react';
import { HubUserCard, HubUserCardSkeleton } from './HubUserCard';
import { HubUserSection } from './HubUserSection';
import type { SocialUiLabels } from '../../../core/constants/socialLabels';
import { HubScreen } from './HubScreen';
import { HubStatus } from './HubStatus';
import { HubBackButton } from './HubBackButton';
import { FriendshipButton } from './FriendshipButton';
import type { RelationshipState } from '../../../model/types/social';
import type { SocialDirectoryEntry } from '../../../viewmodel/useSocialViewModel';
import { shouldOfferInvite } from '../../../core/social/invite';
import { InviteLink } from '../invite/InviteLink';

/** Lo que esta pantalla necesita de una entrada del directorio: identidad, nombre, foto, rango y recencia. */
type DirectoryCard = Pick<SocialDirectoryEntry, 'id' | 'uid' | 'displayName' | 'photoURL' | 'tier' | 'lastActiveAt'>;

/** Filas visibles de entrada en cada sección (y cuántas añade cada "mostrar más"). */
const PROFILE_ROWS_PER_PAGE = 3;

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
  //
  // Los AMIGOS se ordenan aquí por último uso de la aplicación, primero quien más recientemente ha estado. El
  // directorio ya llega ordenado por ese mismo campo desde Firestore, así que casi siempre este `sort` no mueve
  // nada; existe por los dos casos en que sí: cuando falta el índice compuesto y la consulta degrada a sin orden,
  // y cuando un amigo entra por el documento de amistad en vez de por el directorio. Es el mismo criterio que usa
  // la bandeja (`buildFriendshipViews`), para que las dos pantallas no digan cosas distintas.
  const friendProfiles = filteredSocialDirectory
    .filter((entry) => relationshipWith(entry.uid) === 'friends')
    .sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0));
  const otherProfiles = filteredSocialDirectory.filter((entry) => relationshipWith(entry.uid) !== 'friends');
  // SOLO SIN BÚSQUEDA: con un filtro puesto, la lista de amigos es la de los que casan con el nombre, no la de
  // todos, y la tarjeta aparecería y desaparecería al teclear. Ver `shouldOfferInvite`.
  const offerInvite = !loadingDirectory && !profileSearch.trim() && shouldOfferInvite(friendProfiles.length);
  const invite = offerInvite ? (
    <section className="hub-invite" aria-label={SOCIAL_UI.profiles.inviteAria}>
      <h3 className="hub-invite-title">{SOCIAL_UI.profiles.inviteTitle}</h3>
      <InviteLink variant="compact" />
    </section>
  ) : null;

  const renderProfileCard = (entry: DirectoryCard) => (
    <HubUserCard
      name={entry.displayName}
      photoURL={entry.photoURL}
      tier={entry.tier}
      busy={friendshipBusyUid === entry.uid}
      onOpen={() => openProfileDetail(entry.id)}
      openAriaLabel={SOCIAL_UI.profiles.openProfileAria(entry.displayName)}
      onKeyDown={(event) => handleProfileCardKeyDown(event, entry.id)}
    >
      <FriendshipButton
        SOCIAL_UI={SOCIAL_UI}
        state={relationshipWith(entry.uid)}
        name={entry.displayName}
        busy={friendshipBusyUid === entry.uid}
        onAddOrAccept={() => onAddOrAcceptFriend(entry.uid)}
        onCancel={() => onCancelFriendRequest(entry.uid)}
      />
    </HubUserCard>
  );

  return (
    <HubScreen
      ariaLabel={SOCIAL_UI.profiles.sectionAria}
      title={SOCIAL_UI.profiles.title}
      subtitle={SOCIAL_UI.profiles.subtitle}
    >
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
            <div className="hub-user-grid" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <HubUserCardSkeleton key={i} />
              ))}
            </div>
          </div>
        ) : filteredSocialDirectory.length === 0 ? (
          <>
            <div className="fg"><p>{SOCIAL_UI.profiles.empty}</p></div>
            {invite}
          </>
        ) : (
          <>
            <HubUserSection
              title={SOCIAL_UI.profiles.friendsTitle}
              items={friendProfiles}
              keyOf={(entry) => entry.id}
              renderItem={renderProfileCard}
              emptyText={SOCIAL_UI.profiles.friendsEmpty}
              groupAriaLabel={SOCIAL_UI.profiles.sectionGroupAria}
              showMoreLabel={SOCIAL_UI.profiles.showMore}
              rowsPerPage={PROFILE_ROWS_PER_PAGE}
              resetKey={profileSearch}
            />
            <HubUserSection
              title={SOCIAL_UI.profiles.othersTitle}
              items={otherProfiles}
              keyOf={(entry) => entry.id}
              renderItem={renderProfileCard}
              emptyText={SOCIAL_UI.profiles.othersEmpty}
              groupAriaLabel={SOCIAL_UI.profiles.sectionGroupAria}
              showMoreLabel={SOCIAL_UI.profiles.showMore}
              rowsPerPage={PROFILE_ROWS_PER_PAGE}
              resetKey={profileSearch}
            />
            {/* AL FINAL, DEBAJO DE «DESCUBRIR»: primero la gente que ya está, y solo después, a quien le quede alguien
                por traer, cómo traerlo. Arriba competía con la lista que se viene a mirar. */}
            {invite}
          </>
        )}
        <HubStatus status={status} statusKind={statusKind} />
    </HubScreen>
  );
}

// Memoizada (ver nota en SocialFeedScreen): evita re-renders del directorio ante cambios de estado no relacionados.
export const SocialProfilesScreen = React.memo(SocialProfilesScreenBase);
