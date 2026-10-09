import { Icon } from '../Icon';
import { HubUserCard, HubUserCardSkeleton } from './HubUserCard';
import { HubUserSection } from './HubUserSection';
import type { SocialUiLabels } from '../../../core/constants/socialLabels';
import type { ProfileTier } from '../../../core/constants/tiers';
import { HubScreen } from './HubScreen';
import { HubStatus } from './HubStatus';
import { HubBackButton } from './HubBackButton';

/**
 * Bandeja de solicitudes de amistad: SOLO las que te han hecho a ti, que son lo único que pide algo de tu parte.
 *
 * Aquí estaban también las que has enviado y la lista de amigos (09-10-2026), y las dos se repetían en «Perfiles»:
 * allí cada amigo sale con su tarjeta (también los que no están en el directorio, que entran por el documento de
 * amistad) y quien tiene tu petición lleva «Pendiente · Retirar». Dejar de ser amigos está en su ficha. Con eso
 * fuera, la campana del feed solo aparece cuando hay algo que contestar (ver `FeedShell`).
 *
 * Si contestas la última estando dentro, la pantalla se queda con su aviso de vacío y el botón de volver: no te
 * saca de ella sin pedirlo, y así ves que se ha hecho.
 */
type RequestView = {
  docId: string;
  otherUid: string;
  name: string;
  photo: string;
  /** Solo de quien esté en el directorio; sin él la tarjeta va sin punto de rango. */
  tier?: ProfileTier;
};

/** Filas por página: con muchas peticiones a la vez, la lista crece a tandas en vez de empujar la pantalla. */
const REQUEST_ROWS_PER_PAGE = 4;

export function SocialRequestsScreen({
  SOCIAL_UI,
  incomingRequests,
  loading,
  busyUid,
  onAccept,
  onReject,
  onBack,
  status,
  statusKind,
  showTiers = false,
}: {
  SOCIAL_UI: SocialUiLabels;
  incomingRequests: RequestView[];
  loading: boolean;
  busyUid: string;
  onAccept: (otherUid: string) => void;
  onReject: (otherUid: string) => void;
  onBack: () => void;
  status: string;
  statusKind: string;
  /**
   * ¿Se enseña el rango en las tarjetas? Solo a la administración: de cara al resto de usuarios los rangos no se
   * nombran en ningún sitio, porque hoy todos son bronce y no hay forma de pedir otro.
   */
  showTiers?: boolean;
}) {
  const R = SOCIAL_UI.requests;

  return (
    <HubScreen ariaLabel={R.sectionAria} title={R.title}>

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
              tier={showTiers ? request.tier : undefined}
              busy={busyUid === request.otherUid}
            >
              <button
                className="btn btn-social"
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
                className="btn btn-exit"
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

        {!loading && incomingRequests.length === 0 ? <p>{R.empty}</p> : null}

        <HubStatus status={status} statusKind={statusKind} />
    </HubScreen>
  );
}
