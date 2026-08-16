import { memo, useState } from 'react';
import { ADMIN_SHARES_UI } from '../../core/constants/labels';
import type { AdminShareRow } from '../../model/repository/shareAdminRepository';

const DAY_FORMAT = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' });

export interface ShareActionRequest {
  title: string;
  run: () => void | Promise<void>;
}

/**
 * Bloque de enlaces compartidos DENTRO de la ficha de un usuario del panel.
 *
 * Va aquí y no en una sección aparte porque la pregunta del administrador nunca es "¿qué enlaces hay?", sino
 * "¿qué ha publicado ESTA persona?": llega un aviso sobre alguien, se le busca, y lo suyo tiene que estar en su
 * ficha, junto a su rango y sus anomalías.
 *
 * NINGUNA acción se ejecuta al pulsar: todas piden confirmación con el mismo modal que el resto del panel
 * (`onConfirm`), porque aquí se retira contenido de otra persona y un clic de más no puede tener efectos.
 */
export const AdminUserShares = memo(function AdminUserShares({
  uid,
  shares,
  banned,
  onConfirm,
  onRemove,
  onBan,
  onUnban,
  onQuota,
}: {
  uid: string;
  shares: AdminShareRow[];
  banned: boolean;
  onConfirm: (request: ShareActionRequest) => void;
  onRemove: (token: string) => Promise<void>;
  onBan: (uid: string, options: { reason: string; purge: boolean }) => Promise<void>;
  onUnban: (uid: string) => Promise<void>;
  onQuota: (uid: string, values: { maxActive: number; ttlDays: number }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [purge, setPurge] = useState(false);
  const [maxActive, setMaxActive] = useState('');
  const [ttlDays, setTtlDays] = useState('');

  return (
    <div className="admin-user-shares">
      <div className="admin-user-shares-head">
        <button className="btn btn-secondary" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {ADMIN_SHARES_UI.toggle(shares.length)}
        </button>
        {banned ? <span className="admin-user-banned">{ADMIN_SHARES_UI.bannedBadge}</span> : null}
      </div>

      {open ? (
        <div className="admin-user-shares-body">
          {shares.length === 0 ? (
            <p className="admin-user-shares-empty">{ADMIN_SHARES_UI.empty}</p>
          ) : (
            <ul className="admin-user-shares-list">
              {shares.map((row) => (
                <li key={row.token}>
                  <div className="admin-user-shares-item-text">
                    <strong>{row.gameName}</strong>
                    <span>
                      {DAY_FORMAT.format(new Date(row.createdAt))} · {ADMIN_SHARES_UI.expires(new Date(row.expiresAt))}
                    </span>
                  </div>
                  <div className="admin-user-shares-item-actions">
                    <a className="btn btn-secondary" href={`/r/${row.token}`} target="_blank" rel="noreferrer">
                      {ADMIN_SHARES_UI.open}
                    </a>
                    <button
                      className="btn btn-danger"
                      type="button"
                      onClick={() =>
                        onConfirm({ title: ADMIN_SHARES_UI.confirmRemove(row.gameName), run: () => onRemove(row.token) })
                      }
                    >
                      {ADMIN_SHARES_UI.remove}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Veto. El motivo lo lee el usuario en su pantalla de Ajustes, así que se escribe aquí y no en un
              cuadro del navegador: se puede revisar antes de confirmar. */}
          <div className="admin-user-shares-form">
            {banned ? (
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => onConfirm({ title: ADMIN_SHARES_UI.confirmUnban, run: () => onUnban(uid) })}
              >
                {ADMIN_SHARES_UI.unban}
              </button>
            ) : (
              <>
                <label>
                  <span>{ADMIN_SHARES_UI.reasonLabel}</span>
                  <input
                    type="text"
                    className="input-base"
                    value={reason}
                    maxLength={500}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                <label className="admin-user-shares-check">
                  <input type="checkbox" checked={purge} onChange={(event) => setPurge(event.target.checked)} />
                  <span>{ADMIN_SHARES_UI.purgeLabel}</span>
                </label>
                <button
                  className="btn btn-danger"
                  type="button"
                  onClick={() =>
                    onConfirm({
                      title: purge ? ADMIN_SHARES_UI.confirmBanPurge : ADMIN_SHARES_UI.confirmBan,
                      run: () => onBan(uid, { reason, purge }),
                    })
                  }
                >
                  {ADMIN_SHARES_UI.ban}
                </button>
              </>
            )}
          </div>

          {/* Cuota individual. Vacío o 0 = "no tocar ese campo"; los dos a la vez = volver a la cuota del rango. */}
          <div className="admin-user-shares-form">
            <label>
              <span>{ADMIN_SHARES_UI.quotaMaxLabel}</span>
              <input
                type="number"
                min="0"
                className="input-base"
                value={maxActive}
                onChange={(event) => setMaxActive(event.target.value)}
              />
            </label>
            <label>
              <span>{ADMIN_SHARES_UI.quotaDaysLabel}</span>
              <input
                type="number"
                min="0"
                className="input-base"
                value={ttlDays}
                onChange={(event) => setTtlDays(event.target.value)}
              />
            </label>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() =>
                onConfirm({
                  title: Number(maxActive) > 0 || Number(ttlDays) > 0 ? ADMIN_SHARES_UI.confirmQuota : ADMIN_SHARES_UI.confirmQuotaClear,
                  run: () => onQuota(uid, { maxActive: Number(maxActive) || 0, ttlDays: Number(ttlDays) || 0 }),
                })
              }
            >
              {ADMIN_SHARES_UI.quota}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
});
