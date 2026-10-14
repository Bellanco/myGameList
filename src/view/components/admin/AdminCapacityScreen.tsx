import { memo, useEffect, useState } from 'react';
import { ADMIN_SHELL_UI } from '../../../core/constants/adminLabels';
import { createLocalDateFormat } from '../../../core/utils/dateTime';
import type { HealthMeterView } from '../../../viewmodel/useAdminHealth';
import { Icon } from '../Icon';
import { formatNumber, Meter } from './AdminCharts';
import { useAdminPanel } from './AdminPanelContext';

const K = ADMIN_SHELL_UI.capacity;
const TIME = createLocalDateFormat({ hour: '2-digit', minute: '2-digit' });

/**
 * A este ritmo, ¿a cuánto se llega al acabar el día? Lineal desde el reinicio de la cuota: es grueso, pero dice lo
 * que importa —si el techo va a llegar antes de medianoche— con lo que hay.
 */
function projectedPercent(meter: HealthMeterView, now: number): number | null {
  if (meter.used === null || !meter.resetsAt) return null;
  const dayStart = meter.resetsAt - 86_400_000;
  const elapsed = now - dayStart;
  if (elapsed < 2 * 3600_000) return null; // con menos de dos horas, la proyección es ruido
  return Math.round(((meter.used / elapsed) * 86_400_000 / meter.limit) * 100);
}

function footOf(meter: HealthMeterView, now: number): string {
  const parts: string[] = [];
  const projected = projectedPercent(meter, now);
  if (projected !== null && projected >= 70) parts.push(K.projection(projected));
  if (meter.previous !== null) parts.push(K.yesterday(formatNumber(meter.previous)));
  if (meter.resetsAt) parts.push(K.resets(TIME.format(new Date(meter.resetsAt))));
  parts.push(meter.sourceLabel);
  return parts.join(' · ');
}

/** CAPACIDAD: el gasto del día de cada servicio frente al techo del plan gratuito, y lo que cuesta el propio panel. */
export const AdminCapacityScreen = memo(function AdminCapacityScreen() {
  const { health, data, vm } = useAdminPanel();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const minutes = health.fetchedAt ? Math.floor((now - health.fetchedAt) / 60_000) : -1;
  // Sin el endpoint (en desarrollo), las carátulas siguen llegando por su propio contador.
  const meters: HealthMeterView[] = health.meters.length
    ? health.meters
    : data.coverStats
      ? [{
          id: 'covers',
          source: 'covers',
          used: data.coverStats.gastado,
          limit: data.coverStats.techo,
          status: 'ok',
          resetsAt: 0,
          previous: null,
          label: K.meters.covers,
          sourceLabel: K.sources.covers,
          home: false,
        }]
      : [];

  return (
    <>
      <header className="adm-head">
        <h2>{K.title}</h2>
        <div className="adm-head-aside">
          {minutes >= 0 ? <span className="adm-fresh">{K.measured(minutes)}</span> : null}
          <button type="button" className="btn btn-secondary adm-sm" disabled={health.loading} onClick={() => void health.refresh()}>
            <Icon name="refresh" />
            <span>{K.refresh}</span>
          </button>
        </div>
      </header>

      <div className="adm-cols">
        <section className="adm-card" aria-labelledby="adm-k-ceilings">
          <div className="adm-card-head"><h3 id="adm-k-ceilings">{K.ceilings}</h3></div>
          {health.unreachable ? <p className="admin-warning">{K.unreachable}</p> : null}
          <ul className="adm-meters">
            {meters.map((meter) =>
              meter.used !== null ? (
                <Meter key={meter.id} label={meter.label} used={meter.used} limit={meter.limit} foot={footOf(meter, now)} />
              ) : (
                <li key={meter.id} className="adm-meter is-off">
                  <div className="adm-meter-top">
                    <b>{meter.label}</b>
                    <span>{meter.status === 'error' ? K.failed(meter.error || '') : K.notConfigured}</span>
                  </div>
                  {meter.status === 'not-configured' ? <div className="adm-meter-foot">{K.notConfiguredHint[meter.source]}</div> : null}
                </li>
              ),
            )}
          </ul>
        </section>

        <section className="adm-card" aria-labelledby="adm-k-cost">
          <div className="adm-card-head"><h3 id="adm-k-cost">{K.panelCost}</h3></div>
          <dl className="adm-rows">
            {vm.census ? (
              <div>
                <dt>{K.panelCostRows.census}</dt>
                <dd>{K.panelCostRows.censusValue(vm.census.totals.profiles, vm.census.totals.friendships)}</dd>
              </div>
            ) : null}
            <div><dt>{K.panelCostRows.snapshot}</dt><dd>{K.panelCostRows.snapshotValue}</dd></div>
            <div><dt>{K.panelCostRows.health}</dt><dd>{K.panelCostRows.healthValue}</dd></div>
          </dl>
        </section>
      </div>
    </>
  );
});
