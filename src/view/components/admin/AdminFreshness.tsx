import { memo, useEffect, useState } from 'react';
import { ADMIN_PANEL_UI, ADMIN_SHELL_UI } from '../../../core/constants/adminLabels';
import { Icon } from '../Icon';
import { useAdminPanel } from './AdminPanelContext';

const F = ADMIN_SHELL_UI.freshness;

/**
 * DE CUÁNDO ES LO QUE SE VE, junto al botón de releerlo. El censo se lee al entrar y no se refresca solo (cuesta una
 * lectura por perfil y por amistad), así que con el panel abierto un rato la tabla envejece: decirlo evita tomar
 * una decisión sobre una foto de hace media hora creyendo que es de ahora.
 */
export const AdminFreshness = memo(function AdminFreshness() {
  const { vm } = useAdminPanel();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const minutes = vm.loadedAt > 0 ? Math.floor((now - vm.loadedAt) / 60_000) : -1;
  return (
    <>
      <span className={`adm-fresh${vm.loading ? ' is-loading' : ''}`} aria-live="polite">
        {vm.loading ? F.reading : minutes >= 0 ? F.ago(Math.max(0, minutes)) : ''}
      </span>
      <button type="button" className="btn btn-secondary adm-sm" onClick={() => void vm.refresh()} disabled={vm.loading}>
        <Icon name="refresh" />
        <span>{ADMIN_PANEL_UI.refresh}</span>
      </button>
    </>
  );
});
