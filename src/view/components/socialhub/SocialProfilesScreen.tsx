import React from 'react';
import { HubPersonRow, HubPersonRowSkeleton } from './HubPersonRow';
import { HubUserSection } from './HubUserSection';
import type { SocialUiLabels } from '../../../core/constants/socialLabels';
import { HubScreen } from './HubScreen';
import { HubStatus } from './HubStatus';
import { FriendshipButton } from './FriendshipButton';
import type { RelationshipState } from '../../../model/types/social';
import type { SocialDirectoryEntry } from '../../../viewmodel/useSocialViewModel';
import { shouldOfferInvite } from '../../../core/social/invite';
import { InviteLink } from '../invite/InviteLink';
import { calendarDaysAgo, rowActivity } from '../../../core/social/directoryRow';
import { useReviewCover } from './useReviewCover';

/**
 * Lo que esta pantalla necesita de una entrada del directorio: identidad, nombre, foto, recencia y, de un amigo, sus
 * mensajes de lista y sus reseñas (de ahí sale qué ha hecho últimamente). Opcionales porque de quien no es tu amigo
 * no se lee el canal.
 */
type DirectoryCard = Pick<SocialDirectoryEntry, 'id' | 'uid' | 'displayName' | 'photoURL' | 'lastActiveAt'>
  & Partial<Pick<SocialDirectoryEntry, 'moves' | 'activity'>>;

/**
 * Filas visibles de entrada en cada sección (y cuántas añade cada página del scroll infinito). Seis y no tres desde que cada persona
 * es un renglón (14-10-2026): en el teléfono hay una sola columna, y tres filas eran tres personas, la mitad que con
 * la rejilla de tarjetas a dos columnas. En escritorio salen 18, lo mismo que antes.
 */
const PROFILE_ROWS_PER_PAGE = 6;

/**
 * DESCUBRIR, EN EL ORDEN EN QUE SE PUEDE HACER ALGO: primero quien te ha enviado una solicitud (aceptarla), luego el
 * resto (añadir) y al final las que enviaste tú, que solo esperan. Dentro de cada grupo, el orden del directorio.
 */
const DISCOVER_ORDER: Record<RelationshipState, number> = { incoming: 0, none: 1, outgoing: 2, friends: 3 };

