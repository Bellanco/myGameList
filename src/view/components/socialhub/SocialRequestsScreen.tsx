import { Icon } from '../Icon';
import { HubAvatar } from './HubAvatar';

/**
 * Bandeja de solicitudes de amistad (recibidas / enviadas).
 * Presentacional, sin lógica de negocio: recibe las listas ya enriquecidas y los handlers del ViewModel.
 */
type RequestView = { docId: string; otherUid: string; name: string; photo: string };

export function SocialRequestsScreen({
  SOCIAL_UI,
  incomingRequests,
  outgoingRequests,
  loading,
  busyUid,
  onAccept,
  onReject,
  onCancel,
  onBack,
  status,
  statusKind,
}: {
  SOCIAL_UI: any;
  incomingRequests: RequestView[];
  outgoingRequests: RequestView[];
  loading: boolean;
  busyUid: string;
  onAccept: (otherUid: string) => void;
  onReject: (otherUid: string) => void;
  onCancel: (otherUid: string) => void;
  onBack: () => void;
  status: string;
  statusKind: string;
}) {
  const R = SOCIAL_UI.requests;

  return (
    <section className="hub-hub hub-screen" aria-label={R.sectionAria}>
      <div className="hub-hub-card hub-screen-card hub-feed-card-shell">
        <header className="hub-screen-header">
          <div className="hub-hub-title-wrap">
            <Icon name="bottom-hub" className="hub-hub-icon" />
            <h2>{R.title}</h2>
          </div>
          <p>{R.subtitle}</p>
        </header>

        <div className="hub-screen-actions" aria-label={R.actionsAria}>
          <button className="btn btn-secondary" type="button" onClick={onBack}>
            <Icon name="arrow-back" />
            {R.back}
          </button>
        </div>

        {loading ? <p>{R.loading}</p> : null}

        <div className="fg">
          <span className="flabel">{R.incomingTitle}</span>
          {incomingRequests.length === 0 ? (
            <p>{R.incomingEmpty}</p>
          ) : (
            <div className="hub-feed-activity-list" role="list" aria-label={R.incomingTitle}>
              {incomingRequests.map((request) => (
                <article key={request.docId} className="hub-feed-card hub-feed-activity-item hub-request-item" role="listitem">
                  <header className="hub-feed-card-head">
                    <HubAvatar name={request.name} photoURL={request.photo} />
                    <div className="hub-feed-card-head-text">
                      <h3>{request.name}</h3>
                    </div>
                  </header>
                  <div className="hub-request-actions">
                    <button
                      className="btn btn-secondary btn-accent"
                      type="button"
                      disabled={busyUid === request.otherUid}
                      aria-label={R.acceptAria(request.name)}
                      onClick={() => onAccept(request.otherUid)}
                    >
                      <Icon name="plus" />
                      {R.accept}
                    </button>
                    <button
                      className="btn btn-danger"
                      type="button"
                      disabled={busyUid === request.otherUid}
                      aria-label={R.rejectAria(request.name)}
                      onClick={() => onReject(request.otherUid)}
                    >
                      <Icon name="close" />
                      {R.reject}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="fg">
          <span className="flabel">{R.outgoingTitle}</span>
          {outgoingRequests.length === 0 ? (
            <p>{R.outgoingEmpty}</p>
          ) : (
            <div className="hub-feed-activity-list" role="list" aria-label={R.outgoingTitle}>
              {outgoingRequests.map((request) => (
                <article key={request.docId} className="hub-feed-card hub-feed-activity-item hub-request-item" role="listitem">
                  <header className="hub-feed-card-head">
                    <HubAvatar name={request.name} photoURL={request.photo} />
                    <div className="hub-feed-card-head-text">
                      <h3>{request.name}</h3>
                    </div>
                  </header>
                  <div className="hub-request-actions">
                    <button
                      className="btn btn-secondary"
                      type="button"
                      disabled={busyUid === request.otherUid}
                      aria-label={R.cancelAria(request.name)}
                      onClick={() => onCancel(request.otherUid)}
                    >
                      <Icon name="close" />
                      {R.cancel}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        {status ? <div className={`sync-status-msg ${statusKind}`}>{status}</div> : null}
      </div>
    </section>
  );
}
