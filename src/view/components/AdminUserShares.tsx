import { memo, useEffect, useState } from 'react';
import { ADMIN_SHARES_UI } from '../../core/constants/adminLabels';
import {
  PROFILE_TIER_LABELS,
  PROFILE_TIER_SHARE_MAX_ACTIVE,
  PROFILE_TIER_SHARE_TTL_DAYS,
  type ProfileTier,
  type ShareQuota,
} from '../../core/constants/tiers';
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
  tier,
  quota,
  hasOverride,
  onConfirm,
  onRemove,
  onBan,
  onUnban,
  onQuota,
  onQuotaClear,
}: {
  uid: string;
  shares: AdminShareRow[];
  banned: boolean;
  /** Rango del perfil: decide el tope de los dos campos y se nombra en los textos. */
  tier: ProfileTier;
  /** Cuota que el usuario tiene AHORA (rango ya resuelto con su ajuste individual, si lo tiene). */
  quota: ShareQuota;
  /** ¿Esa cuota viene de un ajuste individual? Decide si se ofrece devolverle la de su rango. */
  hasOverride: boolean;
  onConfirm: (request: ShareActionRequest) => void;
  onRemove: (token: string) => Promise<void>;
  onBan: (uid: string, options: { reason: string; purge: boolean }) => Promise<void>;
  onUnban: (uid: string) => Promise<void>;
  onQuota: (uid: string, values: { maxActive: number; ttlDays: number }) => Promise<void>;
  onQuotaClear: (uid: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [purge, setPurge] = useState(false);
  // Los campos de cuota arrancan con lo que el usuario tiene puesto, no a cero: a cero no se sabía desde qué
  // valor se estaba cambiando, y aplicar significaba escribir dos números a ciegas.
  const [maxActive, setMaxActive] = useState(String(quota.maxActive));
  const [ttlDays, setTtlDays] = useState(String(quota.ttlDays));

  // Tras aplicar (o quitar) el ajuste, el panel recarga el censo y la cuota llega cambiada: el formulario tiene
  // que seguirla, o se quedaría enseñando lo que se acaba de sustituir.
  useEffect(() => {
    setMaxActive(String(quota.maxActive));
    setTtlDays(String(quota.ttlDays));
  }, [quota.maxActive, quota.ttlDays]);

  const tierLabel = PROFILE_TIER_LABELS[tier];
  // El tope es el de SU rango, no el techo absoluto: el ajuste individual sirve para recortar, y para dar más
  // está el rango. Es una regla de interfaz — el servidor recorta al techo (`resolveShareQuota`), no al rango.
  const maxActiveCeiling = PROFILE_TIER_SHARE_MAX_ACTIVE[tier];
  const ttlDaysCeiling = PROFILE_TIER_SHARE_TTL_DAYS[tier];
  const nextMaxActive = Math.floor(Number(maxActive));
  const nextTtlDays = Math.floor(Number(ttlDays));
  const maxActiveOver = nextMaxActive > maxActiveCeiling;
  const ttlDaysOver = nextTtlDays > ttlDaysCeiling;
  // Un campo vacío, a cero o por encima del rango no se puede aplicar: el servidor descartaría el valor y caería
  // al del rango sin decir nada, que es justo la sorpresa que este bloque tiene que evitar.
  const quotaValid =
    Number.isFinite(nextMaxActive) && nextMaxActive > 0 && !maxActiveOver &&
    Number.isFinite(nextTtlDays) && nextTtlDays > 0 && !ttlDaysOver;

  return (
    <div className="admin-user-shares">
      <div className="admin-user-shares-head">
        <button className="btn btn-secondary" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {ADMIN_SHARES_UI.toggle(shares.length, quota.maxActive)}
        </button>
        {/* Al límite se dice, sin desplegar: es lo que explica que esa persona no pueda compartir nada más. */}
        {shares.length >= quota.maxActive ? <span className="admin-user-full">{ADMIN_SHARES_UI.full}</span> : null}
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

          {/* Cuota individual, editada sobre lo que el usuario tiene ahora y acotada a lo que da su rango. Quitar
              el ajuste ya no es "los dos campos a cero": es un botón que lo dice, y solo aparece si hay algo que
              quitar. */}
          <div className="admin-user-shares-form admin-user-quota" role="group" aria-label={ADMIN_SHARES_UI.quotaTitle}>
            <span className="admin-field-label">{ADMIN_SHARES_UI.quotaTitle}</span>
            <p className="admin-card-note">
              {hasOverride ? ADMIN_SHARES_UI.quotaFromOverride : ADMIN_SHARES_UI.quotaFromTier(tierLabel)}
            </p>
            <label>
              <span>{ADMIN_SHARES_UI.quotaMaxLabel}</span>
              <input
                type="number"
                min="1"
                max={maxActiveCeiling}
                className="input-base"
                value={maxActive}
                onChange={(event) => setMaxActive(event.target.value)}
              />
              <small>{ADMIN_SHARES_UI.quotaCeiling(maxActiveCeiling, tierLabel)}</small>
            </label>
            <label>
              <span>{ADMIN_SHARES_UI.quotaDaysLabel}</span>
              <input
                type="number"
                min="1"
                max={ttlDaysCeiling}
                className="input-base"
                value={ttlDays}
                onChange={(event) => setTtlDays(event.target.value)}
              />
              <small>{ADMIN_SHARES_UI.quotaCeiling(ttlDaysCeiling, tierLabel)}</small>
            </label>
            {/* El `max` del campo no frena a quien escribe el número a mano: el aviso dice por qué no se aplica. */}
            {maxActiveOver || ttlDaysOver ? (
              <p className="admin-warning">
                {ADMIN_SHARES_UI.quotaOverLimit(maxActiveOver ? maxActiveCeiling : ttlDaysCeiling, tierLabel)}
              </p>
            ) : null}
            <button
              className="btn btn-secondary"
              type="button"
              disabled={!quotaValid}
              onClick={() =>
                onConfirm({
                  title: ADMIN_SHARES_UI.confirmQuota(nextMaxActive, nextTtlDays),
                  run: () => onQuota(uid, { maxActive: nextMaxActive, ttlDays: nextTtlDays }),
                })
              }
            >
              {ADMIN_SHARES_UI.quota}
            </button>
            {hasOverride ? (
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => onConfirm({ title: ADMIN_SHARES_UI.confirmQuotaClear, run: () => onQuotaClear(uid) })}
              >
                {ADMIN_SHARES_UI.quotaClear}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
});
