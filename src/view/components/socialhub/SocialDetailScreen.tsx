import type { SocialUiLabels } from '../../../core/constants/socialLabels';
import type { GameItem } from '../../../model/types/game';
import type { SocialActivityFeedItem } from '../../../viewmodel/useSocialViewModel';
import { ShareReviewButton } from '../stats/ShareReviewButton';
import { ReviewScreen } from './ReviewScreen';
import type { CoverAccess } from './useReviewCover';

/**
 * La reseña tal y como llega por el FEED: `/social/user/:actorProfileId/game/:gameId/review`.
 *
 * Es un ADAPTADOR, igual que `SocialProfileReviewScreen`: lo suyo es de dónde salen los datos —una ENTRADA DE
 * ACTIVIDAD del directorio, que es lo único que hay de alguien cuyas listas no tenemos— y los tres estados que
 * solo se dan por este camino. Lo que se pinta lo pone `ReviewScreen`, donde está escrito por qué son dos
 * caminos y una sola pantalla.
 *
 * LOS TRES ESTADOS PROPIOS DE ESTE CAMINO:
 *  · la ESPERA del evento. Se resuelve buscando en el directorio, así que llegar por un enlace, por una recarga
 *    o desde un aviso lo deja vacío hasta que ese directorio se hidrata. La pantalla decía «no se ha
 *    encontrado» —un mensaje definitivo— y a los pocos segundos aparecía la reseña: el usuario leía un error
 *    que no lo era. Mientras todavía puede aparecer, se ESPERA con la forma que va a tener; el mensaje queda
 *    para cuando la hidratación ha terminado y sigue sin haber nada, que es cuando es verdad.
 *  · la ESPERA del análisis completo, que llega después que la entrada.
 *  · el ADELANTO: de un perfil ajeno puede que solo tengamos los 160 caracteres del canal.
 */
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
  onOpenProfileDetail: (id: string) => void;
  onBack: () => void;
  status: string;
  statusKind: string;
  /**
   * ¿Es MÍA esta reseña? Entonces se ofrece compartirla con un enlace público. Lo decide el hub con la identidad
   * del viewmodel, no esta pantalla: aquí solo se pinta lo que corresponda.
   */
  shareable?: boolean;
  /** El evento todavía viene de camino (el directorio se está hidratando). */
  eventLoading?: boolean;
  /** El análisis completo todavía viene de camino, aunque la cabecera ya se pueda pintar. */
  reviewLoading?: boolean;
  related?: React.ReactNode;
  backLabel?: string;
  /** ¿Se puede pedir la carátula del juego para el fondo? Ver `useReviewCover`. */
  coversAllowed?: CoverAccess;
}) {
  const gameItem = activeDetailEvent ? getGameItemById(activeDetailEvent.profileId, activeDetailEvent.gameId) : null;
  // Reseña COMPLETA para juegos propios (gameItem.review); para eventos ajenos cae al snippet (≤160) del evento.
  const fullReview = String(gameItem?.review || '').trim();
  const reviewText = fullReview || String(activeDetailEvent?.snippet || '').trim();
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

  const updatedAtDate = activeDetailEvent ? new Date(activeDetailEvent.updatedAt) : null;
  const hasValidUpdatedAt = Boolean(updatedAtDate && !Number.isNaN(updatedAtDate.getTime()));

  return (
    <ReviewScreen
      SOCIAL_UI={SOCIAL_UI}
      title={SOCIAL_UI.feed.detailTitle}
      subtitle={SOCIAL_UI.feed.detailSubtitle}
      content={activeDetailEvent ? {
        gameName: activeDetailEvent.gameName,
        reviewText,
        score: Number(activeDetailEvent.rating || 0),
        grade: activeDetailEvent.grade ?? null,
        platforms: gameItem?.platforms,
        genres: gameItem?.genres,
        strengths: gameItem?.strengths,
        weaknesses: gameItem?.weaknesses,
      } : null}
      /* Aquí la firma SÍ lleva avatar y enlace: se llega desde el feed, donde lo que se sigue es a la persona, y
         su perfil está a un clic. Ver `ReviewDetailHead`. */
      author={activeDetailEvent ? {
        name: activeDetailEvent.profileDisplayName,
        photoURL: activeDetailEvent.photoURL,
        onOpen: () => onOpenProfileDetail(activeDetailEvent.profileId),
        openAria: SOCIAL_UI.feed.openProfileAria(activeDetailEvent.profileDisplayName),
      } : null}
      /* Sin fecha válida no se calla: se dice que fue «hace poco». Una reseña sin fecha existe —el canal no
         siempre la trae— y el hueco vacío se leía como un dato perdido. */
      dateLabel={hasValidUpdatedAt && updatedAtDate
        ? SOCIAL_UI.feed.analyzedAt(updatedAtDate)
        : SOCIAL_UI.feed.analyzedRecently}
      onBack={onBack}
      backLabel={backLabel || SOCIAL_UI.feed.backToFeed}
      status={status}
      statusKind={statusKind}
      actions={shareable && gameItem && reviewText
        ? <ShareReviewButton game={gameItem} reviewText={reviewText} />
        : null}
      related={related}
      coversAllowed={coversAllowed}
      screenLoading={eventLoading}
      bodyLoading={bodyLoading}
      previewOnly={previewOnly}
      missingLabel={SOCIAL_UI.feed.detailMissing}
    />
  );
}
