import type { CSSProperties } from 'react';
import { ReviewDetailBody } from '../ReviewDetailBody';
import { ReviewDetailHead } from '../ReviewDetailHead';
import type { SocialUiLabels } from '../../../core/constants/socialLabels';
import type { GameItem } from '../../../model/types/game';
import type { SocialActivityFeedItem } from '../../../viewmodel/useSocialViewModel';
import { HubScreen } from './HubScreen';
import { HubStatus } from './HubStatus';
import { HubBackButton } from './HubBackButton';
import { ShareReviewButton } from '../stats/ShareReviewButton';
import { useReviewCover } from './useReviewCover';

/**
 * El cuerpo del detalle MIENTRAS lo que va a ocupar su sitio todavía viene de camino.
 *
 * Uno solo para las dos esperas de esta pantalla —la del evento y la del análisis completo—, porque el hueco que
 * reservan es el mismo. Las líneas van dentro de `.hub-detail-body-skeleton` y no sueltas: a partir de 44rem
 * `.hub-detail-body` se pone en FILA (reseña a la izquierda, metadatos a la derecha) y sueltas cada línea se
 * habría convertido en una columna.
 */
function DetailBodySkeleton() {
  return (
    <div className="hub-detail-body" aria-hidden="true">
      <div className="hub-detail-body-skeleton">
        {['96%', '88%', '93%', '54%'].map((width) => (
          <span key={width} className="hub-skeleton hub-skeleton-line" style={{ width }} />
        ))}
      </div>
      {/* Los cuatro bloques de chips también tienen su hueco: sin él, al llegar el análisis la pantalla crecía de
          golpe por debajo y empujaba las reseñas relacionadas. */}
      <div className="hub-detail-metadata">
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className="hub-skeleton hub-detail-meta-skeleton" />
        ))}
      </div>
    </div>
  );
}

