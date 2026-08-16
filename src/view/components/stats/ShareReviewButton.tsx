import { memo, useCallback, useEffect, useState } from 'react';
import { SHARE_UI } from '../../../core/constants/labels';
import { Icon } from '../Icon';
import { ShareReviewModal } from '../../modals/ShareReviewModal';
import { useShareViewModel } from '../../../viewmodel/useShareViewModel';
import type { GameItem } from '../../../model/types/game';

/**
 * Botón "Compartir" del detalle de TU reseña, con su diálogo.
 *
 * Se monta solo en el panel de estadísticas (`StatsReviews`), nunca en el hub social: allí la reseña es de otra
 * persona y no hay nada que compartir. Trae su propio estado en vez de subirlo al panel porque nadie más lo
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
    }
  }, [game, reviewText, vm]);

  const close = useCallback(() => {
    setOpen(false);
    setPublishedUrl('');
    vm.clearError();
  }, [vm]);

  if (vm.ban) {
    return (
      <span className="hub-feed-game-chip share-banned" title={SHARE_UI.bannedReason(vm.ban.reason || '')}>
        {SHARE_UI.bannedTitle}
      </span>
    );
  }

  return (
    <>
      <button className="btn btn-secondary" type="button" onClick={() => setOpen(true)} aria-label={SHARE_UI.actionAria}>
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
        onCancel={close}
        onConfirm={confirm}
      />
    </>
  );
});
