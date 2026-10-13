import { Icon } from '../Icon';
import { HubUserCard, HubUserCardSkeleton } from './HubUserCard';
import { HubUserSection } from './HubUserSection';
import type { SocialUiLabels } from '../../../core/constants/socialLabels';
import type { ProfileTier } from '../../../core/constants/tiers';
import { HubScreen } from './HubScreen';
import { HubStatus } from './HubStatus';
import type { LikeNotification } from '../../../core/social/likeNotifications';

/**
 * La pantalla de la CAMPANA del feed: las solicitudes de amistad que te han hecho y los «me gusta» nuevos a lo tuyo
 * (docs/plan-notificaciones-y-buscador.md). Los «me gusta» van en una fila por reseña o publicación, solo los nuevos:
 * lo que ya se vio aquí sigue mientras no salgas del social y luego desaparece (lo decide `useLikeNotifications`).
 *
 * Lo que sigue es la historia de la bandeja de solicitudes, que es lo que era esta pantalla hasta el 13-10-2026.
 *
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
  likeNotifications = [],
  onOpenLike,
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
  /** Filas de «me gusta» a lo tuyo que se enseñan en esta visita. */
  likeNotifications?: readonly LikeNotification[];
  /** Abre lo que ha gustado (la reseña o tus publicaciones). */
  onOpenLike?: (row: LikeNotification) => void;
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
    <HubScreen ariaLabel={R.sectionAria} title={R.title} back={{ onBack, destination: R.back }}>

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

        {likeNotifications.length > 0 ? (
          <div className="fg">
            <span className="flabel" id="hub-like-notices-title">
              {R.likesTitle} <span className="hub-section-count">· {likeNotifications.length}</span>
            </span>
            <ul className="hub-like-notices" aria-labelledby="hub-like-notices-title">
              {likeNotifications.map((row) => {
                const isPost = row.own.on === 'post';
                const what = isPost ? R.postExcerpt(row.own.text ?? '') : row.own.gameName ?? '';
                const fullPhrase = SOCIAL_UI.feed.likes.fullList(row.names);
                return (
                  <li key={row.target}>
                    <button
                      type="button"
                      className="hub-like-notice"
                      data-new={row.hasNew ? '' : undefined}
                      title={fullPhrase}
                      onClick={() => onOpenLike?.(row)}
                    >
                      <Icon name="thumbs-up" className="ui-icon hub-like-notice-icon" />
                      <span className="hub-like-notice-text">
                        {SOCIAL_UI.feed.likes.phrase(row.names)} {R.likeWhat(row.own.on)}{' '}
                        {isPost ? <q>{what}</q> : <strong>{what}</strong>}
                        <span className="sr-only">{R.likeRowHint(row.own.on)}</span>
                      </span>
                      <Icon name="angle-right" className="ui-icon hub-like-notice-go" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {!loading && incomingRequests.length === 0 && likeNotifications.length === 0 ? <p>{R.empty}</p> : null}

        <HubStatus status={status} statusKind={statusKind} />
    </HubScreen>
  );
}
