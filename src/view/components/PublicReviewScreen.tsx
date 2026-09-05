import { memo, useEffect, useMemo, useState } from 'react';
import { SHARE_UI } from '../../core/constants/shareLabels';
import { SOCIAL_UI } from '../../core/constants/socialLabels';
import { ReviewDetailBody } from './ReviewDetailBody';
import { ReviewDetailHead } from './ReviewDetailHead';
import { RelatedReviews } from './socialhub/RelatedReviews';
import { readSharedReview, readSharedReviewSuggestions } from '../../model/repository/publicShareRepository';
import type { RelatedReview } from '../../core/social/relatedReviews';
import type { SharedReview, SharedReviewSuggestion } from '../../model/types/share';
// La hoja de la RESEÑA. Esta pantalla la pinta sin el hub social —en modo artículo no hay hub—, así que sin
// esto se quedaba sin el medallón y sin el bloque del pie. Ver `styles/reviews.scss`.
import '../../styles/reviews.scss';

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
  const [suggestions, setSuggestions] = useState<SharedReviewSuggestion[]>([]);

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

  // Los sugeridos van en su PROPIA petición y con su propio estado, para que el pie no retrase la reseña: quien
  // abre el enlace la ve en cuanto llega, y el bloque aparece después (o no aparece, que es lo normal cuando el
  // autor no tiene nada más publicado que se parezca). Empieza vacío y termina vacío si algo falla: no hay
  // "cargando" ni "no hay sugerencias" porque un hueco anunciando que no hay nada sería peor que el silencio.
  useEffect(() => {
    let alive = true;
    void readSharedReviewSuggestions(token).then((items) => {
      if (alive) {
        setSuggestions(items);
      }
    });
    return () => {
      alive = false;
    };
  }, [token]);

  /**
   * Las sugerencias con la forma que pinta `RelatedReviews`, que es el MISMO bloque del hub social: la tarjeta,
   * el medallón y la rejilla ya están resueltos ahí y no tiene sentido mantener dos.
   *
   * El orden y el filtro los ha hecho el servidor (ver `functions/api/share/related/[token].ts`), así que aquí
   * `reason` y `score` no deciden nada: van con lo que el componente necesita para tipar y nada más.
   */
  const suggestionCards = useMemo<RelatedReview[]>(
    () =>
      suggestions.map((item) => ({
        // El token es la clave de render Y la dirección de la tarjeta (ver `hrefFor`).
        key: item.token,
        gameId: 0,
        gameName: item.gameName,
        // Sin firma: todas son de quien firma la reseña abierta, y repetir su nombre en cada tarjeta sería
        // decir seis veces lo que ya está dos centímetros más arriba.
        authorId: '',
        authorName: '',
        isOwn: false,
        rating: item.rating ?? 0,
        grade: item.grade,
        snippet: item.snippet,
        updatedAt: item.reviewedAt,
        reason: 'same-author',
        score: 0,
      })),
    [suggestions],
  );

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
   * Encabezado de la pantalla: el MISMO que el detalle de un análisis dentro de la aplicación (`HubScreen` con
   * el icono `signature`, ver `SocialProfileReviewScreen`). Aquí va escrito a mano en vez de reutilizar aquel
   * componente por una sola razón: `HubScreen` pinta el icono con `<Icon>`, que apunta al sprite que monta la
   * app, y en modo artículo no hay app. El símbolo va incrustado por lo mismo que el de la barra de abajo.
   *
   * NO LLEVA BOTÓN DE VOLVER, y no por olvido: la fila de acciones de aquella pantalla existe para regresar a la
   * lista de reseñas del perfil, y desde un enlace público no se ha venido de ninguna parte. La única salida
   * sigue siendo la barra de abajo.
   */
  const header = (
    <header className="hub-screen-header">
      <div className="hub-hub-title-wrap">
        <svg className="hub-hub-icon" viewBox="0 0 640 512" aria-hidden="true">
          <path
            fill="currentColor"
            d="M192 128c0-17.7 14.3-32 32-32s32 14.3 32 32l0 7.8c0 27.7-2.4 55.3-7.1 82.5l-84.4 25.3c-40.6 12.2-68.4 49.6-68.4 92l0 71.9c0 40 32.5 72.5 72.5 72.5c26 0 50-13.9 62.9-36.5l13.9-24.3c26.8-47 46.5-97.7 58.4-150.5l94.4-28.3-12.5 37.5c-3.3 9.8-1.6 20.5 4.4 28.8s15.7 13.3 26 13.3l128 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-83.6 0 18-53.9c3.8-11.3 .9-23.8-7.4-32.4s-20.7-11.8-32.2-8.4L316.4 198.1c2.4-20.7 3.6-41.4 3.6-62.3l0-7.8c0-53-43-96-96-96s-96 43-96 96l0 32c0 17.7 14.3 32 32 32s32-14.3 32-32l0-32zm-9.2 177l49-14.7c-10.4 33.8-24.5 66.4-42.1 97.2l-13.9 24.3c-1.5 2.6-4.3 4.3-7.4 4.3c-4.7 0-8.5-3.8-8.5-8.5l0-71.9c0-14.1 9.3-26.6 22.8-30.7zM24 368c-13.3 0-24 10.7-24 24s10.7 24 24 24l40.3 0c-.2-2.8-.3-5.6-.3-8.5L64 368l-40 0zm592 48c13.3 0 24-10.7 24-24s-10.7-24-24-24l-310.1 0c-6.7 16.3-14.2 32.3-22.3 48L616 416z"
          />
        </svg>
        <h2>{SOCIAL_UI.feed.reviewDetailTitle}</h2>
      </div>
      <p>{SOCIAL_UI.feed.reviewDetailSubtitle}</p>
    </header>
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
          {header}
          <p>{SHARE_UI.publicLoading}</p>
        </div>
      </section>,
    );
  }

  // Los tres finales malos comparten pantalla, y esta es la ÚNICA que no lleva el encabezado de "Reseña":
  // anunciar un análisis encima de "este enlace ya no está disponible" prometería algo que no hay. Aquí el
  // título de la página es el propio mensaje.
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

  const reviewedAt = new Date(review.reviewedAt || 0);
  const hasValidDate = (review.reviewedAt || 0) > 0 && !Number.isNaN(reviewedAt.getTime());

  return frame(
    <section className="hub-hub hub-screen" aria-label={SHARE_UI.publicAria}>
      <div className="hub-hub-card hub-screen-card hub-feed-card-shell">
        {header}
        <article className="hub-feed-card hub-feed-card-detail">
          {/* La firma va SIN `onOpen`, y eso es justo lo que la deja en texto plano y sin avatar: el perfil del
              autor no es público y desde aquí no se llega a él. La foto tampoco viaja en el artículo. */}
          <ReviewDetailHead
            gameName={review.gameName}
            author={review.authorNick ? { name: review.authorNick } : null}
            dateLabel={hasValidDate ? SOCIAL_UI.feed.analyzedAt(reviewedAt) : ''}
            score={{ score: review.rating ?? 0, grade: review.grade }}
          />
          <ReviewDetailBody
            review={review.review}
            platforms={review.platforms}
            genres={review.genres}
            strengths={review.strengths}
            weaknesses={review.weaknesses}
          />
        </article>

        {/* Más análisis DEL MISMO AUTOR, y solo los que se parecen a este (mismo juego, saga o género): quien
            los elige es el servidor, ver `functions/api/share/related/[token].ts`. Nada de otras personas —eso
            es del espacio social, donde hay una amistad que lo justifique— y nada de firmar cada tarjeta, que
            aquí sería repetir seis veces el nick que ya está arriba.

            Cada tarjeta es un ENLACE a `/r/{token}`, no un botón: es otra página del sitio, así que tiene que
            poder abrirse en otra pestaña; y en modo artículo no hay enrutador al que pedirle una navegación. */}
        <RelatedReviews
          SOCIAL_UI={SOCIAL_UI}
          items={suggestionCards}
          title={SOCIAL_UI.feed.suggestedTitle}
          openAria={(entry) => SOCIAL_UI.feed.suggestedOpenAria(entry.gameName)}
          hrefFor={(entry) => `/r/${entry.key}`}
        />
      </div>
    </section>,
  );
});
