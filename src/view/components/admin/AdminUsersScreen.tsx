import { memo, useCallback, useMemo, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ADMIN_PATHS, adminUserPath } from '../../../core/admin/adminRoutes';
import {
  ADMIN_ONLY_FILTERS,
  DEFAULT_USER_FILTERS,
  SEVERE_ANOMALIES,
  hasActiveFilters,
  signupAt,
  type AdminActivityFilter,
  type AdminSortKey,
  type AdminUserFilters,
} from '../../../core/admin/userFilters';
import { ADMIN_PANEL_UI, ADMIN_SHELL_UI } from '../../../core/constants/adminLabels';
import { ADMIN_ONLY_TIER, PROFILE_TIERS, PROFILE_TIER_LABELS, type ProfileTier } from '../../../core/constants/tiers';
import { createLocalDateFormat } from '../../../core/utils/dateTime';
import { ADMIN_PROFILES_LIMIT, type AdminUserRow } from '../../../model/repository/firebaseAdminRepository';
import type { AdminAnomaly } from '../../../model/types/firestore';
import { useAdminUserTable } from '../../../viewmodel/useAdminUserTable';
import { HubAvatar } from '../socialhub/HubAvatar';
import { AdminFreshness } from './AdminFreshness';
import { useAdminPanel } from './AdminPanelContext';
import { AdminUserDetail, displayNameOf } from './AdminUserDetail';

const A = ADMIN_PANEL_UI;
const U = ADMIN_SHELL_UI.users;
const DAY_FORMAT = createLocalDateFormat({ dateStyle: 'medium' });

/** Las señales en el orden del catálogo de textos (el mismo que el filtro de antes). */
const SIGNAL_CODES = (Object.keys(A.anomalies) as Array<AdminAnomaly | 'aria'>).filter(
  (code): code is AdminAnomaly => code !== 'aria',
);
const ACTIVITY_OPTIONS: AdminActivityFilter[] = ['any', 'today', '7', '30', 'inactive'];
/** Las columnas numéricas y de fecha empiezan por lo más alto/reciente: es lo que se busca al pulsar. */
const DESC_FIRST: ReadonlySet<AdminSortKey> = new Set<AdminSortKey>(['friends', 'shares', 'activity', 'created']);

function Chip({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: ReactNode; count?: number }) {
  return (
    <button type="button" className="adm-chip" aria-pressed={active} onClick={onClick}>
      {children}
      {count !== undefined ? <small>{count}</small> : null}
    </button>
  );
}

function toggleIn<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/**
 * USUARIOS: el censo como TABLA ordenable (en móvil, cada fila cae a tarjeta), con los filtros en la URL y la ficha
 * de cada persona en un panel lateral en su propia dirección. Las fichas de antes, todas abiertas a la vez, no se
 * podían recorrer con más de unas pocas decenas de perfiles; aquí se ve el censo entero de un vistazo y el detalle
 * está a un clic.
 */
