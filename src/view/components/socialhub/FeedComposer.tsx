import React from 'react';
import { Icon } from '../Icon';
import type { SocialUiLabels } from '../../../core/constants/socialLabels';

/**
 * EL COMPOSITOR DE PUBLICACIONES, Y POR QUÉ EL BORRADOR VIVE AQUÍ.
 *
 * El texto en curso era estado del hub (`useSocialCompose` → `useSocialViewModel` → `SocialHub` →
 * `SocialFeedScreen`), así que CADA PULSACIÓN repintaba la pantalla del feed entera: la lista de actividad, sus
 * tarjetas y un avatar por fila. Medido sobre 30 elementos del feed y 5 pulsaciones: 155 renders de `HubAvatar`
 * y 5 de la pantalla completa, rehaciendo las 30 tarjetas cada vez. Con 200 elementos, eso escala linealmente.
 *
 * Nadie fuera de aquí necesita ver el texto MIENTRAS se escribe: el contador, el botón y el autocrecimiento son
 * de esta pieza, y quien publica solo lo necesita UNA vez, al pulsar. Así que el borrador es estado local y el
 * hook lo recibe como argumento (`onPublish(text)`). Consecuencia medida: una pulsación ya no repinta nada más
 * que este componente — 0 renders del feed y 0 de los avatares.
 *
 * QUIÉN VACÍA EL CUADRO. Lo vacía este componente, y solo si `onPublish` devuelve `true`. Antes lo hacía el hook
 * (`setComposePostText('')`), y esa diferencia importa en el caso que ya está escrito en los textos: sin red, la
 * publicación no sale y «el texto sigue aquí» — de ahí que el contrato sea un booleano y no `void`.
 */
export const FeedComposer = React.memo(function FeedComposer({
  SOCIAL_UI,
  publishing,
  postMaxLength,
  showPostCounter,
  onPublish,
}: {
  SOCIAL_UI: SocialUiLabels;
  publishing: boolean;
  postMaxLength: number;
  /** Mithril no lleva contador: no hay límite que mostrar. */
  showPostCounter: boolean;
  /** Publica y dice si salió: `true` vacía el cuadro, `false` lo deja intacto (sin red, veto de rango). */
  onPublish: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = React.useState('');
  const composerRef = React.useRef<HTMLTextAreaElement>(null);

  // Autocrecimiento: parte de una línea (el tamaño del campo de antes) y se estira con el contenido, tanto al
  // saltar de línea con Enter como al desbordar por ancho. Se hace midiendo `scrollHeight` con la altura
  // reseteada; el tope lo pone el CSS (`max-height`), que a partir de ahí saca su propio scroll.
  React.useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const publish = React.useCallback(async () => {
    if (publishing || !text.trim()) return;
    if (await onPublish(text)) setText('');
  }, [onPublish, publishing, text]);

  // Contador de la publicación: mismas bandas que el de la reseña (aviso al 90 %, error al 100 %), para que el
  // usuario reconozca el patrón sin aprenderlo dos veces.
  const postProgress = showPostCounter ? Math.min(100, Math.round((text.length / postMaxLength) * 100)) : 0;
  const postProgressClass = postProgress >= 100 ? 'has-error' : postProgress >= 90 ? 'has-warning' : '';
  const postLiveMessage =
    postProgress >= 100
      ? SOCIAL_UI.feed.postCharLimitReached
      : postProgress >= 90
        ? SOCIAL_UI.feed.postCharNearLimit
        : '';

  return (
    <div className="fg">
      <span className="flabel">{SOCIAL_UI.feed.postsTitle}</span>
      <div className="hub-post-composer">
        <label className="sr-only" htmlFor="hub-post-text">{SOCIAL_UI.feed.postComposerLabel}</label>
        <textarea
          id="hub-post-text"
          ref={composerRef}
          className="ftextarea hub-post-input"
          // Arranca con la altura de una línea (como el campo de antes) y crece sola con el contenido.
          rows={1}
          value={text}
          placeholder={SOCIAL_UI.feed.postPlaceholder}
          // Mithril no lleva tope: sin `maxLength`, el navegador no corta al escribir.
          maxLength={showPostCounter ? postMaxLength : undefined}
          onChange={(event) => setText(event.target.value.slice(0, postMaxLength))}
          onKeyDown={(event) => {
            // Enter ya NO publica: ahora hace lo que se espera en un campo de varias líneas, saltar de línea.
            // Con textos de hasta 10.000 caracteres, publicar al pulsar Enter sería soltar el post a medio
            // escribir. Se publica con el botón, o con Ctrl/⌘+Enter para quien va por teclado.
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              void publish();
            }
          }}
        />
        <button
          className="btn btn-steam hub-post-publish"
          type="button"
          disabled={publishing || !text.trim()}
          onClick={() => void publish()}
          aria-label={publishing ? SOCIAL_UI.feed.postPublishing : SOCIAL_UI.feed.postPublish}
          title={publishing ? SOCIAL_UI.feed.postPublishing : SOCIAL_UI.feed.postPublish}
        >
          {publishing ? <span className="hub-spinner" aria-hidden="true" /> : <Icon name="angle-right" />}
        </button>
      </div>
      {/* Mismo patrón que el contador de la reseña (FormModal): conteo visible SIN aria-live y una región viva
          aparte que solo lleva texto en los umbrales, para no anunciar en cada pulsación. */}
      {showPostCounter ? (
        <div className="field-footer">
          <small className={`tag-hint ${postProgressClass}`.trim()}>
            {SOCIAL_UI.feed.postCharCount(text.length, postMaxLength)}
          </small>
          <span className="sr-only" role="status" aria-live="polite">
            {postLiveMessage}
          </span>
        </div>
      ) : null}
    </div>
  );
});
