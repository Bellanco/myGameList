import type { ReactNode } from 'react';
import { SOCIAL_SHELL } from '../../../core/constants/socialShell';
import { Icon } from '../Icon';

/**
 * EL ARMAZÓN DE LA ACTIVIDAD SOCIAL, uno solo para la pantalla real y para su esqueleto.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE. Entrar en Social pasaba por dos escenas de carga y no por una. Primero el esqueleto del
 * `Suspense` —una tarjeta con el título y cuatro renglones grises— y después, al llegar el chunk, la pantalla de
 * verdad: cabecera con avatar, fila de botones, compositor de publicaciones y el rótulo «Actividad», unos 300 px
 * de interfaz que no estaban. Los renglones grises que ya se estaban mirando BAJABAN de sitio y volvían a
 * empezar su pulso, así que la carga parecía arrancar dos veces. Y arrancaba: el esqueleto prometía una pantalla
 * que no era la que llegaba.
 *
 * La cura no es animar el salto, es que no haya salto: el esqueleto y la pantalla dibujan EL MISMO armazón, y lo
 * único que cambia al llegar los datos son las tarjetas de dentro.
 *
 * POR QUÉ UN COMPONENTE Y NO UNA COPIA. Copiar el armazón en el esqueleto daba el mismo resultado hoy y se
 * desincronizaba al primer botón que alguien añadiera a la pantalla real: el esqueleto volvería a prometer algo
 * distinto, que es exactamente el fallo que esto arregla. Con un único componente, no puede pasar.
 *
 * ESTE FICHERO VIAJA EN EL ARRANQUE, porque lo importa `SocialHubSkeleton` —que es el `fallback` del `Suspense`
 * que trae el hub, así que existe antes que él—. De ahí tres decisiones que parecen rarezas y no lo son:
 *
 *  1. Los textos salen de `SOCIAL_SHELL` y no de `SOCIAL_UI`: el segundo son ~8 kB comprimidos de textos del hub
 *     que descargaría todo el mundo, entre en Social o no (ver la cabecera de `socialShell`).
 *  2. El AVATAR entra por una ranura (`avatar`) en vez de montarse aquí. `HubAvatar` arrastra el veredicto de la
 *     foto genérica de Google (`core/social/googlePhoto`, 210 líneas) y eso no puede entrar en el arranque para
 *     pintar un círculo gris. La pantalla real le pasa su avatar; el esqueleto, un disco del mismo tamaño.
 *  3. Igual el COMPOSITOR (`composer`): la pantalla real le pasa el suyo, con su estado y su autocrecimiento, y
 *     el esqueleto usa {@link FeedComposerSkeleton}, que está aquí abajo y comparte sus clases, así que mide
 *     exactamente lo mismo sin traerse nada de esa lógica.
 *
 * Su CSS tuvo que bajar de `social.scss` a `_layout.scss` por lo mismo (ver la nota allí).
 */
export interface FeedShellActions {
  pendingIncomingCount: number;
  onOpenProfiles: () => void;
  onOpenRequests: () => void;
  onSignOut: () => void;
}

export function FeedShell({
  prelude = null,
  avatar,
  actions,
  notice = null,
  composer = null,
  children,
}: {
  /** Lo que va dentro de la sección pero FUERA de la tarjeta (hoy, el sprite de las medallas). */
  prelude?: ReactNode;
  /** El avatar propio de la cabecera, ya envuelto en lo que corresponda (botón en la pantalla, disco en el esqueleto). */
  avatar: ReactNode;
  /** Los manejadores de la fila de botones. Sin ellos, la fila se pinta INERTE: es el modo esqueleto. */
  actions?: FeedShellActions;
  /** Aviso a toda la anchura sobre el contenido (hoy, la falta de conexión). */
  notice?: ReactNode;
  /** Compositor de publicaciones, o `null` cuando el rango no permite publicar. */
  composer?: ReactNode;
  /** El bloque de actividad: las tarjetas reales, o las del esqueleto. */
  children: ReactNode;
}) {
  const F = SOCIAL_SHELL.feed;
  const inert = !actions;

  return (
    <section className="hub-hub hub-screen" aria-label={F.sectionAria}>
      {prelude}
      <div className="hub-hub-card hub-screen-card hub-feed-card-shell">
        <header className="hub-screen-header hub-feed-header">
          <div className="hub-feed-header-text">
            <div className="hub-hub-title-wrap">
              <Icon name="bottom-hub" className="hub-hub-icon" />
              <h2>{F.title}</h2>
            </div>
            <p>{F.subtitle}</p>
          </div>
          {avatar}
        </header>
        {/* En modo esqueleto la fila entera sale `aria-hidden` además de deshabilitada: son botones que todavía no
            hacen nada, y anunciarlos invita a pulsarlos. Ocupan su sitio, que es para lo que están ahí — y van
            ATENUADOS (`is-placeholder`), porque un botón a todo color que no responde al clic se lee como una
            avería. La atenuación es solo opacidad: no mueve nada, así que al llegar la pantalla no hay salto. */}
        <div
          className={`hub-screen-actions hub-screen-actions-split ${inert ? 'is-placeholder' : ''}`.trim()}
          aria-label={inert ? undefined : F.actionsAria}
          aria-hidden={inert || undefined}
        >
          <div className="hub-screen-actions-left">
            <button
              className="btn btn-secondary btn-accent"
              type="button"
              disabled={inert}
              onClick={actions?.onOpenProfiles}
            >
              <Icon name="bottom-hub" />
              {F.openProfiles}
            </button>
            <button
              className="btn btn-secondary hub-requests-btn"
              type="button"
              disabled={inert}
              onClick={actions?.onOpenRequests}
              aria-label={inert ? undefined : F.openRequestsAria(actions.pendingIncomingCount)}
              title={F.openRequests}
            >
              <Icon name="bell" />
              {actions && actions.pendingIncomingCount > 0 ? (
                <span className="hub-requests-count is-active" aria-hidden="true">
                  {actions.pendingIncomingCount}
                </span>
              ) : null}
            </button>
          </div>
          <div className="hub-screen-actions-right">
            <button className="btn btn-danger" type="button" disabled={inert} onClick={actions?.onSignOut}>
              <Icon name="logout" />
              {F.signOut}
            </button>
          </div>
        </div>
        {notice}
        {composer}
        {children}
      </div>
    </section>
  );
}

/**
 * El hueco del compositor mientras no hay pantalla que lo llene.
 *
 * Es el MISMO marcado y las MISMAS clases que el compositor de verdad, solo que apagado y vacío: así su altura no
 * es un número copiado a ojo que se quede desfasado, sino la que le da el mismo CSS. Sin `sr-only` ni contador,
 * porque no hay nada que anunciar todavía.
 */
export function FeedComposerSkeleton() {
  return (
    <div className="fg is-placeholder" aria-hidden="true">
      <span className="flabel">{SOCIAL_SHELL.feed.postsTitle}</span>
      <div className="hub-post-composer">
        <textarea className="ftextarea hub-post-input" rows={1} disabled placeholder={SOCIAL_SHELL.feed.postPlaceholder} />
        <button className="btn btn-steam hub-post-publish" type="button" disabled>
          <Icon name="angle-right" />
        </button>
      </div>
    </div>
  );
}
