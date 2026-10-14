import { memo, useState } from 'react';
import { ADMIN_SHELL_UI } from '../../../core/constants/adminLabels';
import type { AdminLogKind } from '../../../model/repository/admin/adminPanelStore';
import { AdminLogList } from './AdminLogList';

const G = ADMIN_SHELL_UI.log;

/** Los filtros del registro, por asunto: lo que se busca es «¿qué rangos he tocado?» o «¿qué he moderado?». */
const FILTERS: Record<keyof typeof G.filters, readonly AdminLogKind[] | undefined> = {
  all: undefined,
  tier: ['tier'],
  moderation: ['social', 'legacy', 'identity', 'photo', 'requests', 'cutover', 'delete', 'achievements'],
  shares: ['shares'],
  announcement: ['announcement'],
};

/** REGISTRO: las acciones del panel, de la más reciente a la más antigua, con «Deshacer» en lo reversible. */
export const AdminLogScreen = memo(function AdminLogScreen() {
  const [filter, setFilter] = useState<keyof typeof G.filters>('all');
  return (
    <>
      <header className="adm-head"><h2>{G.title}</h2></header>
      <section className="adm-card" aria-label={G.title}>
        <div className="adm-filter-row" role="group">
          {(Object.keys(G.filters) as Array<keyof typeof G.filters>).map((key) => (
            <button key={key} type="button" className="adm-chip" aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {G.filters[key]}
            </button>
          ))}
        </div>
        <AdminLogList kinds={FILTERS[filter]} />
      </section>
    </>
  );
});
