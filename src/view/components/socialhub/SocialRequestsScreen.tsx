import React from 'react';
import { Icon } from '../Icon';
import { HubUserCard, HubUserCardSkeleton } from './HubUserCard';
import { HubUserSection } from './HubUserSection';
import type { SocialUiLabels } from '../../../core/constants/socialLabels';
import type { ProfileTier } from '../../../core/constants/tiers';
import { HubScreen } from './HubScreen';
import { HubStatus } from './HubStatus';
import { HubBackButton } from './HubBackButton';

/**
 * Bandeja de solicitudes de amistad (recibidas / enviadas) y gestión de amigos.
 *
 * Los bloques de peticiones solo existen cuando hay peticiones: sin `emptyText`, `HubUserSection` no pinta nada.
 * Lo normal es no tener ninguna, y el estado habitual de esta pantalla no debería ser dos frases diciendo que no
 * hay nada. El bloque de AMIGOS sí conserva el suyo: ahí el vacío explica dónde se piden.
 */
type RequestView = {
  docId: string;
  otherUid: string;
  name: string;
  photo: string;
  /** Solo de quien esté en el directorio; sin él la tarjeta va sin punto de rango. */
  tier?: ProfileTier;
  /** Ficha del directorio, para poder abrir el perfil desde la sección de amigos. */
  profileId?: string;
};

/**
 * Filas por página en cada bloque. Dos y no más porque aquí hay TRES bloques apilados: con dos filas por bloque,
 * los tres caben de un vistazo y lo accionable —las peticiones recibidas— nunca queda debajo de una lista larga
 * de amigos.
 */
const REQUEST_ROWS_PER_PAGE = 2;

export function SocialRequestsScreen({
  SOCIAL_UI,
  incomingRequests,
  outgoingRequests,
  friendsList,
  loading,
  busyUid,
  onAccept,
  onReject,
  onCancel,
  onRemove,
  onOpenProfile,
  onBack,
  status,
  statusKind,
}: {
  SOCIAL_UI: SocialUiLabels;
  incomingRequests: RequestView[];
  outgoingRequests: RequestView[];
  friendsList: RequestView[];
  loading: boolean;
  busyUid: string;
  onAccept: (otherUid: string) => void;
  onReject: (otherUid: string) => void;
  onCancel: (otherUid: string) => void;
  onRemove: (otherUid: string) => void;
  /** Abrir el perfil de un AMIGO. Opcional: sin él las tarjetas de amigos son de solo lectura. */
  onOpenProfile?: (profileId: string) => void;
  onBack: () => void;
  status: string;
  statusKind: string;
}) {
  const R = SOCIAL_UI.requests;

  /**
   * Solo las tarjetas de AMIGOS abren perfil. En recibidas y enviadas todavía no hay amistad aceptada, así que
   * ni la foto se enseña (política de fotos) ni hay nada que enseñar al otro lado.
   */
  const openFriend = (friend: RequestView) =>
    onOpenProfile && friend.profileId ? () => onOpenProfile(friend.profileId as string) : undefined;

  // Enter/Espacio abren el perfil igual que el clic: la tarjeta es enfocable y tiene que responder al teclado.
  const openOnKey = (friend: RequestView) => (event: React.KeyboardEvent<HTMLElement>) => {
    const open = openFriend(friend);
    if (!open || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    open();
  };

  return (
    <HubScreen ariaLabel={R.sectionAria} title={R.title} subtitle={R.subtitle}>

        <div className="hub-screen-actions" aria-label={R.actionsAria}>
          <HubBackButton onBack={onBack} label={R.back} />
        </div>

        {loading ? (
          <div className="hub-user-grid" aria-hidden="true">
            <p className="sr-only">{R.loading}</p>
            {[0, 1, 2, 3].map((i) => (
              <HubUserCardSkeleton key={i} />
            ))}
          </div>
        ) : null}

        <HubUserSection
          title={R.incomingTitle}
          items={incomingRequests}
          keyOf={(request) => request.docId}
          groupAriaLabel={R.sectionGroupAria}
          showMoreLabel={R.showMore}
          rowsPerPage={REQUEST_ROWS_PER_PAGE}
          renderItem={(request) => (
            <HubUserCard
              name={request.name}
              photoURL={request.photo}
              tier={request.tier}
              busy={busyUid === request.otherUid}
            >
              <button
                className="btn btn-secondary btn-accent"
                type="button"
                disabled={busyUid === request.otherUid}
                aria-label={R.acceptAria(request.name)}
                title={R.acceptAria(request.name)}
                onClick={() => onAccept(request.otherUid)}
              >
                <Icon name="check" />
                <span className="btn-label">{R.accept}</span>
              </button>
              <button
                className="btn btn-danger"
                type="button"
                disabled={busyUid === request.otherUid}
                aria-label={R.rejectAria(request.name)}
                title={R.rejectAria(request.name)}
                onClick={() => onReject(request.otherUid)}
              >
                <Icon name="close" />
                <span className="btn-label">{R.reject}</span>
              </button>
            </HubUserCard>
          )}
        />

        <HubUserSection
          title={R.outgoingTitle}
          items={outgoingRequests}
          keyOf={(request) => request.docId}
          groupAriaLabel={R.sectionGroupAria}
          showMoreLabel={R.showMore}
          rowsPerPage={REQUEST_ROWS_PER_PAGE}
          renderItem={(request) => (
            <HubUserCard
              name={request.name}
              photoURL={request.photo}
              tier={request.tier}
              busy={busyUid === request.otherUid}
            >
              <button
                className="btn btn-secondary"
                type="button"
                disabled={busyUid === request.otherUid}
                aria-label={R.cancelAria(request.name)}
                title={R.cancelAria(request.name)}
                onClick={() => onCancel(request.otherUid)}
              >
                <Icon name="close" />
                <span className="btn-label">{R.cancel}</span>
              </button>
            </HubUserCard>
          )}
        />

        <HubUserSection
          title={R.friendsTitle}
          items={friendsList}
          keyOf={(friend) => friend.docId}
          emptyText={R.friendsEmpty}
          groupAriaLabel={R.sectionGroupAria}
          showMoreLabel={R.showMore}
          rowsPerPage={REQUEST_ROWS_PER_PAGE}
          renderItem={(friend) => (
            <HubUserCard
              name={friend.name}
              photoURL={friend.photo}
              tier={friend.tier}
              busy={busyUid === friend.otherUid}
              onOpen={openFriend(friend)}
              openAriaLabel={R.openFriendAria(friend.name)}
              onKeyDown={openOnKey(friend)}
            >
              <button
                className="btn btn-danger"
                type="button"
                disabled={busyUid === friend.otherUid}
                aria-label={R.removeAria(friend.name)}
                title={R.removeAria(friend.name)}
                onClick={() => onRemove(friend.otherUid)}
              >
                <Icon name="close" />
                <span className="btn-label">{R.remove}</span>
              </button>
            </HubUserCard>
          )}
        />

        <HubStatus status={status} statusKind={statusKind} />
    </HubScreen>
  );
}
