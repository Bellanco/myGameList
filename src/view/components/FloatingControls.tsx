import { memo, useEffect, useState } from 'react';
import { UI_MESSAGES } from '../../core/constants/labels';
import { Icon } from './Icon';
import { ThemeToggle } from './ThemeToggle';
import type { AppSection } from './BottomNavigation';

const SCROLL_HIDE_THRESHOLD = 24;
const NAV = UI_MESSAGES.nav;

interface FloatingControlsProps {
  activeSection: AppSection;
  onSectionChange: (section: AppSection) => void;
  /** El botón "Cuenta" solo aparece (con transición suave) si hay sesión de Google. */
  showAccount: boolean;
  /** Nº de juegos en la bandeja de importados; el acceso a la bandeja solo se muestra si es > 0. */
  inboxCount: number;
}

/**
 * Controles flotantes en la esquina superior derecha (diseño "headerless": sin barra ni título).
 * Alberga, con el mismo diseño y comportamiento que el cambio de tema, los accesos a Cuenta y Ajustes
 * (antes pestañas de la barra inferior) además del interruptor claro/oscuro.
 * El botón de Cuenta solo se muestra con sesión de Google, apareciendo y desapareciendo de forma suave.
 * Todo el grupo se oculta al hacer scroll y reaparece al volver arriba, para no estorbar la lectura.
 */
export const FloatingControls = memo(function FloatingControls({ activeSection, onSectionChange, showAccount, inboxCount }: FloatingControlsProps) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let raf = 0;
    const onScroll = (event: Event) => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const target = event.target;
        let top = 0;
        if (target instanceof HTMLElement && target !== document.documentElement && target !== document.body) {
          top = target.scrollTop;
        } else {
          top = window.scrollY || document.documentElement.scrollTop || 0;
        }
        setHidden(top > SCROLL_HIDE_THRESHOLD);
      });
    };

    // Captura para detectar también scrolls en contenedores anidados (p. ej. la tabla).
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className={`floating-controls ${hidden ? 'is-hidden' : ''}`.trim()}>
      {/* Cuenta va a la izquierda del grupo para que su aparición/desaparición no desplace al resto. */}
      <button
        type="button"
        className={`btn-icon theme-toggle-btn floating-nav-btn floating-nav-account ${showAccount ? '' : 'is-gone'} ${activeSection === 'account' ? 'is-active' : ''}`.trim()}
        aria-label={NAV.account}
        title={NAV.account}
        aria-current={activeSection === 'account' ? 'page' : undefined}
        aria-hidden={showAccount ? undefined : true}
        tabIndex={showAccount ? undefined : -1}
        onClick={() => onSectionChange('account')}
      >
        <Icon name="bottom-account" className="ui-icon" />
      </button>
      {inboxCount > 0 ? (
        <button
          type="button"
          className={`btn-icon theme-toggle-btn floating-nav-btn floating-nav-inbox ${activeSection === 'inbox' ? 'is-active' : ''}`.trim()}
          aria-label={`${NAV.inbox} (${inboxCount})`}
          title={`${NAV.inbox} (${inboxCount})`}
          aria-current={activeSection === 'inbox' ? 'page' : undefined}
          onClick={() => onSectionChange('inbox')}
        >
          <Icon name="download" className="ui-icon" />
          <span className="floating-nav-badge" aria-hidden="true">{inboxCount}</span>
        </button>
      ) : null}
      <button
        type="button"
        className={`btn-icon theme-toggle-btn floating-nav-btn ${activeSection === 'settings' ? 'is-active' : ''}`.trim()}
        aria-label={NAV.settings}
        title={NAV.settings}
        aria-current={activeSection === 'settings' ? 'page' : undefined}
        onClick={() => onSectionChange('settings')}
      >
        <Icon name="bottom-settings" className="ui-icon" />
      </button>
      <ThemeToggle />
    </div>
  );
});
