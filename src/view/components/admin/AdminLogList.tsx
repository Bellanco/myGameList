import { memo, useState } from 'react';
import { ADMIN_SHELL_UI } from '../../../core/constants/adminLabels';
import { localDayKey } from '../../../core/admin/communityStats';
import { createLocalDateFormat } from '../../../core/utils/dateTime';
import type { AdminLogEntry, AdminLogKind } from '../../../model/repository/admin/adminPanelStore';
import { Icon } from '../Icon';
import { useAdminPanel } from './AdminPanelContext';

const G = ADMIN_SHELL_UI.log;
const TIME = createLocalDateFormat({ hour: '2-digit', minute: '2-digit' });
const DAY = createLocalDateFormat({ weekday: 'long', day: 'numeric', month: 'long' });
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Las acciones apuntadas, agrupadas por día, con «Deshacer» en lo reversible. La usan la portada (las últimas) y la
 * pantalla del registro (todas, con filtro por tipo).
 */
export const AdminLogList = memo(function AdminLogList({ limit, kinds }: { limit?: number; kinds?: readonly AdminLogKind[] }) {
  const { log, vm } = useAdminPanel();
  const [busy, setBusy] = useState('');
  if (log.error && !log.entries?.length) return <p className="admin-feedback err">{log.error}</p>;
  if (log.entries === null) return null;
  const visible = log.entries.filter((entry) => !kinds || kinds.includes(entry.kind)).slice(0, limit);
  if (visible.length === 0) return <p className="adm-muted">{G.empty}</p>;

  const now = Date.now();
  const today = localDayKey(now);
  const yesterday = localDayKey(now - DAY_MS);
  let lastDay = '';
  const undo = async (entry: AdminLogEntry) => {
    setBusy(entry.id);
    await vm.undoLogged(entry);
    setBusy('');
  };

  return (
    <ul className="adm-log">
      {visible.map((entry) => {
        const day = localDayKey(entry.at);
        const heading = day !== lastDay ? (lastDay = day) : '';
        return (
          <li key={entry.id} className={entry.undone ? 'is-undone' : undefined}>
            {heading ? (
              <span className="adm-log-day">
                {heading === today ? G.today : heading === yesterday ? G.yesterday : DAY.format(new Date(entry.at))}
              </span>
            ) : null}
            <span className="adm-log-row">
              <time dateTime={new Date(entry.at).toISOString()}>{TIME.format(new Date(entry.at))}</time>
              <span className="adm-log-what">
                <b>{entry.text}</b>
                {entry.targetName ? <span>{entry.targetName}</span> : null}
              </span>
              {entry.undo ? (
                <button
                  type="button"
                  className="btn btn-secondary adm-xs"
                  disabled={entry.undone || busy === entry.id}
                  onClick={() => void undo(entry)}
                >
                  <Icon name="undo" />
                  <span>{entry.undone ? G.undoneMark : G.undo}</span>
                </button>
              ) : (
                <span className="adm-log-final">{G.noUndo}</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
});