/** Pantalla de detalle de actividad social. */
export function SocialDetailScreen({
  SOCIAL_UI,
  activeDetailEvent,
  getGameItemById,
  onOpenProfileDetail,
  onBack,
  status,
  statusKind,
  shareable = false,
  eventLoading = false,
  reviewLoading = false,
  related = null,
  backLabel,
  coversAllowed = false,
}: {
  SOCIAL_UI: SocialUiLabels;
  /**
   * Solo los campos que esta pantalla PINTA, no la entrada del feed entera: es un componente presentacional y
   * declarar de más la ataría a cambios del modelo que no le afectan (y obligaría a las pruebas a fabricar
   * objetos completos para renderizar una tarjeta).
   */
  activeDetailEvent: Pick<
    SocialActivityFeedItem,
    'gameId' | 'gameName' | 'grade' | 'photoURL' | 'profileDisplayName' | 'profileId' | 'rating' | 'snippet' | 'updatedAt'
  > | null;
  getGameItemById: (profileId: string, id: number) => GameItem | null;
  /**
   * ¿Se puede pedir la carátula del juego para el fondo? Por defecto no; lo enciende el hub con la misma regla
   * que el resto de las reseñas ajenas (ver `useReviewCover`). Esta pantalla es el detalle de una reseña leída
   * DESDE EL FEED, y la del perfil es `SocialProfileReviewScreen`: son dos caminos a lo mismo, así que lo que se
   * cambie en una hay que cambiarlo en la otra hasta que se unifiquen.
   */
  coversAllowed?: boolean;
  onOpenProfileDetail: (id: string) => void;
  onBack: () => void;
  status: string;
  statusKind: string;
  /**
   * ¿Es MÍA esta reseña? Entonces se ofrece compartirla con un enlace público. Lo decide el hub con la identidad
   * del viewmodel, no esta pantalla: aquí solo se pinta lo que corresponda.
   */
  shareable?: boolean;
  /**
   * ¿Puede APARECER TODAVÍA el evento abierto? Lo decide el hub (`detailEventLoading`), que es quien sabe si el
   * directorio sigue hidratándose. Con `true` no hay reseña que pintar pero tampoco falta ninguna: la pantalla
   * espera, en vez de afirmar que no se ha encontrado.
   */
  eventLoading?: boolean;
  /**
   * ¿Falta todavía el ANÁLISIS COMPLETO? Lo decide el hub (`detailReviewLoading`), que es quien sabe si el gist
   * de listados de esa persona viene de camino. Con `true`, el cuerpo espera como esqueleto en vez de enseñar el
   * adelanto con un aviso que en ese momento no es verdad.
   */
  reviewLoading?: boolean;
  /**
   * Bloque de reseñas RELACIONADAS al pie del análisis. Llega montado, como `actions`, y por el mismo motivo:
   * quién puede relacionar reseñas depende de qué datos tenga a mano quien usa esta pantalla, y eso lo sabe el
   * hub —que tiene el directorio— y no un componente de presentación.
   */
  related?: React.ReactNode;
  /**
   * Rótulo del botón de volver. Por defecto, la actividad; quien haya llegado saltando desde otro análisis pasa
   * el suyo, porque vuelve ahí y no al feed.
   */
  backLabel?: string;
}) {
  const coverOf = useReviewCover(coversAllowed);
  if (!activeDetailEvent) {
    /**
     * SIN EVENTO HAY DOS SITUACIONES DISTINTAS Y ANTES SE CONTABAN IGUAL.
     *
     * Este detalle se resuelve buscando en el directorio social, así que llegar aquí por un enlace, por una
     * recarga o desde un aviso lo deja vacío hasta que ese directorio se hidrata. La pantalla decía «no se ha
     * encontrado» —un mensaje definitivo— y a los pocos segundos aparecía la reseña: el usuario leía un error
     * que no lo era. Ahora, mientras todavía puede aparecer, la pantalla ESPERA con la forma que va a tener; el
     * mensaje queda para cuando la hidratación ha terminado y sigue sin haber nada, que es cuando es verdad.
     *
     * El botón de volver se pinta en los dos casos: es navegación, y no depende de ningún dato.
     */
    return (
      <HubScreen
        ariaLabel={SOCIAL_UI.feed.sectionAria}
        title={SOCIAL_UI.feed.detailTitle}
        subtitle={SOCIAL_UI.feed.detailSubtitle}
      >
          <div className="hub-screen-actions hub-screen-actions-split" aria-label={SOCIAL_UI.feed.detailActionsAria}>
            <div className="hub-screen-actions-left">
              <HubBackButton onBack={onBack} label={backLabel || SOCIAL_UI.feed.backToFeed} />
            </div>
          </div>
          {eventLoading ? (
            <article className="hub-feed-card hub-feed-card-detail">
              {/* Misma anidación que `ReviewDetailHead`, para que la firma de la reseña no cambie de sitio al
                  llegar: disco del avatar, nombre y fecha. */}
              <header className="hub-feed-card-head" aria-hidden="true">
                <span className="hub-avatar hub-skeleton" />
                <div className="hub-feed-card-head-text">
                  <span className="hub-skeleton hub-skeleton-line" style={{ width: '38%' }} />
                  <span className="hub-skeleton hub-skeleton-line" style={{ width: '22%' }} />
                </div>
              </header>
              <DetailBodySkeleton />
              <p className="sr-only" role="status">{SOCIAL_UI.feed.detailLoadingReview}</p>
            </article>
          ) : (
            <p>{SOCIAL_UI.feed.detailMissing}</p>
          )}
          <HubStatus status={status} statusKind={statusKind} />
      </HubScreen>
    );
  }
  const gameItem = getGameItemById(activeDetailEvent.profileId, activeDetailEvent.gameId);
  // Reseña COMPLETA para juegos propios (gameItem.review); para eventos ajenos cae al snippet (≤160) del evento.
  const fullReview = String(gameItem?.review || '').trim();
  const reviewText = fullReview || String(activeDetailEvent.snippet || '').trim();
  /**
   * ¿Lo que se está enseñando es el ADELANTO y no la reseña?
   *
   * Se dice, en vez de dejar que un texto cortado a mitad de palabra pase por una reseña entera. Pasó con un
   * usuario real cuya sincronización de listas llevaba un mes rota: sus amigos veían 160 caracteres sin puntos
   * fuertes ni débiles y lo que parecía es que la pantalla del detalle estuviera mal.
   */
  const previewOnly = Boolean(reviewText) && !fullReview && !reviewLoading;
  /**
   * El cuerpo espera como ESQUELETO, y no con el adelanto, cuando el análisis completo todavía viene de camino.
   * Enseñar el adelanto ahí era decir dos cosas falsas a la vez: que eso es la reseña y que no hay más.
   */
  const bodyLoading = reviewLoading && !fullReview;
  const updatedAtDate = new Date(activeDetailEvent.updatedAt);
  const hasValidUpdatedAt = !Number.isNaN(updatedAtDate.getTime());
  const analyzedAtLabel = hasValidUpdatedAt
    ? SOCIAL_UI.feed.analyzedAt(updatedAtDate)
    : SOCIAL_UI.feed.analyzedRecently;
  // Las plataformas solo están si de ese perfil tenemos listados; sin ellas la carátula se pide igual por
  // nombre, que es lo que hace el bloque de relacionadas.
  const cover = coverOf(activeDetailEvent.gameName, gameItem?.platforms);
  return (
    <HubScreen
      ariaLabel={SOCIAL_UI.feed.sectionAria}
      title={SOCIAL_UI.feed.detailTitle}
      subtitle={SOCIAL_UI.feed.detailSubtitle}
    >
        <div className="hub-screen-actions hub-screen-actions-split" aria-label={SOCIAL_UI.feed.detailActionsAria}>
          <div className="hub-screen-actions-left">
            <HubBackButton onBack={onBack} label={backLabel || SOCIAL_UI.feed.backToFeed} />
          </div>
          {shareable && gameItem && reviewText ? (
            <div className="hub-screen-actions-right">
              <ShareReviewButton game={gameItem} reviewText={reviewText} />
            </div>
          ) : null}
        </div>
        <article
          className={`hub-feed-card hub-feed-card-detail${cover ? ' has-cover' : ''}`}
          style={cover ? ({ '--row-cover': `url("${cover}")` } as CSSProperties) : undefined}
        >
          {/* Aquí la firma SÍ lleva avatar y enlace: se llega desde el feed, donde lo que se sigue es a la
              persona, y su perfil está a un clic. Ver `ReviewDetailHead`. */}
          <ReviewDetailHead
            gameName={activeDetailEvent.gameName}
            author={{
              name: activeDetailEvent.profileDisplayName,
              photoURL: activeDetailEvent.photoURL,
              onOpen: () => onOpenProfileDetail(activeDetailEvent.profileId),
              openAria: SOCIAL_UI.feed.openProfileAria(activeDetailEvent.profileDisplayName),
            }}
            dateLabel={analyzedAtLabel}
            score={{ score: Number(activeDetailEvent.rating || 0), grade: activeDetailEvent.grade ?? null }}
          />
          {bodyLoading ? (
            <DetailBodySkeleton />
          ) : (
            <ReviewDetailBody
              review={reviewText}
              platforms={gameItem?.platforms}
              genres={gameItem?.genres}
              strengths={gameItem?.strengths}
              weaknesses={gameItem?.weaknesses}
            />
          )}
          {/* Lo que está pasando, para quien no ve el esqueleto. */}
          {bodyLoading ? <p className="sr-only" role="status">{SOCIAL_UI.feed.detailLoadingReview}</p> : null}
          {previewOnly ? <p className="hub-detail-preview-note">{SOCIAL_UI.feed.detailPreviewOnly}</p> : null}
        </article>
        {related}
        <HubStatus status={status} statusKind={statusKind} />
    </HubScreen>
  );
}

