import { memo, useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { UI_MESSAGES } from '../../core/constants/labels';
import { SETTINGS_ROUTES, type SettingsGroup } from '../../core/constants/routes';
import { SETTINGS_MENU_ID } from '../../core/constants/uiConfig';

const MENU = UI_MESSAGES.settingsMenu;

interface SettingsMenuProps {
  /** ¿Hay espacio social? Sin él, Personalización no tiene nada que enseñar y no se pinta. */
  hasSocialProfile: boolean;
  /** Avisa a `App` de que el menú se ha abierto o cerrado: de eso depende que el contenido se atenúe. */
  onToggle: (open: boolean) => void;
}

/** Los cuatro puntos, en orden de lectura. `Legal` va aparte: es el pie, no una opción más. */
const PUNTOS: ReadonlyArray<{ group: SettingsGroup; label: string }> = [
  { group: 'personalization', label: MENU.personalization },
  { group: 'integration', label: MENU.integration },
  { group: 'filters', label: MENU.filters },
];

/**
 * EL MENÚ DE LA PESTAÑA DE AJUSTES — cuatro puntos y nada más.
 *
 * No hay panel, ni velo, ni caja: solo los rótulos flotando sobre la pantalla, con un punto de luz delante.
 * Quien sostiene el contraste no es una superficie sino el CONTENIDO DE DEBAJO, que baja al 30 % mientras el
 * menú está abierto (ver `.main.is-dimmed`). Medido sobre el peor fondo imaginable —una carátula blanca en tema
 * oscuro, una negra en claro— da 6,4:1 y 6,6:1 en el peor píxel del trazo. La sombra del texto remata, pero no
 * carga con el trabajo: sola, sobre blanco, no pasaba de 2:1 por más capas que se le echaran.
 *
 * ES UN `popover`, NO UN `<dialog>`: `showModal()` habría dejado la barra inferior inerte, así que con el menú
 * abierto no se podría tocar «Listados» directamente. Un menú no debe secuestrar la pantalla. A cambio, el
 * navegador se encarga del cierre al pulsar fuera, del Esc y de la capa superior; y el botón que lo abre lo
 * gobierna con `popovertarget`, que resuelve solo el caso peliagudo de volver a pulsarlo estando abierto.
 */
export const SettingsMenu = memo(function SettingsMenu({ hasSocialProfile, onToggle }: SettingsMenuProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  /** ¿La entrada de historial de ESTE menú sigue siendo la de arriba? Evita retroceder de más al cerrar. */
  const ownsHistoryRef = useRef(false);

  const cerrar = useCallback(() => {
    // `hidePopover` lanza si el menú ya no está abierto (p. ej. el navegador lo cerró antes): no es un error.
    try { ref.current?.hidePopover(); } catch { /* ya estaba cerrado */ }
  }, []);

  /**
   * EL BOTÓN DE ATRÁS TIENE QUE CERRAR EL MENÚ, no salir de la aplicación. En un móvil es el gesto natural para
   * deshacer lo último, y sin esto lo último que se deshace es la visita entera. Se empuja una entrada al abrir
   * y se consume al cerrar, con una marca para no retroceder una entrada que ya no es nuestra.
   */
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const onPopState = () => {
      ownsHistoryRef.current = false;
      if (node.matches(':popover-open')) cerrar();
    };

    const onToggleEvent = (event: Event) => {
      const open = (event as ToggleEvent).newState === 'open';
      onToggle(open);
      if (open) {
        window.history.pushState({ settingsMenu: true }, '');
        ownsHistoryRef.current = true;
        return;
      }
      // Cerrado por Esc, por pulsar fuera o por elegir un grupo: se retira la entrada que se empujó al abrir.
      if (ownsHistoryRef.current) {
        ownsHistoryRef.current = false;
        window.history.back();
      }
    };

    node.addEventListener('toggle', onToggleEvent);
    window.addEventListener('popstate', onPopState);
    return () => {
      node.removeEventListener('toggle', onToggleEvent);
      window.removeEventListener('popstate', onPopState);
    };
  }, [cerrar, onToggle]);

  /**
   * ELEGIR UN GRUPO SUSTITUYE la entrada del menú en vez de retroceder por ella, y esto no es un matiz: cerrar
   * hace `history.back()` para consumir lo que se empujó al abrir, así que con un `navigate` normal las dos
   * cosas corren a la vez y el retroceso DESHACÍA la navegación —se abría el grupo y la pantalla volvía sola a
   * los listados—. Con `replace`, la entrada del menú pasa a ser la del grupo: no hay nada que consumir (de ahí
   * el `ownsHistory = false` antes de cerrar) y el botón de atrás lleva a donde se estaba, que es lo suyo.
   */
  const ir = useCallback((group: SettingsGroup) => {
    ownsHistoryRef.current = false;
    cerrar();
    navigate(SETTINGS_ROUTES[group], { replace: true });
  }, [cerrar, navigate]);

  const puntos = hasSocialProfile ? PUNTOS : PUNTOS.filter((p) => p.group !== 'personalization');

  return (
    <div
      ref={ref}
      id={SETTINGS_MENU_ID}
      popover="auto"
      className="settings-menu"
      role="menu"
      aria-label={MENU.ariaLabel}
    >
      {puntos.map(({ group, label }) => (
        <button
          key={group}
          type="button"
          role="menuitem"
          className={`settings-menu-point ${pathname === SETTINGS_ROUTES[group] ? 'is-current' : ''}`.trim()}
          aria-current={pathname === SETTINGS_ROUTES[group] ? 'page' : undefined}
          onClick={() => ir(group)}
        >
          <span className="settings-menu-dot" aria-hidden="true" />
          {label}
        </button>
      ))}
      {/* Legal es el PIE del menú: se consulta una vez al año, pero tiene que seguir estando a un toque —retirar
          el consentimiento de la analítica debe costar lo mismo que darlo—. Se le baja el rango, no el acceso. */}
      <button
        type="button"
        role="menuitem"
        className={`settings-menu-point is-foot ${pathname === SETTINGS_ROUTES.legal ? 'is-current' : ''}`.trim()}
        aria-current={pathname === SETTINGS_ROUTES.legal ? 'page' : undefined}
        onClick={() => ir('legal')}
      >
        <span className="settings-menu-dot" aria-hidden="true" />
        {MENU.legal}
      </button>
    </div>
  );
});
