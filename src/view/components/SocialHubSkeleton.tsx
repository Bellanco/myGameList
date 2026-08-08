import { SOCIAL_UI } from '../../core/constants/labels';
import { Icon } from './Icon';

/**
 * Esqueleto de carga del hub social.
 *
 * Vive FUERA de `SocialHub` (que es `lazy`) a propósito: es el `fallback` del `Suspense` que espera a su chunk, así
 * que tiene que estar ya en el arranque. Es diminuto y solo usa piezas que la app ya carga (`Icon`, `SOCIAL_UI`).
 *
 * Reutiliza el MISMO armazón que el feed (`hub-screen` + `hub-feed-card-shell`) y las mismas tarjetas de esqueleto
 * que `SocialFeedScreen`/`SocialProfilesScreen`, para que la transición de "cargando" a la pantalla real no mueva
 * el layout. Antes había tres cambios de escena distintos antes del contenido —blanco (fallback `null`), tarjeta de
 * pasarela con "Cargando…", y esqueletos del feed— y en medio se colaba el estado VACÍO del feed.
 */
export function SocialHubSkeleton() {
  return (
    <section className="hub-hub hub-screen" aria-label={SOCIAL_UI.screenAria}>
      <div className="hub-hub-card hub-screen-card hub-feed-card-shell">
        <header className="hub-screen-header">
          <div className="hub-hub-title-wrap">
            <Icon name="bottom-hub" className="hub-hub-icon" />
            <h2>{SOCIAL_UI.hubTitle}</h2>
          </div>
          {/* El esqueleto es decorativo (`aria-hidden`), así que la carga se anuncia por aquí o un lector de
              pantalla se quedaría sin saber que hay algo en camino. */}
          <p className="sr-only" role="status">{SOCIAL_UI.loading}</p>
        </header>
        {/* Misma anidación que el bloque de actividad del feed (`.fg > .hub-feed-activity-list`): así el salto de
            este esqueleto a la pantalla real no mueve ni el espaciado ni la posición de las tarjetas. */}
        <div className="fg" aria-hidden="true">
          <div className="hub-feed-activity-list">
            {[0, 1, 2, 3].map((index) => (
              <article key={index} className="hub-feed-card hub-feed-activity-item hub-skeleton-card">
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
        </div>
      </div>
    </section>
  );
}
