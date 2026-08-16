import { memo, useCallback, useEffect, useState } from 'react';
import { ADMIN_SHARES_UI } from '../../core/constants/labels';
import { ConfirmModal } from '../modals/ConfirmModal';
import {
  adminRemoveShare,
  banUser,
  clearQuotaOverride,
  listAllShares,
  setQuotaOverride,
  unbanUser,
  type AdminShareRow,
} from '../../model/repository/shareAdminRepository';

const DATE_FORMAT = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' });

type PendingAction = { title: string; run: () => Promise<void> } | null;

/**
 * Censo de enlaces compartidos, con las tres acciones de moderación: retirar un enlace, vetar a un autor y
 * ajustarle la cuota.
 *
 * POR QUÉ EXISTE: con los enlaces públicos, el dominio pasa a alojar texto escrito por usuarios. Eso es una
 * superficie de abuso nueva (spam o phishing con la credibilidad del dominio propio) y tiene que poder atajarse
 * sin desplegar código.
 *
 * Vetar y retirar son decisiones SEPARADAS —el veto impide publicar de nuevo; lo ya publicado solo desaparece si
 * se marca la purga—, porque el problema puede ser la persona, el contenido o ambos.
 */
export const AdminSharesSection = memo(function AdminSharesSection() {
  const [rows, setRows] = useState<AdminShareRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filterUid, setFilterUid] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<PendingAction>(null);

  const load = useCallback(async (options: { cursor?: string; uid?: string; append?: boolean } = {}) => {
    setLoading(true);
    setError('');
    try {
      const page = await listAllShares({ cursor: options.cursor, uid: options.uid });
      setRows((current) => (options.append ? [...current, ...page.shares] : page.shares));
      setCursor(page.cursor);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : ADMIN_SHARES_UI.failed);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (action: () => Promise<string>) => {
      setError('');
      try {
        setNotice(await action());
        await load({ uid: filterUid || undefined });
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : ADMIN_SHARES_UI.failed);
      }
    },
    [filterUid, load],
  );

  const askRemove = (row: AdminShareRow) =>
    setPending({
      title: ADMIN_SHARES_UI.confirmRemove(row.gameName),
      run: () => run(async () => {
        await adminRemoveShare(row.token);
        return ADMIN_SHARES_UI.removed;
      }),
    });

  const askBan = (row: AdminShareRow, purge: boolean) =>
    setPending({
      title: purge ? ADMIN_SHARES_UI.confirmBanPurge : ADMIN_SHARES_UI.confirmBan,
      run: () => run(async () => {
        const reason = window.prompt(ADMIN_SHARES_UI.reasonPrompt) || '';
        const purged = await banUser(row.uid, { reason, purge });
        return ADMIN_SHARES_UI.banned(purged);
      }),
    });

  const askQuota = (row: AdminShareRow) =>
    setPending({
      title: ADMIN_SHARES_UI.confirmQuota,
      run: () => run(async () => {
        const maxActive = Number(window.prompt(ADMIN_SHARES_UI.quotaMaxPrompt) || 0);
        const ttlDays = Number(window.prompt(ADMIN_SHARES_UI.quotaDaysPrompt) || 0);
        if (maxActive <= 0 && ttlDays <= 0) {
          // Sin ningún valor válido, la lectura natural es "quítale el ajuste": el endpoint rechazaría un
          // ajuste vacío, así que se traduce a lo que el administrador quiere decir.
          await clearQuotaOverride(row.uid);
          return ADMIN_SHARES_UI.quotaCleared;
        }
        await setQuotaOverride(row.uid, {
          ...(maxActive > 0 ? { maxActive } : {}),
          ...(ttlDays > 0 ? { ttlDays } : {}),
        });
        return ADMIN_SHARES_UI.quotaSet;
      }),
    });

  return (
    <section className="admin-shares" aria-label={ADMIN_SHARES_UI.title}>
      <header className="admin-shares-head">
        <h3>{ADMIN_SHARES_UI.title}</h3>
        <p>{ADMIN_SHARES_UI.subtitle}</p>
      </header>

      <div className="admin-shares-filter">
        <input
          type="search"
          value={filterUid}
          placeholder={ADMIN_SHARES_UI.filterPlaceholder}
          aria-label={ADMIN_SHARES_UI.filterPlaceholder}
          onChange={(event) => setFilterUid(event.target.value.trim())}
        />
        <button className="btn btn-secondary" type="button" onClick={() => void load({ uid: filterUid || undefined })}>
          {ADMIN_SHARES_UI.filterApply}
        </button>
        <button className="btn btn-secondary" type="button" onClick={() => void unbanFlow(setNotice, setError)}>
          {ADMIN_SHARES_UI.unban}
        </button>
      </div>

      {notice ? <p className="admin-shares-notice">{notice}</p> : null}
      {error ? <p className="admin-shares-error">{error}</p> : null}

      {rows.length === 0 && !loading ? <p>{ADMIN_SHARES_UI.empty}</p> : null}

      <ul className="admin-shares-list">
        {rows.map((row) => (
          <li key={row.token} className="admin-shares-item">
            <div className="admin-shares-item-text">
              <strong>{row.gameName}</strong>
              <span className="admin-shares-uid">{row.uid}</span>
              <span>
                {DATE_FORMAT.format(new Date(row.createdAt))} · {ADMIN_SHARES_UI.expires(new Date(row.expiresAt))}
              </span>
              <a href={`/r/${row.token}`} target="_blank" rel="noreferrer">
                {ADMIN_SHARES_UI.open}
              </a>
            </div>
            <div className="admin-shares-item-actions">
              <button className="btn btn-secondary" type="button" onClick={() => askQuota(row)}>
                {ADMIN_SHARES_UI.quota}
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => askBan(row, false)}>
                {ADMIN_SHARES_UI.ban}
              </button>
              <button className="btn btn-danger" type="button" onClick={() => askBan(row, true)}>
                {ADMIN_SHARES_UI.banPurge}
              </button>
              <button className="btn btn-danger" type="button" onClick={() => askRemove(row)}>
                {ADMIN_SHARES_UI.remove}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {cursor ? (
        <button className="btn btn-secondary" type="button" disabled={loading} onClick={() => void load({ cursor, uid: filterUid || undefined, append: true })}>
          {ADMIN_SHARES_UI.more}
        </button>
      ) : null}

      <ConfirmModal
        open={Boolean(pending)}
        title={pending?.title || ''}
        confirmLabel={ADMIN_SHARES_UI.confirm}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const action = pending?.run;
          setPending(null);
          void action?.();
        }}
      />
    </section>
  );
});

/** Levantar un veto es la única acción que no cuelga de una fila: el usuario vetado puede no tener enlaces. */
async function unbanFlow(setNotice: (value: string) => void, setError: (value: string) => void): Promise<void> {
  const uid = window.prompt(ADMIN_SHARES_UI.unbanPrompt) || '';
  if (!uid.trim()) {
    return;
  }
  try {
    await unbanUser(uid.trim());
    setNotice(ADMIN_SHARES_UI.unbanned);
  } catch (problem) {
    setError(problem instanceof Error ? problem.message : ADMIN_SHARES_UI.failed);
  }
}
