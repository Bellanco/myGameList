import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ADMIN_PATHS } from '../../../core/admin/adminRoutes';
import {
  FRIEND_BUCKETS,
  friendsDistribution,
  retentionByMonth,
  seriesByDay,
  signupsByWeek,
} from '../../../core/admin/communityStats';
import { ADMIN_PANEL_UI, ADMIN_SHELL_UI } from '../../../core/constants/adminLabels';
import { createLocalDateFormat } from '../../../core/utils/dateTime';
import { SNAPSHOT_DAYS } from '../../../viewmodel/useAdminInsights';
import { BarChart, DayLineChart, Delta } from './AdminCharts';
import { useAdminPanel } from './AdminPanelContext';

const C = ADMIN_SHELL_UI.community;
const SHORT = createLocalDateFormat({ day: 'numeric', month: 'short' });
const MONTH = createLocalDateFormat({ month: 'short', year: '2-digit' });

/** Media de los últimos 7 valores conocidos; `null` donde no hay ninguno. */
function movingAverage(values: ReadonlyArray<number | null>): Array<number | null> {
  return values.map((_, index) => {
    const window = values.slice(Math.max(0, index - 6), index + 1).filter((value): value is number => value !== null);
    return window.length >= 3 ? window.reduce((a, b) => a + b, 0) / window.length : null;
  });
}

/**
 * COMUNIDAD: cuánta gente hay, cuánta vuelve y cuánta llega, sacado del censo (sin lecturas de más) y de la foto
 * diaria (lo único que da historia). Cada gráfica dice de dónde sale, porque no todas pueden decir lo mismo.
 */
export const AdminCommunityScreen = memo(function AdminCommunityScreen() {
  const { vm, insights } = useAdminPanel();
  const users = useMemo(() => vm.census?.users || [], [vm.census]);
  const { totals, now, snapshots, yesterday } = insights;

  const daily = useMemo(
    () => (snapshots ? seriesByDay(snapshots, (snapshot) => snapshot.active24h, now, SNAPSHOT_DAYS) : []),
    [snapshots, now],
  );
  const values = daily.map((point) => point.value);
  const known = values.filter((value) => value !== null).length;
  const labels = daily.length
    ? [0, Math.floor(daily.length / 3), Math.floor((2 * daily.length) / 3), daily.length - 1].map((index) => ({
        index,
        text: index === daily.length - 1 ? C.today : SHORT.format(new Date(`${daily[index].day}T12:00:00`)),
      }))
    : [];
  const weeks = useMemo(() => signupsByWeek(users, now, 12), [users, now]);
  const retention = useMemo(() => retentionByMonth(users, now, 6), [users, now]);
  const friends = useMemo(() => friendsDistribution(users), [users]);

  if (!totals) {
    return (
      <>
        <header className="adm-head"><h2>{C.title}</h2></header>
        <p className="adm-muted">{ADMIN_PANEL_UI.loading}</p>
      </>
    );
  }

  const stickiness = totals.active30 > 0 ? Math.round((totals.active24h / totals.active30) * 100) : 0;
  const diff = (current: number, before: number | undefined) => (before === undefined ? null : current - before);

  return (
    <>
      <header className="adm-head"><h2>{C.title}</h2></header>

      <dl className="adm-kpis adm-kpis-wide">
        <div className="adm-kpi">
          <dt>{C.kpi.active24h}</dt>
          <dd className="adm-kpi-val">{totals.active24h}</dd>
          <dd><Delta value={diff(totals.active24h, yesterday?.active24h)} against={ADMIN_SHELL_UI.today.vsYesterday} /></dd>
        </div>
        <div className="adm-kpi">
          <dt>{C.kpi.active7}</dt>
          <dd className="adm-kpi-val">{totals.active7}</dd>
          <dd><Delta value={diff(totals.active7, yesterday?.active7)} against={ADMIN_SHELL_UI.today.vsYesterday} /></dd>
        </div>
        <div className="adm-kpi">
          <dt>{C.kpi.active30}</dt>
          <dd className="adm-kpi-val">{totals.active30}</dd>
          <dd><Delta value={diff(totals.active30, yesterday?.active30)} against={ADMIN_SHELL_UI.today.vsYesterday} /></dd>
        </div>
        <div className="adm-kpi" title={C.kpi.stickinessHint}>
          <dt>{C.kpi.stickiness}</dt>
          <dd className="adm-kpi-val">{stickiness}<small> %</small></dd>
        </div>
        <div className="adm-kpi">
          <dt>{C.kpi.new30}</dt>
          <dd className="adm-kpi-val">{totals.new30}</dd>
        </div>
      </dl>

      <section className="adm-card" aria-labelledby="adm-c-daily">
        <div className="adm-card-head">
          <h3 id="adm-c-daily">{C.daily}</h3>
          <span className="adm-chart-legend"><span><i />{C.legendActive}</span><span><i className="is-avg" />{C.legendAverage}</span></span>
        </div>
        {snapshots === null ? null : known === 0 ? (
          <p className="adm-muted">{C.dailyEmpty}</p>
        ) : (
          <>
            <DayLineChart values={values} average={movingAverage(values)} labels={labels} ariaLabel={C.dailyAria} />
            {known < 14 ? <p className="adm-muted">{C.dailyFew(known)}</p> : null}
          </>
        )}
      </section>

      <div className="adm-cols">
        <section className="adm-card" aria-labelledby="adm-c-weeks">
          <div className="adm-card-head"><h3 id="adm-c-weeks">{C.weekly}</h3></div>
          <BarChart
            values={weeks.map((week) => week.count)}
            labels={weeks.map((week) => SHORT.format(new Date(week.end)))}
            ariaLabel={C.weeklyAria}
          />
        </section>
        <section className="adm-card" aria-labelledby="adm-c-friends">
          <div className="adm-card-head">
            <h3 id="adm-c-friends">{C.friends}</h3>
            {totals.noFriends > 0 ? (
              <Link className="adm-link" to={`${ADMIN_PATHS.users}?solo=sin-amigos`}>{C.seeNoFriends(totals.noFriends)}</Link>
            ) : null}
          </div>
          <BarChart values={friends} labels={FRIEND_BUCKETS.map((bucket) => bucket.label)} ariaLabel={C.friendsAria} highlight={0} />
        </section>
      </div>

      <section className="adm-card" aria-labelledby="adm-c-retention">
        <div className="adm-card-head"><h3 id="adm-c-retention">{C.retention}</h3></div>
        <div className="adm-table-wrap">
          <table className="adm-cohort">
            <thead>
              <tr><th>{C.retentionCols.month}</th><th>{C.retentionCols.signups}</th><th>{C.retentionCols.active}</th><th>{C.retentionCols.share}</th></tr>
            </thead>
            <tbody>
              {retention.map((row) => {
                const share = row.signups > 0 ? Math.round((row.activeNow / row.signups) * 100) : null;
                return (
                  <tr key={row.month}>
                    <th>{MONTH.format(new Date(`${row.month}-15T12:00:00`))}</th>
                    <td>{row.signups}</td>
                    <td>{row.activeNow}</td>
                    <td className="adm-cohort-cell" style={{ ['--v' as string]: share ?? 0 }}>{share === null ? '—' : `${share} %`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="adm-muted">{C.retentionNote}</p>
      </section>
    </>
  );
});
