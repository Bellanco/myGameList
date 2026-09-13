import { SOCIAL_SHELL } from '../../core/constants/socialShell';
import { useCanPublishHint } from '../hooks/useCanPublishHint';
import { FeedComposerSkeleton, FeedShell } from './socialhub/FeedShell';

/**
 * Esqueleto de carga de la actividad social.
 *
 * Vive FUERA de `SocialHub` (que es `lazy`) a propósito: es el `fallback` del `Suspense` que espera a su chunk, así
 * que tiene que estar ya en el arranque. Es diminuto porque todo lo que pesa entra por una ranura o se queda fuera
 * (ver la cabecera de `FeedShell`).
 *
 * Y dibuja EL MISMO ARMAZÓN que la pantalla real, con el mismo componente: cabecera con avatar, fila de botones,
 * hueco del compositor y rótulo «Actividad». Antes solo pintaba el título y cuatro renglones grises, así que al
 * llegar el chunk aparecían de golpe unos 300 px de interfaz, los renglones bajaban de sitio y volvían a empezar
 * su pulso: la carga parecía arrancar dos veces. Ahora, cuando llegan los datos, lo único que cambia son las
 * tarjetas.
 */
export function SocialHubSkeleton() {
  // El compositor solo existe a partir del rango plata, y el rango no se sabrá hasta que cargue el hub: se reserva
  // su hueco según lo que pasó la última vez. Ver `socialShellHint`.
  const reservarCompositor = useCanPublishHint();

  return (
    <FeedShell
      avatar={(
        <span className="hub-avatar-link hub-feed-owner-avatar" aria-hidden="true">
          <span className="hub-avatar hub-skeleton" />
        </span>
      )}
      composer={reservarCompositor ? <FeedComposerSkeleton /> : null}
    >
      {/* Mismo hilo de progreso que el resto de esperas de chunk (`ScreenSkeleton`): el armazón dice qué forma
          tendrá la pantalla y el hilo, que sigue habiendo algo en camino. */}
      <div className="route-progress" aria-hidden="true" />
      <div className="fg">
        <span className="flabel">{SOCIAL_SHELL.feed.activityTitle}</span>
        {/* El esqueleto es decorativo (`aria-hidden`), así que la carga se anuncia por aquí o un lector de
            pantalla se quedaría sin saber que hay algo en camino. */}
        <p className="sr-only" role="status">{SOCIAL_SHELL.loading}</p>
        {/* Misma anidación y mismas tarjetas que el bloque de actividad del feed, para que el salto de aquí a la
            pantalla real no mueva ni el espaciado ni la posición de las tarjetas. */}
        <div className="hub-feed-activity-list" aria-hidden="true">
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
    </FeedShell>
  );
}