/** La lupa genérica del buscador global («magnifying-glass», Font Awesome Free 7, CC BY 4.0), dentro del campo. */
function SearchGlass() {
  return (
    <svg className="ui-icon" viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      <path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376C296.3 401.1 253.9 416 208 416 93.1 416 0 322.9 0 208S93.1 0 208 0 416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z" />
    </svg>
  );
}

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
  statusKind,
  showLastSeen = false,
  lastCompletedByProfile = {},
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
  /**
   * ¿Se enseña la última conexión de cada persona? Solo a la administración (el claim, no el rango). El rango ya no
   * sale en esta pantalla, ni siquiera para ella (14-10-2026).
   */
  showLastSeen?: boolean;
  /**
   * El último completado de los amigos cuya biblioteca se bajó: el cuarto respaldo de su renglón (ver `rowActivity`).
   * Solo llega relleno para la administración, que es para quien se baja.
   */
  lastCompletedByProfile?: Readonly<Record<string, string>>;
}) {
  const P = SOCIAL_UI.profiles;
  // La MISMA política que las reseñas ajenas del hub: tu preferencia de carátulas y, de lo ajeno, solo lo que el
  // servidor ya tenga resuelto o quepa en la parte del cupo reservada a lo ajeno. Tamaño `medio`, el del renglón
  // del listado: bajo el velo no se distingue de la ancha y pesa la mitad.
  const coverOf = useReviewCover('solo-cache');
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
  const otherProfiles = filteredSocialDirectory
    .filter((entry) => relationshipWith(entry.uid) !== 'friends')
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (DISCOVER_ORDER[relationshipWith(a.entry.uid)] - DISCOVER_ORDER[relationshipWith(b.entry.uid)]) || a.index - b.index)
    .map(({ entry }) => entry);
  // SOLO SIN BÚSQUEDA: con un filtro puesto, la lista de amigos es la de los que casan con el nombre, no la de
  // todos, y la tarjeta aparecería y desaparecería al teclear. Ver `shouldOfferInvite`.
  const offerInvite = !loadingDirectory && !profileSearch.trim() && shouldOfferInvite(friendProfiles.length);
  const invite = offerInvite ? (
    <section className="hub-invite" aria-label={SOCIAL_UI.profiles.inviteAria}>
      <h3 className="hub-invite-title">{SOCIAL_UI.profiles.inviteTitle}</h3>
      <InviteLink variant="compact" />
    </section>
  ) : null;

  const renderProfileRow = (entry: DirectoryCard) => {
    const relation = relationshipWith(entry.uid);
    const friend = relation === 'friends';
    // QUÉ HA HECHO, solo de tus amigos: de quien no lo es se enseña el nombre y la foto, y nada más (decisión del
    // 04-10-2026, docs/plan-directorio-amigos.md). Tampoco se podría: su canal social no se lee.
    const play = friend ? rowActivity(entry.moves || [], entry.activity || [], lastCompletedByProfile[entry.id] || null) : null;
    const daysAgo = showLastSeen ? calendarDaysAgo(entry.lastActiveAt) : null;
    let status: React.ReactNode = null;
    if (relation === 'incoming') status = <span className="hub-person-row-status is-incoming">{P.incomingNote}</span>;
    else if (relation === 'outgoing') status = <span className="hub-person-row-status is-outgoing">{P.outgoingNote}</span>;
    else if (play) {
      status = (
        <span className={`hub-person-row-status is-${play.kind}`}>
          {P.activity[play.kind]} <b>{play.gameName}</b>
        </span>
      );
    }
    return (
      <HubPersonRow
        name={entry.displayName}
        photoURL={entry.photoURL}
        status={status}
        lastSeen={daysAgo === null ? undefined : P.lastSeen(daysAgo)}
        coverUrl={play ? coverOf(play.gameName, [], 'medio') : null}
        highlight={relation === 'incoming'}
        busy={friendshipBusyUid === entry.uid}
        onOpen={() => openProfileDetail(entry.id)}
        openAriaLabel={P.openProfileAria(entry.displayName)}
        onKeyDown={(event) => handleProfileCardKeyDown(event, entry.id)}
      >
        {/* EN LA SECCIÓN DE AMIGOS NO HAY ACCIÓN (09-10-2026): ni se repite «Amigos», que ya lo dice el título. Las
            demás llevan la suya, en la versión compacta del renglón. */}
        {friend ? null : (
          <FriendshipButton
            SOCIAL_UI={SOCIAL_UI}
            state={relation}
            name={entry.displayName}
            busy={friendshipBusyUid === entry.uid}
            onAddOrAccept={() => onAddOrAcceptFriend(entry.uid)}
            onCancel={() => onCancelFriendRequest(entry.uid)}
            compact
          />
        )}
      </HubPersonRow>
    );
  };

  return (
    <HubScreen
      ariaLabel={SOCIAL_UI.profiles.sectionAria}
      title={SOCIAL_UI.profiles.title}
      back={{ onBack, destination: SOCIAL_UI.profiles.back }}
    >
        {/* EL BUSCADOR, EN UNA LÍNEA (14-10-2026): la lupa dentro del campo y el rótulo solo para lectores de
            pantalla. Se fue también «N perfiles visibles», que repetía los recuentos de las dos secciones. */}
        <label className="hub-person-search">
          <span className="sr-only">{P.searchLabel}</span>
          <SearchGlass />
          <input
            type="text"
            className="finput"
            value={profileSearch}
            placeholder={P.searchPlaceholder}
            onChange={(event) => setProfileSearch(event.target.value)}
          />
        </label>

        {loadingDirectory ? (
          <div className="fg">
            <p className="sr-only">{SOCIAL_UI.profiles.loading}</p>
            <div className="hub-person-rows" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <HubPersonRowSkeleton key={i} />
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
              renderItem={renderProfileRow}
              emptyText={SOCIAL_UI.profiles.friendsEmpty}
              groupAriaLabel={SOCIAL_UI.profiles.sectionGroupAria}
              showMoreLabel={SOCIAL_UI.profiles.showMore}
              rowsPerPage={PROFILE_ROWS_PER_PAGE}
              resetKey={profileSearch}
              gridClassName="hub-person-rows"
              infinite
            />
            <HubUserSection
              title={SOCIAL_UI.profiles.othersTitle}
              items={otherProfiles}
              keyOf={(entry) => entry.id}
              renderItem={renderProfileRow}
              emptyText={SOCIAL_UI.profiles.othersEmpty}
              groupAriaLabel={SOCIAL_UI.profiles.sectionGroupAria}
              showMoreLabel={SOCIAL_UI.profiles.showMore}
              rowsPerPage={PROFILE_ROWS_PER_PAGE}
              resetKey={profileSearch}
              gridClassName="hub-person-rows"
              infinite
              showCount={false}
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
