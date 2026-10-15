import { memo } from 'react';
import { Link } from 'react-router-dom';
import { ADMIN_MENU, ADMIN_PATHS, type AdminScreen } from '../../../core/admin/adminRoutes';
import { ADMIN_SHELL_UI } from '../../../core/constants/adminLabels';
import type { IconName } from '../../../core/constants/icons';
import { isMacPlatform } from '../../../core/constants/searchLabels';
import { Icon } from '../Icon';

const N = ADMIN_SHELL_UI.nav;

const ICONS: Record<AdminScreen, IconName> = {
  today: 'check',
  users: 'bottom-hub',
  accounts: 'person',
  community: 'chart-simple',
  capacity: 'cloud-sync',
  log: 'repeat',
  announcement: 'share-nodes',
  achievements: 'trophy',
  premios: 'star-olive-branches',
};

/**
 * EL MENÚ DEL PANEL: columna fija a la izquierda en escritorio y tira desplazable arriba en móvil (la misma lista;
 * lo decide la hoja). Son ENLACES de verdad, no botones que cambian un estado: se abren en otra pestaña, «atrás»
 * vuelve a la pantalla anterior y recargar se queda donde estaba.
 *
 * El número de cada entrada dice si hace falta entrar: rojo cuando hay algo que pide atención, gris cuando es solo
 * un recuento.
 */
export const AdminNav = memo(function AdminNav({
  current,
  counts,
  onSearch,
}: {
  current: AdminScreen;
  counts: Partial<Record<AdminScreen, { value: number; soft?: boolean }>>;
  onSearch: () => void;
}) {
  const mac = isMacPlatform();
  return (
    <nav className="adm-nav" aria-label={N.aria}>
      <p className="adm-nav-title" aria-hidden="true">{N.title}</p>
      <button type="button" className="adm-nav-search" onClick={onSearch} aria-keyshortcuts={mac ? 'Meta+K' : 'Control+K'}>
        <Icon name="filter" />
        <span>{N.search}</span>
        <kbd aria-hidden="true">{mac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      {ADMIN_MENU.map(({ screen, group }, index) => {
        const count = counts[screen];
        const separate = index > 0 && ADMIN_MENU[index - 1].group !== group;
        return (
          <span key={screen} className="adm-nav-item">
            {separate ? <span className="adm-nav-sep" aria-hidden="true" /> : null}
            <Link
              to={ADMIN_PATHS[screen]}
              className="adm-nav-link"
              aria-current={current === screen ? 'page' : undefined}
            >
              <Icon name={ICONS[screen]} />
              <span>{N.screens[screen]}</span>
              {count && count.value > 0 ? (
                <span className={`adm-nav-count${count.soft ? ' is-soft' : ''}`}>{count.value}</span>
              ) : null}
            </Link>
          </span>
        );
      })}
    </nav>
  );
});
