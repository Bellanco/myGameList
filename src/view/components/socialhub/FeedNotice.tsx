import { Notice } from '../Notice';
import { HubOfflineNotice } from './HubOfflineNotice';
import type { SocialUiLabels } from '../../../core/constants/socialLabels';

/**
 * EL AVISO DE ARRIBA DEL FEED: uno a la vez, por lo que más pide al usuario (docs/plan-feed-sin-vacio.md, Fase 1).
 *
 *   1. Sin red: no se puede ni reconectar.
 *   2. GitHub ha rechazado el token: es lo único que el usuario puede arreglar, así que lleva el botón.
 *   3. Un servicio no atiende: se arregla solo.
 *   4. Algo no se pudo leer y no hay copia, con actividad a la vista. Con el feed vacío lo dice el propio vacío, así
 *      que aquí no se repite.
 */
export function FeedNotice({
  SOCIAL_UI,
  offline,
  offlineHasCachedData,
  serviceLimited,
  githubReconnect,
  readFailed,
}: {
  SOCIAL_UI: SocialUiLabels;
  offline: boolean;
  offlineHasCachedData: boolean;
  serviceLimited: boolean;
  githubReconnect: { onReconnect: () => void; busy: boolean } | null;
  /** Ya resuelto por quien llama: fallo de lectura sin copia Y actividad a la vista. */
  readFailed: boolean;
}) {
  if (offline) return <HubOfflineNotice hasCachedData={offlineHasCachedData} />;
  if (githubReconnect) {
    const labels = SOCIAL_UI.githubReconnect;
    return (
      <Notice
        inline
        tone="warn"
        icon="cloud-sync"
        role="status"
        aria-label={labels.sectionAria}
        kicker={labels.badge}
        title={labels.title}
        actions={(
          <button type="button" className="btn" onClick={githubReconnect.onReconnect} disabled={githubReconnect.busy}>
            {githubReconnect.busy ? labels.actionBusy : labels.action}
          </button>
        )}
      >
        {labels.body}
      </Notice>
    );
  }
  if (serviceLimited) return <HubOfflineNotice variant="limited" hasCachedData={offlineHasCachedData} />;
  if (readFailed) {
    return (
      <Notice inline tone="err" role="status" aria-label={SOCIAL_UI.feed.readFailedTitle} kicker={SOCIAL_UI.feed.readFailedBadge}>
        {SOCIAL_UI.feed.readFailed}
      </Notice>
    );
  }
  return null;
}
