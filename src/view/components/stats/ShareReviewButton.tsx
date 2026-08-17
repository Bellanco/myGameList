import { memo, useCallback, useEffect, useState } from 'react';
import { SHARE_UI } from '../../../core/constants/labels';
import { Icon } from '../Icon';
import { ShareReviewModal } from '../../modals/ShareReviewModal';
import { useShareViewModel } from '../../../viewmodel/useShareViewModel';
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
 */
export const ShareReviewButton = memo(function ShareReviewButton({ game, reviewText }: { game: GameItem; reviewText: string }) {
  const vm = useShareViewModel();
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
    const published = await vm.share({
      gameId: game.id,
      gameName: String(game.name || '').trim(),
      grade: typeof game.grade === 'number' ? game.grade : null,
      rating: typeof game.score === 'number' ? game.score : null,
      review: reviewText,
      platforms: game.platforms || [],
      genres: game.genres || [],
      strengths: game.strengths || [],
      weaknesses: game.weaknesses || [],
      reviewedAt: Number(game.reviewedAt) || Number(game._ts) || 0,
    });
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
    const current = vm.shareOf(game.id);
    setPublishedUrl(current ? `${window.location.origin}/r/${current.token}` : '');
    setPublishedExpiresAt(current?.expiresAt || 0);
    setRenewed(false);
    setOpen(true);
  }, [game.id, vm]);

  const close = useCallback(() => {
    setOpen(false);
    setPublishedUrl('');
    setPublishedExpiresAt(0);
    setRenewed(false);
    vm.clearError();
  }, [vm]);

  // Mientras no se sabe si hay sesión (`null`) no se pinta nada: enseñar el botón y quitarlo medio segundo
  // después es peor que esperar.
  if (vm.available === null) {
    return null;
  }

  // Sin sesión de Google no se ofrece el botón: publicar exige identidad y solo llevaría a un error. Pero
  // desaparecer en silencio dejaba al usuario buscando un botón que no está —el síntoma que se reportó—, así que
  // se dice qué falta. Mismo tratamiento visual que el veto: un distintivo, no un botón que no lleva a nada.
  if (vm.available === false) {
    return (
      <span className="hub-feed-game-chip share-unavailable" title={SHARE_UI.signInRequiredHint}>
        {SHARE_UI.signInRequired}
      </span>
    );
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
      <button className="btn btn-secondary" type="button" onClick={openDialog} aria-label={SHARE_UI.actionAria}>
        <Icon name="share-nodes" />
        <span>{existing ? SHARE_UI.shared : SHARE_UI.action}</span>
      </button>
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
