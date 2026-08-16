import { memo, useEffect, useState } from 'react';
import { SHARE_UI } from '../../core/constants/labels';
import { Icon } from './Icon';
import { ConfirmModal } from '../modals/ConfirmModal';
import { useShareViewModel } from '../../viewmodel/useShareViewModel';

const DAY_FORMAT = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' });

/** Días que le quedan a un enlace, redondeando hacia arriba: mientras quede algo del día, "caduca en 1 día". */
function daysLeft(expiresAt: number): number {
  return Math.ceil((expiresAt - Date.now()) / 86_400_000);
}

/**
 * Tarjeta de Ajustes con los enlaces públicos que el usuario ha creado.
 *
 * Es el sitio donde se ve TODO junto —cuántos quedan, cuándo caduca cada uno, y el botón de retirar—, porque el
 * distintivo del detalle de una reseña solo habla de esa reseña.
 *
 * Retirar pide confirmación y se llama "Dejar de compartir", nunca "Borrar": deja el enlace inaccesible, pero no
 * recoge las copias que ya circulen. Prometer un borrado sería mentir.
 */
export const SharedReviewsCard = memo(function SharedReviewsCard({ enabled }: { enabled: boolean }) {
  const vm = useShareViewModel();
  const [pending, setPending] = useState<{ token: string; gameName: string } | null>(null);

  useEffect(() => {
    if (enabled) {
      void vm.refresh();
    }
    // Solo al montar (y si hay sesión): esta tarjeta no necesita repescar en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  return (
    <div className="settings-card settings-card-shares">
      <div className="settings-card-head">
        <h2>{SHARE_UI.screenTitle}</h2>
        <p className="settings-card-note">{SHARE_UI.screenSubtitle}</p>
      </div>

      {vm.ban ? (
        <div className="settings-shares-banned">
          <p>
            <strong>{SHARE_UI.bannedTitle}</strong>
          </p>
          <p>{SHARE_UI.bannedReason(vm.ban.reason || '')}</p>
        </div>
      ) : null}

      {vm.quota ? <p className="settings-shares-counter">{SHARE_UI.counter(vm.shares.length, vm.quota.maxActive)}</p> : null}

      {vm.shares.length === 0 ? (
        <p className="settings-shares-empty">{SHARE_UI.screenEmpty}</p>
      ) : (
        <ul className="settings-shares-list">
          {vm.shares.map((entry) => (
            <li key={entry.token} className="settings-shares-item">
              <div className="settings-shares-item-text">
                <strong>{entry.gameName}</strong>
                <span>
                  {DAY_FORMAT.format(new Date(entry.createdAt))} · {SHARE_UI.expiresIn(daysLeft(entry.expiresAt))}
                </span>
              </div>
              <div className="settings-shares-item-actions">
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}/r/${entry.token}`)}
                >
                  <Icon name="sync-copy" />
                  <span>{SHARE_UI.copyLink}</span>
                </button>
                <button
                  className="btn btn-danger"
                  type="button"
                  disabled={vm.busyToken === entry.token}
                  onClick={() => setPending({ token: entry.token, gameName: entry.gameName })}
                >
                  {vm.busyToken === entry.token ? SHARE_UI.revoking : SHARE_UI.revoke}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {vm.error ? <p className="settings-shares-error">{vm.error}</p> : null}

      <ConfirmModal
        open={Boolean(pending)}
        title={pending ? `${SHARE_UI.revoke}: ${pending.gameName}` : ''}
        confirmLabel={SHARE_UI.revoke}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const token = pending?.token || '';
          setPending(null);
          void vm.revoke(token);
        }}
      />
    </div>
  );
});
