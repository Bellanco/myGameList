import { memo, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ADMIN_PATHS, adminUserPath } from '../../../core/admin/adminRoutes';
import { buildAttention, type AttentionItem } from '../../../core/admin/attention';
import { seriesByDay } from '../../../core/admin/communityStats';
import { ADMIN_PANEL_UI, ADMIN_SHELL_UI } from '../../../core/constants/adminLabels';
import type { IconName } from '../../../core/constants/icons';
import { PROFILE_TIERS, PROFILE_TIER_LABELS } from '../../../core/constants/tiers';
import { createLocalDateFormat } from '../../../core/utils/dateTime';
import { Icon } from '../Icon';
import { Delta, Meter, Sparkline, formatNumber } from './AdminCharts';
import { AdminFreshness } from './AdminFreshness';
import { AdminLogList } from './AdminLogList';
import { useAdminPanel } from './AdminPanelContext';

const A = ADMIN_PANEL_UI;
const T = ADMIN_SHELL_UI.today;
const DAY_FORMAT = createLocalDateFormat({ dateStyle: 'medium' });
const SHORT_DAY = createLocalDateFormat({ day: 'numeric', month: 'short' });

/** El estado del aviso para su línea, o nada mientras no se ha leído. */
function describeAnnouncement(announcement: ReturnType<typeof useAdminPanel>['data']['announcement']): string {
  if (announcement === undefined) return '';
  if (!announcement) return A.menuStatus.announcementNone;
  return announcement.active ? A.menuStatus.announcementActive(announcement.title) : A.menuStatus.announcementOff;
}

interface Entry {
  icon: IconName;
  title: string;
  detail?: string;
  action: { label: string; to?: string; run?: () => void; tone: 'danger' | 'secondary' | 'open' };
}

/**
 * HOY: la portada del panel. Responde a «¿hay algo que mirar?» antes que a ninguna otra cosa —la bandeja de
 * arriba— y debajo da las cifras que dicen cómo va la comunidad, la moderación y el gasto del día. Cada cifra que
 * se puede pulsar lleva a la tabla de usuarios ya filtrada.
 */
