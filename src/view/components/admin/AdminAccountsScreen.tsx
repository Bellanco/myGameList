import { Fragment, memo, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminUserPath } from '../../../core/admin/adminRoutes';
import { ADMIN_PANEL_UI, ADMIN_SHELL_UI } from '../../../core/constants/adminLabels';
import { createLocalDateFormat } from '../../../core/utils/dateTime';
import type { AdminAccountView } from '../../../viewmodel/useAdminAccounts';
import { Icon } from '../Icon';
import { HubAvatar } from '../socialhub/HubAvatar';
import { useAdminPanel } from './AdminPanelContext';

const A = ADMIN_PANEL_UI;
const C = ADMIN_SHELL_UI.accounts;
const DAY_FORMAT = createLocalDateFormat({ dateStyle: 'medium' });

type AccountFilter = 'all' | 'expired' | 'expiring' | 'no-profile';
const FILTERS: AccountFilter[] = ['all', 'expired', 'expiring', 'no-profile'];

function matches(account: AdminAccountView, filter: AccountFilter): boolean {
  if (filter === 'expired') return account.verdict.state === 'expired';
  if (filter === 'expiring') return account.verdict.state === 'expiring';
  if (filter === 'no-profile') return account.profile === null;
  return true;
}

function nameOf(account: AdminAccountView): string {
  return account.displayName.trim() || C.noName;
}

function expiryOf(account: AdminAccountView): string {
  const { verdict } = account;
  if (verdict.protection === 'admin') return C.protectedAdmin;
  if (verdict.protection === 'ballot') return C.protectedBallot;
  if (!verdict.expiresAt) return C.noDate;
  const day = DAY_FORMAT.format(new Date(verdict.expiresAt));
  return verdict.state === 'expired' ? C.expiredOn(day) : C.expiresOn(day);
}

/**
 * CUENTAS: todas las de Firebase Auth, con espacio social o sin él, y cuándo caduca cada una por falta de uso
 * (docs/plan-cuentas-inactivas.md). El censo de Usuarios sale de `profiles`, así que quien solo entró con Google no
 * aparecía en ningún sitio del panel. Las caducadas se borran desde aquí, con confirmación: no hay tarea programada.
 *
 * El correo no sale en la tabla: solo al desplegar la fila (decisión del usuario, 15-10-2026).
 */
