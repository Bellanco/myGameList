import { memo, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { SHARE_UI } from '../../../core/constants/shareLabels';
import { Icon } from '../Icon';
import { ShareReviewModal } from '../../modals/ShareReviewModal';
import { shareDraftOf, useShareViewModel } from '../../../viewmodel/useShareViewModel';
import { markShareTipSeen, readShareTipSeen, shareInviteStore } from '../../../model/repository/shareInviteStore';
import type { GameItem } from '../../../model/types/game';

/**
 * Botón "Compartir" del detalle de TU reseña, con su diálogo.
 *
 * Se monta donde la reseña abierta es TUYA: el panel de estadísticas (`StatsReviews`) y, en el hub social, el
 * detalle de tu propia actividad y el de tus reseñas vistas desde tu perfil. Sobre una reseña ajena no aparece:
 * no hay nada propio que publicar. Trae su propio estado en vez de subirlo a quien lo monta porque nadie más lo
 * necesita, y así el resto de la app no carga con esto.
 *
 * El estado del enlace se pide al abrir el detalle, no al arrancar la app: quien nunca comparte no hace ni una
 * petición.
 *
 * `onSocialInvite`: quien lo monta sabe enseñar por qué compartir es de lo social (la burbuja de la guía). Sin él,
 * a quien no tiene lo social no se le ofrece nada.
 */
export const ShareReviewButton = memo(function ShareReviewButton({
  game,
  reviewText,
  onSocialInvite,
}: {
  game: GameItem;
  reviewText: string;
  onSocialInvite?: () => void;
}) {
  const vm = useShareViewModel();
  const inviteDeclined = useSyncExternalStore(shareInviteStore.subscribe, shareInviteStore.get, shareInviteStore.get);
  /** ¿Toca la marca «Nuevo»? Se decide una vez, al montar: es de una sola vez por dispositivo. */
  const [tipPending, setTipPending] = useState(() => !readShareTipSeen());
  const closeTip = useCallback(() => {
    markShareTipSeen();
    setTipPending(false);
  }, []);
  const [open, setOpen] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState('');
  const [renewed, setRenewed] = useState(false);
  const [publishedExpiresAt, setPublishedExpiresAt] = useState(0);

  useEffect(() => {
    void vm.refresh();
    // Solo al montar: el detalle de una reseña ya se remonta al cambiar de juego.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const existing = vm.shareOf(game.id);

  /**
   * Consejo cuando el error es "no te quedan enlaces". El servidor manda la cuota y cuándo caduca el más antiguo;
   * aquí se traduce a lo que el usuario puede HACER, que es lo que convierte el error en algo útil.
   */
  const quotaHint = (() => {
    const max = Number((vm.errorDetails.quota as { maxActive?: number } | undefined)?.maxActive || 0);
    if (!max) {
      return '';
    }
    const oldest = Number(vm.errorDetails.oldestExpiresAt || 0);
    const days = oldest > 0 ? Math.max(0, Math.ceil((oldest - Date.now()) / 86_400_000)) : 0;
    return `${SHARE_UI.quotaReached(max)} ${SHARE_UI.quotaHint(days)}`;
  })();
  // Días que le quedan al enlace, redondeados hacia arriba: "caduca en 1 día" mientras quede algo de ese día.
  const daysLeft = existing ? Math.ceil((existing.expiresAt - Date.now()) / 86_400_000) : 0;

  const confirm = useCallback(async () => {
    const published = await vm.share(shareDraftOf(game, reviewText));
    if (published) {
      setPublishedUrl(published.url);
      setRenewed(published.renewed);
      setPublishedExpiresAt(published.expiresAt);
    }
  }, [game, reviewText, vm]);

  /**
   * Abre el diálogo. Si la reseña YA está compartida, entra directamente en la vista del enlace: se enseña el que
   * existe, no una pantalla de "publicar" que haría pensar que se va a crear otro. Renovar es entonces una opción
   * más, no el camino por defecto.
   */
  const openDialog = useCallback(() => {
    // Quien pulsa ya lo ha descubierto: la marca que lo señala sobra.
    if (tipPending) closeTip();
    const current = vm.shareOf(game.id);
    setPublishedUrl(current ? `${window.location.origin}/r/${current.token}` : '');
    setPublishedExpiresAt(current?.expiresAt || 0);
    setRenewed(false);
    setOpen(true);
  }, [closeTip, game.id, tipPending, vm]);

  const close = useCallback(() => {
    setOpen(false);
    setPublishedUrl('');
    setPublishedExpiresAt(0);
    setRenewed(false);
    vm.clearError();
  }, [vm]);

  /**
   * LA MARCA «NUEVO», una sola vez por dispositivo, a quien ya tenía lo social y nunca ha compartido: no pasó por la
   * guía, y nada le señalaba el botón. Es el chip de cada tema (`hub-feed-game-chip`) y no una burbuja de la guía,
   * que tiene una forma propia y genérica (decisión del 12-10-2026). Con la lista de sus enlaces ya cargada
   * (`quota`), para no enseñársela un instante a quien sí tiene alguno, y solo junto al botón de verdad.
   */
  const showTip = vm.available === true && !vm.ban && !vm.serviceDown
    && tipPending && !open && vm.quota !== null && vm.shares.length === 0 && !existing;
  // UNA SOLA VEZ DE VERDAD: se da por vista en cuanto sale. Quien no la pulsa y se va a otra reseña ya la ha visto,
  // y no se le vuelve a enseñar; en esta se queda hasta que pulse el botón.
  useEffect(() => {
    if (showTip) markShareTipSeen();
  }, [showTip]);

  // Mientras no se sabe si hay sesión (`null`) no se pinta nada: enseñar el botón y quitarlo medio segundo
  // después es peor que esperar.
  if (vm.available === null) {
    return null;
  }

  // Sin sesión de Google no se ofrece el botón: publicar exige identidad y solo llevaría a un error. Pero
  // desaparecer en silencio dejaba al usuario buscando un botón que no está —el síntoma que se reportó—, así que
  // se dice qué falta. Mismo tratamiento visual que el veto: un distintivo, no un botón que no lleva a nada.
  //
  // A quien nunca ha abierto el espacio social (`hasSocialSpace` falso) un distintivo de «falta la sesión» le
  // hablaría de algo que no conoce. A esa persona se le ofrece el botón de siempre, y al pulsarlo la guía le cuenta
  // que compartir es de lo social y le ofrece el camino (12-10-2026): sin él, no había forma de saber que existía.
  // Si a eso contesta «Ahora no», el botón se va de este dispositivo (`shareInviteStore`): sin lo social no hace
  // nada, y quedarse a la vista tras un no es dejar un botón inservible.
  if (vm.available === false) {
    if (vm.hasSocialSpace) {
      return (
        <span className="hub-feed-game-chip share-unavailable" title={SHARE_UI.signInRequiredHint}>
          {SHARE_UI.signInRequired}
        </span>
      );
    }
    return onSocialInvite && !inviteDeclined ? (
      <button className="btn btn-secondary" type="button" data-tour="share-review" onClick={onSocialInvite} aria-label={SHARE_UI.actionAria}>
        <Icon name="share-nodes" />
        <span>{SHARE_UI.action}</span>
      </button>
    ) : null;
  }

  // El servicio de compartir no atiende (cupo agotado, caído): no se ofrece, igual que si no existiera. Con el
  // diálogo ya abierto se deja, porque es ahí donde se explica que no se ha podido (docs/plan-degradacion-servicios.md).
  if (vm.serviceDown && !open) {
    return null;
  }

  if (vm.ban) {
    return (
      <span className="hub-feed-game-chip share-banned" title={SHARE_UI.bannedReason(vm.ban.reason || '')}>
        {SHARE_UI.bannedTitle}
      </span>
    );
  }


  return (
    <>
      {/* Envuelto SIEMPRE, con marca o sin ella: si el envoltorio apareciera y se fuera con la marca, el botón se
          volvería a montar al pulsarlo y el foco no tendría a dónde volver al cerrar el diálogo. */}
      <span className="share-action">
        <button className="btn btn-secondary" type="button" data-tour="share-review" onClick={openDialog} aria-label={SHARE_UI.actionAria}>
          <Icon name="share-nodes" />
          <span>{existing ? SHARE_UI.shared : SHARE_UI.action}</span>
        </button>
        {showTip ? (
          <span className="share-new-slot">
            <span className="hub-feed-game-chip share-new">{SHARE_UI.newBadge}</span>
          </span>
        ) : null}
      </span>
      {existing ? <span className="share-expiry">{SHARE_UI.expiresIn(daysLeft)}</span> : null}
      <ShareReviewModal
        open={open}
        gameName={String(game.name || '')}
        quota={vm.quota}
        nick={vm.nick}
        nickIsAccountName={vm.nickIsAccountName}
        publishing={vm.loading}
        error={vm.error}
        errorHint={quotaHint}
        publishedUrl={publishedUrl}
        renewed={renewed}
        expiresAt={publishedExpiresAt}
        onCancel={close}
        onConfirm={confirm}
        // Renovar es el MISMO camino que publicar: el servidor reescribe sobre el token que ya existe. Solo se
        // ofrece cuando hay algo que renovar.
        onRenew={existing ? () => void confirm() : undefined}
      />
    </>
  );
});
