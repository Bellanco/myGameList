import { memo, useEffect, useState } from 'react';
import { SHARE_UI } from '../../core/constants/shareLabels';
import { SOCIAL_UI } from '../../core/constants/socialLabels';
import { ReviewDetailBody } from './ReviewDetailBody';
import { NoScoreMedal } from './NoScoreMedal';
import { ScoreDisplay } from './ScoreDisplay';
import { readSharedReview } from '../../model/repository/publicShareRepository';
import type { SharedReview } from '../../model/types/share';

/**
 * Página que ve quien abre un enlace compartido (`/r/:token`).
 *
 * NAVEGACIÓN CERRADA cuando no hay cuenta (`standalone`): sin cabecera, sin botón de volver, y el nick del autor
 * es TEXTO PLANO, nunca un enlace — su perfil social no es público y no puede alcanzarse desde aquí. Tampoco hay
 * foto de perfil: no viaja en el artículo (ver `model/types/share.ts`), así que no hay nada que ocultar aquí.
 *
 * Lo único que se ofrece es la barra inferior de la app con UNA entrada, la página principal. Así la página se
 * lee como lo que es —una parte del sitio— en vez de como una tarjeta suelta con un anuncio al pie, y la
 * navegación sigue igual de cerrada: de ahí no se llega a nada que sea de nadie.
 *
 * Los tres finales malos —no existe, caducado, retirado— comparten pantalla y texto: ante un desconocido no hay
 * motivo para distinguirlos, y saber "esto existió" ya es información.
 */
export const PublicReviewScreen = memo(function PublicReviewScreen({ token, standalone = false }: { token: string; standalone?: boolean }) {
  const [state, setState] = useState<'loading' | 'ready' | 'gone'>('loading');
  const [review, setReview] = useState<SharedReview | null>(null);

  useEffect(() => {
    let alive = true;
    void readSharedReview(token).then((article) => {
      if (!alive) {
        return;
      }
      setReview(article);
      setState(article ? 'ready' : 'gone');
    });
    return () => {
      alive = false;
    };
  }, [token]);

  /**
   * Salida única, con la forma de la barra inferior de la app.
   *
   * Un enlace suelto al pie parecía un anuncio; esto se lee como "esto es una web con sus secciones", que es lo
   * que de verdad es. Lleva UNA sola entrada a propósito: el visitante sin cuenta no tiene hub social ni
   * estadísticas que visitar, y ofrecer secciones que no van a ninguna parte sería peor que no ofrecer nada.
   *
   * Es un <a>, no un <button>: navega de verdad a otra página, así que debe poder abrirse en otra pestaña y
   * mostrar su destino en la barra de estado.
   *
   * El icono va INCRUSTADO y no con `<Icon>`: los símbolos viven en `IconSprite`, que monta la app, y en modo
   * artículo no hay app. Traerse el sprite entero —ochenta y pico iconos— para pintar uno solo iría justo contra
   * la idea de esta página, que es cargar lo mínimo.
   */
  const bottomNav = (
    <nav className="bottom-nav share-public-nav" aria-label={SHARE_UI.publicNavAria}>
      <div className="bottom-nav-inner">
        <a className="bottom-nav-btn" href="/">
          <svg className="ui-icon bottom-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M7 1c-1.1 0-2 .9-2 2v18a2 2 0 0 0 2 2h7c2.76 0 5-2.24 5-5V3a2 2 0 0 0-2-2zm1 3h8v7H8zm1 10h1v2h2v1h-2v2H9v-2H7v-1h2zm7 1c.55 0 1 .45 1 1s-.45 1-1 1s-1-.45-1-1s.45-1 1-1m-2 2c.55 0 1 .45 1 1s-.45 1-1 1s-1-.45-1-1s.45-1 1-1"
            />
          </svg>
          <span>{SHARE_UI.publicCta}</span>
        </a>
      </div>
    </nav>
  );

  /**
   * Marco de la página. En modo artículo se envuelve en el MISMO `<main class="main">` que usa la app, en vez de
   * darle un ancho propio: así el contenido mide y respira exactamente igual con sesión y sin ella. Imitarlo con
   * un `max-width` a medida era justo lo que hacía que la reseña se viera más estrecha para quien llegaba de
   * fuera. La barra va fuera del `<main>`, como en la app.
   */
  const frame = (content: React.ReactNode) =>
    standalone ? (
      <>
        <main className="main main-settings">{content}</main>
        {bottomNav}
      </>
    ) : (
      content
    );

  if (state === 'loading') {
    return frame(
      <section className="hub-hub hub-screen" aria-label={SHARE_UI.publicAria}>
        <div className="hub-hub-card hub-screen-card hub-feed-card-shell">
          <p>{SHARE_UI.publicLoading}</p>
        </div>
      </section>,
    );
  }

  if (state === 'gone' || !review) {
    return frame(
      <section className="hub-hub hub-screen" aria-label={SHARE_UI.publicAria}>
        <div className="hub-hub-card hub-screen-card hub-feed-card-shell">
          <h2>{SHARE_UI.publicGoneTitle}</h2>
          <p>{SHARE_UI.publicGoneBody}</p>
        </div>
      </section>,
    );
  }

  const hasScore = typeof review.grade === 'number' || typeof review.rating === 'number';
  const reviewedAt = new Date(review.reviewedAt || 0);
  const hasValidDate = (review.reviewedAt || 0) > 0 && !Number.isNaN(reviewedAt.getTime());

  return frame(
    <section className="hub-hub hub-screen" aria-label={SHARE_UI.publicAria}>
      <div className="hub-hub-card hub-screen-card hub-feed-card-shell">
        <article className="hub-feed-card hub-feed-card-detail">
          <div className="hub-feed-card-head-text">
            <h3 className="hub-review-detail-game">{review.gameName}</h3>
            {/* Texto plano, NUNCA un enlace: el perfil del autor no es público. */}
            {review.authorNick ? <span className="hub-feed-game-chip">{review.authorNick}</span> : null}
          </div>
          {hasValidDate ? <p className="hub-feed-date">{SOCIAL_UI.feed.analyzedAt(reviewedAt)}</p> : null}
          {hasScore ? <ScoreDisplay game={{ score: review.rating ?? 0, grade: review.grade }} /> : <NoScoreMedal />}
          <ReviewDetailBody
            review={review.review}
            platforms={review.platforms}
            genres={review.genres}
            strengths={review.strengths}
            weaknesses={review.weaknesses}
          />
        </article>

      </div>
    </section>,
  );
});
