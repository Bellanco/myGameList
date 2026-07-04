import { Icon } from '../Icon';
import { HubAvatar } from './HubAvatar';
import type { SocialUiLabels } from '../../../core/constants/labels';

/** Bandeja de solicitudes de amistad (recibidas / enviadas). */
type RequestView = { docId: string; otherUid: string; name: string; photo: string };

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

        {loading ? (
          <div className="hub-feed-activity-list" aria-hidden="true">
            <p className="sr-only">{R.loading}</p>
            {[0, 1, 2].map((i) => (
              <article key={i} className="hub-feed-card hub-feed-activity-item hub-skeleton-card">
                <header className="hub-feed-card-head">
                  <span className="hub-avatar hub-skeleton" />
                  <div className="hub-feed-card-head-text">
                    <span className="hub-skeleton hub-skeleton-line" style={{ width: '50%' }} />
                  </div>
                </header>
              </article>
            ))}
          </div>
        ) : null}

        <div className="fg">
          <span className="flabel">{R.incomingTitle}</span>
          {incomingRequests.length === 0 ? (
            <p>{R.incomingEmpty}</p>
          ) : (
            <div className="hub-feed-activity-list" role="list" aria-label={R.incomingTitle}>
              {incomingRequests.map((request) => (
                <article key={request.docId} className={`hub-feed-card hub-feed-activity-item hub-request-item ${busyUid === request.otherUid ? 'is-busy' : ''}`.trim()} role="listitem">
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
                <article key={request.docId} className={`hub-feed-card hub-feed-activity-item hub-request-item ${busyUid === request.otherUid ? 'is-busy' : ''}`.trim()} role="listitem">
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

        <div className="fg">
          <span className="flabel">{R.friendsTitle}</span>
          {friendsList.length === 0 ? (
            <p>{R.friendsEmpty}</p>
          ) : (
            <div className="hub-feed-activity-list" role="list" aria-label={R.friendsTitle}>
              {friendsList.map((friend) => (
                <article key={friend.docId} className={`hub-feed-card hub-feed-activity-item hub-request-item ${busyUid === friend.otherUid ? 'is-busy' : ''}`.trim()} role="listitem">
                  <header className="hub-feed-card-head">
                    <HubAvatar name={friend.name} photoURL={friend.photo} />
                    <div className="hub-feed-card-head-text">
                      <h3>{friend.name}</h3>
                    </div>
                  </header>
                  <div className="hub-request-actions">
                    <button
                      className="btn btn-danger"
                      type="button"
                      disabled={busyUid === friend.otherUid}
                      aria-label={R.removeAria(friend.name)}
                      onClick={() => onRemove(friend.otherUid)}
                    >
                      <Icon name="close" />
                      {R.remove}
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
