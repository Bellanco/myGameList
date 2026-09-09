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
}

/**
 * Controles flotantes en la esquina superior derecha (diseño "headerless": sin barra ni título).
 * Alberga, con el mismo diseño y comportamiento que el cambio de tema, los accesos a Cuenta y Ajustes
 * (antes pestañas de la barra inferior) además del interruptor claro/oscuro.
 * El botón de Cuenta solo se muestra con sesión de Google, apareciendo y desapareciendo de forma suave.
 * Todo el grupo se oculta al hacer scroll y reaparece al volver arriba, para no estorbar la lectura.
 */
/** Lo que hay desplazado ahora mismo, mire quien mire: el documento o un contenedor anidado. */
function scrollTopOf(target: EventTarget | null): number {
  if (target instanceof HTMLElement && target !== document.documentElement && target !== document.body) {
    return target.scrollTop;
  }
  return window.scrollY || document.documentElement.scrollTop || 0;
}

export const FloatingControls = memo(function FloatingControls({ activeSection, onSectionChange, showAccount }: FloatingControlsProps) {
  const [hidden, setHidden] = useState(false);

  /**
   * AL CAMBIAR DE SECCIÓN SE VUELVE A MIRAR, y no es un adorno: el ocultado solo se recalculaba con un evento de
   * scroll, así que el estado de una pantalla se colaba en la siguiente. Bajabas en Listados —los controles se
   * esconden, que es lo que se quiere—, pulsabas Estadísticas en la barra inferior y la pantalla nueva aparecía
   * arriba del todo pero con los controles todavía invisibles y, por `pointer-events: none`, imposibles de
   * pulsar: no había forma de llegar a Ajustes ni al cambio de tema hasta hacer scroll a mano. El clic se lo
   * comía lo que hubiera debajo, que es justo lo que cazó el CI («main intercepts pointer events», veinticinco
   * segundos seguidos).
   *
   * En un `requestAnimationFrame` porque hay que leer el scroll DESPUÉS de pintar la pantalla nueva: si es más
   * corta, el navegador ajusta la posición él solo y sin disparar nada que este componente pueda oír.
   */
  useEffect(() => {
    const mirar = (): void => setHidden(scrollTopOf(null) > SCROLL_HIDE_THRESHOLD);
    // Dos veces: lo que hay al cambiar de sección, y lo que quede después de pintarla. Si la pantalla nueva es
    // más corta que la anterior, el navegador ajusta la posición él solo al pintar y sin disparar nada que este
    // componente pueda oír, así que la primera lectura se quedaría con la posición vieja.
    mirar();
    const raf = window.requestAnimationFrame(mirar);
    return () => window.cancelAnimationFrame(raf);
  }, [activeSection]);

  useEffect(() => {
    let raf = 0;
    const onScroll = (event: Event) => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        setHidden(scrollTopOf(event.target) > SCROLL_HIDE_THRESHOLD);
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