export const AdminUsersScreen = memo(function AdminUsersScreen() {
  const { vm, data, confirm } = useAdminPanel();
  const navigate = useNavigate();
  const { userId = '' } = useParams();
  const rows = useMemo(() => vm.census?.users || [], [vm.census]);
  const table = useAdminUserTable(rows, data.shares, SIGNAL_CODES);
  const { filters, setFilters, sort, setSort, visible, context, selected } = table;
  const query = table.search ? `?${table.search}` : '';

  const open = useCallback((id: string) => navigate(`${adminUserPath(id)}${query}`), [navigate, query]);
  const close = useCallback(() => navigate(`${ADMIN_PATHS.users}${query}`), [navigate, query]);
  const detail = userId ? rows.find((row) => row.id === userId) : undefined;

  const set = (patch: Partial<AdminUserFilters>) => setFilters({ ...filters, ...patch });
  const tierCounts = useMemo(() => {
    const counts = Object.fromEntries(PROFILE_TIERS.map((tier) => [tier, 0])) as Record<ProfileTier, number>;
    rows.forEach((row) => (counts[row.tier] += 1));
    return counts;
  }, [rows]);
  const severeCount = useMemo(() => rows.filter((row) => row.anomalies.some((code) => SEVERE_ANOMALIES.has(code))).length, [rows]);
  const flaggedCount = useMemo(() => rows.filter((row) => row.anomalies.length > 0).length, [rows]);
  const selectedRows = visible.filter((row) => selected.has(row.id));
  const allSelected = visible.length > 0 && visible.every((row) => selected.has(row.id));

  const header = (key: AdminSortKey, label: string, numeric = false) => {
    const current = sort.key === key;
    return (
      <th className={numeric ? 'num' : undefined} aria-sort={current ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
        <button
          type="button"
          aria-label={U.sortBy(label)}
          onClick={() =>
            setSort({
              key,
              dir: current ? (sort.dir === 'asc' ? 'desc' : 'asc') : DESC_FIRST.has(key) ? 'desc' : 'asc',
            })
          }
        >
          {label}
          {current ? <span aria-hidden="true">{sort.dir === 'asc' ? ' ↑' : ' ↓'}</span> : null}
        </button>
      </th>
    );
  };

  return (
    <>
      <header className="adm-head">
        <h2>{U.title}</h2>
        <div className="adm-head-aside"><AdminFreshness /></div>
      </header>

      <section className="adm-card" aria-label={A.table.aria}>
        <div className="adm-filters">
          <div className="adm-filter-row">
            <input
              className="adm-search finput"
              type="search"
              aria-label={U.searchAria}
              placeholder={U.searchPlaceholder}
              value={filters.text}
              onChange={(event) => set({ text: event.target.value })}
            />
            {hasActiveFilters(filters) ? (
              <button type="button" className="adm-link" onClick={() => setFilters(DEFAULT_USER_FILTERS)}>{U.clear}</button>
            ) : null}
          </div>
          <div className="adm-filter-row" role="group" aria-label={U.rows.signal}>
            <span>{U.rows.signal}</span>
            <Chip active={filters.signal === 'all'} onClick={() => set({ signal: 'all' })}>{U.signal.all}</Chip>
            <Chip active={filters.signal === 'flagged'} count={flaggedCount} onClick={() => set({ signal: 'flagged' })}>{U.signal.flagged}</Chip>
            <Chip active={filters.signal === 'severe'} count={severeCount} onClick={() => set({ signal: 'severe' })}>{U.signal.severe}</Chip>
            {/* Las señales sueltas, solo las que alguna ficha tiene: un filtro que no puede devolver nada es ruido. */}
            <select
              className="adm-select finput"
              aria-label={U.oneSignal}
              value={SIGNAL_CODES.includes(filters.signal as AdminAnomaly) ? filters.signal : ''}
              onChange={(event) => set({ signal: (event.target.value || 'all') as AdminUserFilters['signal'] })}
            >
              <option value="">{U.oneSignal}</option>
              {SIGNAL_CODES.filter((code) => vm.signalCounts.has(code)).map((code) => (
                <option key={code} value={code}>{A.signalFilter.one(A.anomalies[code].label, vm.signalCounts.get(code) || 0)}</option>
              ))}
            </select>
          </div>
          <div className="adm-filter-row" role="group" aria-label={U.rows.tier}>
            <span>{U.rows.tier}</span>
            {PROFILE_TIERS.map((tier) => (
              <Chip key={tier} active={filters.tiers.includes(tier)} count={tierCounts[tier]} onClick={() => set({ tiers: toggleIn(filters.tiers, tier) })}>
                <span className={`adm-dot tier-${tier}`} aria-hidden="true" />
                {PROFILE_TIER_LABELS[tier]}
              </Chip>
            ))}
          </div>
          <div className="adm-filter-row" role="group" aria-label={U.rows.activity}>
            <span>{U.rows.activity}</span>
            {ACTIVITY_OPTIONS.map((value) => (
              <Chip key={value} active={filters.activity === value} onClick={() => set({ activity: value })}>{U.activity[value]}</Chip>
            ))}
          </div>
          <div className="adm-filter-row" role="group" aria-label={U.rows.only}>
            <span>{U.rows.only}</span>
            {ADMIN_ONLY_FILTERS.map((value) => (
              <Chip key={value} active={filters.only.includes(value)} onClick={() => set({ only: toggleIn(filters.only, value) })}>{U.only[value]}</Chip>
            ))}
          </div>
          <p className="adm-count" aria-live="polite">{U.count(visible.length, rows.length)}</p>
        </div>

        {vm.census?.truncated ? <p className="admin-warning">{A.truncated(ADMIN_PROFILES_LIMIT)}</p> : null}
        {vm.error ? <p className="admin-feedback err">{vm.error}</p> : null}

        {selectedRows.length > 0 ? (
          <div className="adm-bulk" role="region" aria-label={U.bulk.aria}>
            <b>{U.bulk.selected(selectedRows.length)}</b>
            <select
              className="adm-select finput"
              aria-label={U.bulk.tier}
              value=""
              disabled={vm.bulkBusy}
              onChange={(event) => {
                const tier = event.target.value as ProfileTier;
                if (!tier) return;
                confirm({
                  title: U.bulk.tierConfirm(selectedRows.length, PROFILE_TIER_LABELS[tier]),
                  tone: 'primary',
                  run: async () => {
                    await vm.bulkSetTier(selectedRows, tier);
                    table.clearSelection();
                  },
                });
              }}
            >
              <option value="">{U.bulk.tier}</option>
              {PROFILE_TIERS.filter((tier) => tier !== ADMIN_ONLY_TIER).map((tier) => (
                <option key={tier} value={tier}>{PROFILE_TIER_LABELS[tier]}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-secondary adm-sm"
              disabled={vm.bulkBusy}
              onClick={() =>
                confirm({
                  title: U.bulk.suspendConfirm(selectedRows.length),
                  run: async () => {
                    await vm.bulkDisableSocial(selectedRows);
                    table.clearSelection();
                  },
                })
              }
            >
              {vm.bulkBusy ? A.working : U.bulk.suspend}
            </button>
            <button type="button" className="btn btn-secondary adm-sm" onClick={table.clearSelection}>{U.bulk.clear}</button>
          </div>
        ) : null}

        {vm.loading && !vm.census ? (
          <p>{A.loading}</p>
        ) : vm.error ? null : rows.length === 0 ? (
          <p>{A.empty}</p>
        ) : visible.length === 0 ? (
          // Con un filtro de señales, la lista vacía es una BUENA noticia y no un «no se encontró nada».
          <p>{filters.signal !== 'all' && !filters.text.trim() ? U.emptySignal : U.emptyFiltered}</p>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>
                    <input type="checkbox" aria-label={U.selectAll} checked={allSelected} onChange={table.toggleAll} />
                  </th>
                  {header('name', U.columns.user)}
                  <th>{U.columns.tier}</th>
                  <th>{U.columns.state}</th>
                  {header('friends', U.columns.friends, true)}
                  {header('shares', U.columns.shares, true)}
                  {header('activity', U.columns.activity)}
                  {header('created', U.columns.created)}
                  <th>{U.columns.signals}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <UserRow
                    key={row.id}
                    row={row}
                    isOwn={row.uid === vm.ownUid}
                    selected={selected.has(row.id)}
                    open={row.id === userId}
                    banned={context.banned.has(row.uid)}
                    shares={context.shareCounts[row.uid] || 0}
                    quotaAdjusted={context.quotaOverrides.has(row.uid)}
                    busy={vm.busyId === row.id}
                    now={context.now}
                    onToggle={table.toggle}
                    onOpen={open}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {userId ? (
        detail ? (
          <AdminUserDetail key={detail.id} user={detail} onClose={close} />
        ) : vm.census ? (
          <p className="admin-feedback warn" role="status">{ADMIN_SHELL_UI.detail.notFound}</p>
        ) : null
      ) : null}
    </>
  );
});

const UserRow = memo(function UserRow({
  row,
  isOwn,
  selected,
  open,
  banned,
  shares,
  quotaAdjusted,
  busy,
  now,
  onToggle,
  onOpen,
}: {
  row: AdminUserRow;
  isOwn: boolean;
  selected: boolean;
  open: boolean;
  banned: boolean;
  shares: number;
  quotaAdjusted: boolean;
  busy: boolean;
  now: number;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const name = displayNameOf(row);
  const signup = signupAt(row);
  const today = row.updatedAt >= new Date(now).setHours(0, 0, 0, 0);
  return (
    <tr className={`${selected ? 'is-selected' : ''}${open ? ' is-open' : ''}${busy ? ' is-busy' : ''}`.trim() || undefined} onClick={() => onOpen(row.id)}>
      <td onClick={(event) => event.stopPropagation()}>
        <input type="checkbox" aria-label={U.selectOne(name)} checked={selected} onChange={() => onToggle(row.id)} />
      </td>
      <td className="adm-td-who">
        {/* El nombre es un BOTÓN: la fila entera abre la ficha con el ratón, pero con el teclado hace falta un foco. */}
        <button type="button" className="adm-who" aria-label={U.openOne(name)} onClick={(event) => { event.stopPropagation(); onOpen(row.id); }}>
          <span className={`adm-ava-ring tier-${row.tier}`}><HubAvatar photoURL={row.photoURL} /></span>
          <span>
            <b>{name}</b>
            {isOwn ? <em> · {U.you}</em> : null}
            {!row.displayName.trim() && row.knownAs.trim() ? <em> · {A.knownAsHint}</em> : null}
          </span>
        </button>
      </td>
      <td data-label={U.columns.tier}>
        <span className={`adm-tier tier-${row.tier}`}><span className="adm-dot" aria-hidden="true" />{PROFILE_TIER_LABELS[row.tier]}</span>
      </td>
      <td className="adm-td-state">
        <span className={`adm-state${banned ? ' is-banned' : row.socialEnabled ? '' : ' is-off'}`}>
          {banned ? U.state.banned : row.socialEnabled ? U.state.active : U.state.suspended}
        </span>
      </td>
      <td className="num" data-label={U.columns.friends}>{row.friends}</td>
      <td className="num" data-label={U.columns.shares} title={quotaAdjusted ? U.quotaMark : undefined}>
        {shares || A.field.none}
        {quotaAdjusted ? ' *' : ''}
      </td>
      <td data-label={U.columns.activity}>
        <span className={`adm-ago${today ? ' is-today' : ''}`}>
          {row.updatedAt > 0 ? A.field.lastActivityAgo(row.updatedAt, now) : A.never}
        </span>
      </td>
      <td data-label={U.columns.created}>
        <span className="adm-ago">{signup > 0 ? `${row.createdAt > 0 ? '' : '~ '}${DAY_FORMAT.format(new Date(signup))}` : A.field.none}</span>
      </td>
      <td>
        {row.anomalies.length > 0 ? (
          <ul className="adm-signals" aria-label={A.anomalies.aria}>
            {row.anomalies.map((code) => (
              <li key={code} className={`adm-signal${SEVERE_ANOMALIES.has(code) ? ' is-severe' : ''}`} title={A.anomalies[code].hint}>
                {A.anomalies[code].label}
              </li>
            ))}
          </ul>
        ) : null}
      </td>
    </tr>
  );
});