export const AdminAccountsScreen = memo(function AdminAccountsScreen() {
  const { accounts, vm, notify, confirm, copyUid } = useAdminPanel();
  const [filter, setFilter] = useState<AccountFilter>('all');
  const [openUid, setOpenUid] = useState('');
  const list = accounts.accounts;
  const census = accounts.census;

  const counts = useMemo(
    () => ({
      all: list.length,
      expired: accounts.expired.length,
      expiring: accounts.expiring.length,
      'no-profile': list.filter((account) => account.profile === null).length,
    }),
    [list, accounts.expired.length, accounts.expiring.length],
  );
  const social = useMemo(() => list.filter((account) => account.profile === 'social').length, [list]);
  const visible = useMemo(() => list.filter((account) => matches(account, filter)), [list, filter]);

  const askPurge = () => {
    const targets = accounts.expired;
    confirm({
      title: C.purgeConfirm(targets.length),
      body: C.purgeBody,
      typeToConfirm: C.purgeWord,
      confirmLabel: C.purge(targets.length),
      tone: 'danger',
      run: async () => {
        const summary = await accounts.purge(targets);
        notify(
          summary
            ? { text: C.purgeDone(summary.deleted, summary.skipped, summary.failed), kind: summary.failed > 0 ? 'warn' : 'ok' }
            : { text: C.purgeFailed, kind: 'err' },
        );
        // El censo de Usuarios sale de `profiles`: si se ha borrado alguien con perfil, ya no está.
        if (summary?.deleted) void vm.refresh();
      },
    });
  };

  return (
    <>
      <header className="adm-head">
        <h2>{C.title}</h2>
        <div className="adm-head-aside">
          <button type="button" className="btn btn-secondary adm-sm" disabled={accounts.loading} onClick={() => void accounts.refresh()}>
            <Icon name="refresh" />
            <span>{C.refresh}</span>
          </button>
        </div>
      </header>

      {accounts.status === null || (accounts.loading && !census) ? (
        <section className="adm-card"><p className="adm-muted">{C.loading}</p></section>
      ) : accounts.status === 'not-configured' ? (
        <section className="adm-card">
          <p className="admin-warning"><b>{C.notConfigured}.</b> {C.notConfiguredDetail}</p>
        </section>
      ) : accounts.status === 'failed' ? (
        <section className="adm-card"><p className="admin-feedback err">{C.failed(accounts.failure)}</p></section>
      ) : accounts.status === 'unreachable' && !census ? (
        <section className="adm-card"><p className="admin-warning">{C.unreachable}</p></section>
      ) : census ? (
        <>
          <section className="adm-card" aria-labelledby="adm-a-summary">
            <div className="adm-card-head"><h3 id="adm-a-summary">{C.sections.summary}</h3></div>
            <dl className="adm-kpis">
              <div className="adm-kpi"><dt>{C.kpi.total}</dt><dd className="adm-kpi-val">{list.length}</dd></div>
              <div className="adm-kpi"><dt>{C.kpi.social}</dt><dd className="adm-kpi-val">{social}</dd></div>
              <div className="adm-kpi"><dt>{C.kpi.noProfile}</dt><dd className="adm-kpi-val">{counts['no-profile']}</dd></div>
              <div className={`adm-kpi${counts.expired > 0 ? ' is-bad' : ''}`}><dt>{C.kpi.expired}</dt><dd className="adm-kpi-val">{counts.expired}</dd></div>
              <div className="adm-kpi"><dt>{C.kpi.expiring}</dt><dd className="adm-kpi-val">{counts.expiring}</dd></div>
              {census.orphanProfiles > 0 ? (
                <div className="adm-kpi">
                  <dt>{C.kpi.orphans}</dt>
                  <dd className="adm-kpi-val">{census.orphanProfiles}</dd>
                  <dd className="adm-muted">{C.orphansHint}</dd>
                </div>
              ) : null}
            </dl>
            <p className="adm-muted">{C.rules}</p>
          </section>

          {counts.expired > 0 ? (
            <section className="adm-card" aria-labelledby="adm-a-expired">
              <div className="adm-card-head"><h3 id="adm-a-expired">{C.sections.expired}</h3></div>
              <p className="adm-muted">{C.purgeBody}</p>
              <div className="adm-actions">
                <button type="button" className="btn btn-danger adm-sm" disabled={accounts.purging} onClick={askPurge}>
                  <Icon name="trash" />
                  <span>{accounts.purging ? A.working : C.purge(counts.expired)}</span>
                </button>
              </div>
            </section>
          ) : null}

          {counts.expiring > 0 ? (
            <section className="adm-card" aria-labelledby="adm-a-expiring">
              <div className="adm-card-head"><h3 id="adm-a-expiring">{C.sections.expiring}</h3></div>
              <p className="adm-muted">{C.expiringHint}</p>
            </section>
          ) : null}

          <section className="adm-card" aria-labelledby="adm-a-all">
            <div className="adm-card-head"><h3 id="adm-a-all">{C.sections.all}</h3></div>
            <div className="adm-filter-row" role="group" aria-label={C.sections.all}>
              {FILTERS.map((value) => (
                <button key={value} type="button" className="adm-chip" aria-pressed={filter === value} onClick={() => setFilter(value)}>
                  {value === 'all' ? ADMIN_SHELL_UI.users.signal.all : value === 'expired' ? C.kpi.expired : value === 'expiring' ? C.kpi.expiring : C.kpi.noProfile}
                  <small>{counts[value]}</small>
                </button>
              ))}
            </div>
            {list.length === 0 ? (
              <p>{C.empty}</p>
            ) : (
              <div className="adm-table-wrap">
                <table className="adm-table adm-accounts">
                  <caption className="sr-only">{C.tableCaption}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{C.columns.user}</th>
                      <th scope="col">{C.columns.space}</th>
                      <th scope="col">{C.columns.lastUse}</th>
                      <th scope="col">{C.columns.created}</th>
                      <th scope="col">{C.columns.expires}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((account) => (
                      <AccountRow
                        key={account.uid}
                        account={account}
                        isOwn={account.uid === vm.ownUid}
                        open={openUid === account.uid}
                        now={census.fetchedAt}
                        onToggle={() => setOpenUid((current) => (current === account.uid ? '' : account.uid))}
                        onCopyUid={() => void copyUid(account.uid)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </>
  );
});

const AccountRow = memo(function AccountRow({
  account,
  isOwn,
  open,
  now,
  onToggle,
  onCopyUid,
}: {
  account: AdminAccountView;
  isOwn: boolean;
  open: boolean;
  now: number;
  onToggle: () => void;
  onCopyUid: () => void;
}) {
  const name = nameOf(account);
  const detailsId = `adm-account-${account.uid}`;
  const { verdict } = account;
  return (
    <Fragment>
      <tr className={`is-${verdict.state}${open ? ' is-open' : ''}`}>
        <td className="adm-td-who">
          <button type="button" className="adm-who" aria-expanded={open} aria-controls={detailsId} aria-label={C.detailsAria(name, [isOwn ? C.you : '', account.disabled ? C.disabled : ''].filter(Boolean))} onClick={onToggle}>
            <span className="adm-ava-ring"><HubAvatar photoURL={account.photoURL} /></span>
            <span>
              <b>{name}</b>
              {isOwn ? <em> · {C.you}</em> : null}
              {account.disabled ? <em> · {C.disabled}</em> : null}
            </span>
          </button>
        </td>
        <td data-label={C.columns.space}>
          <span className={`adm-state${account.profile === 'social' ? '' : ' is-off'}`}>
            {account.profile === 'social' ? C.space.social : account.profile === 'suspended' ? C.space.suspended : C.space.none}
          </span>
          {account.premiosParticipant && account.profile === null ? <em className="adm-muted"> · {C.premios}</em> : null}
        </td>
        <td data-label={C.columns.lastUse}>
          <span className="adm-ago">{verdict.lastUsedAt > 0 ? A.field.lastActivityAgo(verdict.lastUsedAt, now) : A.never}</span>
        </td>
        <td data-label={C.columns.created}>
          <span className="adm-ago">{account.createdAt > 0 ? DAY_FORMAT.format(new Date(account.createdAt)) : A.field.none}</span>
        </td>
        <td data-label={C.columns.expires}>
          <span className={`adm-expiry is-${verdict.state}`}>{expiryOf(account)}</span>
        </td>
      </tr>
      {open ? (
        <tr className="adm-account-more" id={detailsId}>
          <td colSpan={5}>
            <dl className="adm-rows">
              <div><dt>{C.email}</dt><dd>{account.email || C.noEmail}</dd></div>
              <div>
                <dt>{C.uid}</dt>
                <dd>
                  <code>{account.uid}</code>{' '}
                  <button type="button" className="adm-link" onClick={onCopyUid}>{C.copyUid}</button>
                </dd>
              </div>
            </dl>
            {account.profile ? (
              <div className="adm-actions">
                <Link className="btn btn-open adm-sm" to={adminUserPath(account.uid)}>
                  {C.openProfile}
                  <Icon name="angle-right" className="ui-icon btn-open-go" />
                </Link>
              </div>
            ) : null}
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
});