export const AdminTodayScreen = memo(function AdminTodayScreen() {
  const { vm, data, insights, confirm, health } = useAdminPanel();
  // Los retos los cambia su propia pantalla (cerrar, publicar): al volver aquí se releen, o la bandeja seguiría
  // pidiendo lo que ya está hecho. Es UN documento.
  const { refreshPremiosStatus } = data;
  useEffect(() => {
    refreshPremiosStatus();
  }, [refreshPremiosStatus]);
  const totals = insights.totals;
  const yesterday = insights.yesterday;
  const census = vm.census;

  const attention = useMemo(
    () =>
      buildAttention({
        now: insights.now,
        users: census?.users,
        truncated: census?.truncated,
        covers: data.coverStats ? { spent: data.coverStats.gastado, cap: data.coverStats.techo } : null,
        // Las carátulas ya entran por su contador propio (`covers`): aquí no se repiten.
        capacity: health.meters.filter((meter) => meter.used !== null && meter.id !== 'covers').map((meter) => ({ metric: meter.label, used: meter.used || 0, limit: meter.limit })),
        premios: data.premiosStatus,
        dueTodos: insights.dueTodos,
      }),
    [census, data.coverStats, data.premiosStatus, insights.now, insights.dueTodos, health.meters],
  );

  const entries = attention.map((item) =>
    toEntry(item, {
      clearPhotos: () =>
        confirm({ title: A.strayPhoto.bulkConfirm(item.code === 'stray-photo' ? item.count : 0), tone: 'primary', run: () => vm.clearAllStrayPhotos() }),
      // Los pendientes están en esta misma pantalla: se baja hasta ellos (un `#ancla` en un `Link` no desplaza).
      showTodos: () => document.getElementById('pendientes')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    }),
  );

  const activeSeries = useMemo(
    () => (insights.snapshots ? seriesByDay(insights.snapshots, (snapshot) => snapshot.active24h, insights.now, 30).map((point) => point.value) : []),
    [insights.snapshots, insights.now],
  );
  const diff = (now: number | undefined, before: number | undefined) =>
    now === undefined || before === undefined ? null : now - before;

  return (
    <>
      <header className="adm-head">
        <h2>{T.title}</h2>
        <div className="adm-head-aside"><AdminFreshness /></div>
      </header>

      <section className="adm-card" aria-labelledby="adm-attention">
        <div className="adm-card-head"><h3 id="adm-attention">{T.attention}</h3></div>
        {vm.error ? <p className="admin-feedback err">{vm.error}</p> : null}
        {!census && vm.loading ? (
          <p className="adm-muted">{A.loading}</p>
        ) : entries.length === 0 ? (
          <p className="adm-inbox-empty"><Icon name="check" /> {T.nothing}</p>
        ) : (
          <ul className="adm-inbox">
            {attention.map((item, index) => {
              const entry = entries[index];
              return (
                <li key={`${item.code}-${index}`} className={`is-${item.severity}`}>
                  <span className="adm-inbox-ico" aria-hidden="true"><Icon name={entry.icon} /></span>
                  <div>
                    <b>{entry.title}</b>
                    {entry.detail ? <span>{entry.detail}</span> : null}
                  </div>
                  {entry.action.to ? (
                    <Link className={`btn btn-${entry.action.tone} adm-sm`} to={entry.action.to}>
                      {entry.action.label}
                      {entry.action.tone === 'open' ? <Icon name="angle-right" className="ui-icon btn-open-go" /> : null}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className={`btn btn-${entry.action.tone} adm-sm`}
                      disabled={item.code === 'stray-photo' && vm.clearingStrayPhotos}
                      onClick={entry.action.run}
                    >
                      {item.code === 'stray-photo' && vm.clearingStrayPhotos ? A.working : entry.action.label}
                      {entry.action.tone === 'open' ? <Icon name="angle-right" className="ui-icon btn-open-go" /> : null}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {totals && census ? (
        <div className="adm-cols-3">
          <section className="adm-card" aria-labelledby="adm-g-community">
            <div className="adm-card-head">
              <h3 id="adm-g-community">{T.groups.community}</h3>
              <Link className="adm-link" to={ADMIN_PATHS.community}>{T.detail}</Link>
            </div>
            <dl className="adm-kpis">
              <div className="adm-kpi">
                <dt>{T.kpi.active24h}</dt>
                <dd className="adm-kpi-val">{totals.active24h}</dd>
                <dd><Delta value={diff(totals.active24h, yesterday?.active24h)} against={T.vsYesterday} /></dd>
                <dd><Sparkline values={activeSeries} /></dd>
              </div>
              <div className="adm-kpi">
                <dt>{T.kpi.active7}</dt>
                <dd className="adm-kpi-val">{totals.active7}</dd>
                <dd><Delta value={diff(totals.active7, yesterday?.active7)} against={T.vsYesterday} /></dd>
              </div>
              <KpiLink label={T.kpi.new7} value={totals.new7} to={`${ADMIN_PATHS.users}?solo=nuevos`} />
              <KpiLink label={T.kpi.noFriends} value={totals.noFriends} to={`${ADMIN_PATHS.users}?solo=sin-amigos`} />
            </dl>
          </section>

          <section className="adm-card" aria-labelledby="adm-g-moderation">
            <div className="adm-card-head">
              <h3 id="adm-g-moderation">{T.groups.moderation}</h3>
              <Link className="adm-link" to={ADMIN_PATHS.log}>{ADMIN_SHELL_UI.nav.screens.log}</Link>
            </div>
            <dl className="adm-kpis" aria-label={A.totals.aria}>
              <KpiLink label={T.kpi.severe} value={totals.severe} bad={totals.severe > 0} to={`${ADMIN_PATHS.users}?senal=graves`} />
              <KpiLink label={T.kpi.flagged} value={totals.flagged} to={`${ADMIN_PATHS.users}?senal=con`} />
              {/* Los dos del Worker de enlaces, solo si su respuesta llegó: un cero sin datos afirmaría que no hay. */}
              {data.shares.summary ? (
                <>
                  <div className="adm-kpi">
                    <dt>{A.totals.activeShares}</dt>
                    <dd className="adm-kpi-val" title={data.shares.summary.complete ? undefined : A.totals.partialHint}>
                      {data.shares.summary.complete ? data.shares.summary.total : A.totals.partialCount(data.shares.summary.total)}
                    </dd>
                  </div>
                  <KpiLink label={A.totals.banned} value={data.shares.banned.size} bad={data.shares.banned.size > 0} to={`${ADMIN_PATHS.users}?solo=vetados`} />
                </>
              ) : null}
            </dl>
            <dl className="adm-rows">
              <div><dt>{T.kpi.profiles}</dt><dd>{census.totals.profiles}</dd></div>
              <div><dt>{A.totals.socialEnabled}</dt><dd>{census.totals.socialEnabled}</dd></div>
              <div><dt>{T.kpi.friendships}</dt><dd>{census.totals.friendships}</dd></div>
              <div><dt>{T.kpi.pending}</dt><dd>{census.totals.pending}</dd></div>
              <div><dt>{T.kpi.legacy}</dt><dd>{census.totals.legacy}</dd></div>
            </dl>
          </section>

          <section className="adm-card" aria-labelledby="adm-g-capacity">
            <div className="adm-card-head">
              <h3 id="adm-g-capacity">{T.groups.capacity}</h3>
              <Link className="adm-link" to={ADMIN_PATHS.capacity}>{T.detail}</Link>
            </div>
            <ul className="adm-meters">
              {/* Se resalta al acercarse al tope —no al llegar—: para cuando se llene ya no hay nada que decidir. */}
              {data.coverStats ? (
                <Meter label={T.covers} used={data.coverStats.gastado} limit={data.coverStats.techo} foot={T.coversFoot} />
              ) : null}
              {health.meters
                .filter((meter) => meter.used !== null && meter.home)
                .map((meter) => (
                  <Meter key={meter.id} label={meter.label} used={meter.used || 0} limit={meter.limit} foot={meter.sourceLabel} />
                ))}
            </ul>
            {health.meters.every((meter) => meter.used === null) ? <p className="adm-muted">{T.capacityMore}</p> : null}
          </section>
        </div>
      ) : null}

      {census ? (
        <div className="adm-cols">
          <section className="adm-card" aria-labelledby="adm-tiers">
            <div className="adm-card-head">
              <h3 id="adm-tiers">{T.tiers}</h3>
              <span className="adm-muted">{T.tiersTotal(census.totals.profiles)}</span>
            </div>
            <div
              className="adm-stack"
              role="img"
              aria-label={PROFILE_TIERS.map((tier) => `${PROFILE_TIER_LABELS[tier]}: ${census.totals.byTier[tier]}`).join(', ')}
            >
              {PROFILE_TIERS.map((tier) => (
                <span key={tier} className={`tier-${tier}`} style={{ flexGrow: census.totals.byTier[tier] }} />
              ))}
            </div>
            <ul className="adm-legend">
              {PROFILE_TIERS.map((tier) => (
                <li key={tier}>
                  <Link to={`${ADMIN_PATHS.users}?rango=${tier}`}>
                    <span className={`adm-dot tier-${tier}`} aria-hidden="true" />
                    {PROFILE_TIER_LABELS[tier]} <b>{census.totals.byTier[tier]}</b>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="adm-card" aria-labelledby="adm-published">
            <div className="adm-card-head"><h3 id="adm-published">{T.published}</h3></div>
            <dl className="adm-rows">
              <div>
                <dt><Link to={ADMIN_PATHS.announcement}>{T.announcementLabel}</Link></dt>
                <dd>{describeAnnouncement(data.announcement)}</dd>
              </div>
              <div>
                <dt><Link to={ADMIN_PATHS.premios}>{T.premiosLabel}</Link></dt>
                <dd className={data.premiosStatus?.stage === 'pending' ? 'is-pending' : undefined}>
                  {data.premiosStatus
                    ? data.premiosStatus.stage === 'open'
                      ? A.menuStatus.premiosOpen(data.premiosStatus.closesAt ? DAY_FORMAT.format(new Date(data.premiosStatus.closesAt)) : A.field.none)
                      : data.premiosStatus.stage === 'pending'
                        ? A.menuStatus.premiosPending
                        : A.menuStatus.premiosNone
                    : ''}
                </dd>
              </div>
            </dl>
          </section>

          <TodosCard />
        </div>
      ) : null}

      <section className="adm-card" aria-labelledby="adm-last">
        <div className="adm-card-head">
          <h3 id="adm-last">{T.lastActions}</h3>
          <Link className="adm-link" to={ADMIN_PATHS.log}>{T.seeAll}</Link>
        </div>
        <AdminLogList limit={5} />
      </section>
    </>
  );
});

function KpiLink({ label, value, to, bad = false }: { label: string; value: number; to: string; bad?: boolean }) {
  return (
    <div className={`adm-kpi is-link${bad ? ' is-bad' : ''}`}>
      <dt>{label}</dt>
      <dd className="adm-kpi-val">
        <Link to={to}>{formatNumber(value)}</Link>
      </dd>
    </div>
  );
}

function toEntry(item: AttentionItem, actions: { clearPhotos: () => void; showTodos: () => void }): Entry {
  const I = T.items;
  switch (item.code) {
    case 'legacy-token':
      return {
        icon: 'lock',
        title: I.legacyToken(item.count),
        detail: I.legacyTokenDetail,
        action: { label: I.legacyTokenAction, to: item.count === 1 ? adminUserPath(item.firstUserId) : `${ADMIN_PATHS.users}?senal=legacy-token`, tone: 'danger' },
      };
    case 'stray-photo':
      return { icon: 'eye-off', title: I.strayPhoto(item.count), detail: I.strayPhotoDetail, action: { label: A.strayPhoto.bulkBtn(item.count), run: actions.clearPhotos, tone: 'secondary' } };
    case 'gist-drift':
      return { icon: 'share-nodes', title: I.gistDrift(item.count), detail: I.gistDriftDetail, action: { label: I.review, to: `${ADMIN_PATHS.users}?senal=gist-drift`, tone: 'open' } };
    case 'covers':
      return {
        icon: 'cloud-sync',
        title: I.covers(formatNumber(item.spent), formatNumber(item.cap), Math.round((item.spent / item.cap) * 100)),
        detail: I.coversDetail,
        action: { label: I.open, to: ADMIN_PATHS.capacity, tone: 'open' },
      };
    case 'capacity':
      return {
        icon: 'cloud-sync',
        title: I.capacity(item.metric, Math.round((item.used / item.limit) * 100)),
        detail: I.capacityDetail,
        action: { label: I.open, to: ADMIN_PATHS.capacity, tone: 'open' },
      };
    case 'premios-closing':
      return { icon: 'star-olive-branches', title: I.premiosClosing(SHORT_DAY.format(new Date(item.closesAt))), detail: I.premiosClosingDetail, action: { label: I.open, to: ADMIN_PATHS.premios, tone: 'open' } };
    case 'premios-pending':
      return { icon: 'star-olive-branches', title: I.premiosPending, detail: I.premiosPendingDetail, action: { label: I.open, to: ADMIN_PATHS.premios, tone: 'open' } };
    case 'todos-due':
      return { icon: 'check', title: I.todosDue(item.count), action: { label: I.review, run: actions.showTodos, tone: 'open' } };
    case 'census-truncated':
      return { icon: 'bottom-hub', title: I.truncated(item.count), detail: I.truncatedDetail, action: { label: I.open, to: ADMIN_PATHS.users, tone: 'open' } };
  }
}

/** Los pendientes del administrador, con fecha opcional. Se guardan en Firestore (`adminPanel/todos`). */
function TodosCard() {
  const { insights } = useAdminPanel();
  const P = T.todos;
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const today = new Date(insights.now);
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    void insights.addTodo(text, due);
    setText('');
    setDue('');
  };
  const items = [...(insights.todos || [])].sort(
    (a, b) => Number(a.done) - Number(b.done) || (a.due || '9999').localeCompare(b.due || '9999'),
  );
  return (
    <section className="adm-card" id="pendientes" aria-labelledby="adm-todos">
      <div className="adm-card-head"><h3 id="adm-todos">{P.title}</h3></div>
      {insights.todosError ? <p className="admin-feedback err">{insights.todosError}</p> : null}
      {insights.todos === null ? null : items.length === 0 ? (
        <p className="adm-muted">{P.empty}</p>
      ) : (
        <ul className="adm-todo">
          {items.map((item) => (
            <li key={item.id} className={`${item.done ? 'is-done' : ''}${!item.done && item.due && item.due <= todayKey ? ' is-due' : ''}`.trim() || undefined}>
              <input type="checkbox" aria-label={P.toggle(item.text)} checked={item.done} onChange={() => void insights.toggleTodo(item.id)} />
              <span>{item.text}</span>
              <span className="adm-todo-date">{item.due ? SHORT_DAY.format(new Date(`${item.due}T12:00:00`)) : P.noDate}</span>
              <button type="button" className="adm-todo-remove" aria-label={P.remove(item.text)} onClick={() => void insights.removeTodo(item.id)}>
                <Icon name="close" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* Sin la lista leída no se ofrece añadir: guardar reescribe el documento entero. */}
      {insights.todos === null ? null : (
      <form className="adm-todo-form" onSubmit={submit}>
        <input className="finput" aria-label={P.textLabel} placeholder={P.textPlaceholder} value={text} maxLength={140} onChange={(event) => setText(event.target.value)} />
        <input className="finput" type="date" aria-label={P.dueLabel} value={due} onChange={(event) => setDue(event.target.value)} />
        <button type="submit" className="btn btn-secondary adm-sm" disabled={!text.trim()}>{P.add}</button>
      </form>
      )}
    </section>
  );
}
