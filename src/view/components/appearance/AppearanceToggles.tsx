import { memo } from 'react';
import { APPEARANCE_UI } from '../../../core/constants/labels';
import { useTheme } from '../../hooks/useTheme';
import { useUppercase } from '../../hooks/useUppercase';
import { useShowSteamButton } from '../../hooks/useShowSteamButton';
import { useEffects } from '../../hooks/useEffects';
import { useCovers } from '../../hooks/useCovers';

const A = APPEARANCE_UI;

/**
 * LAS CINCO PREFERENCIAS DE DOS RESPUESTAS: claro u oscuro, versales o no, el botón de Steam Deck, los efectos
 * y las carátulas. Todas viven en este dispositivo (`localStorage`) y solo se copian a la nube si hay sesión,
 * así que ninguna depende de tener cuenta.
 *
 * Cada una va en su caja: puestas en fila, cinco rótulos con su par de botones se leían como una tira de diez
 * botones sueltos y no se veía dónde acababa una opción y empezaba la siguiente.
 */
export const AppearanceToggles = memo(function AppearanceToggles() {
  const { theme, toggle } = useTheme();
  const { uppercase, setUppercase } = useUppercase();
  const { showSteamButton, setShowSteamButton } = useShowSteamButton();
  const { effects, setEffects } = useEffects();
  const { covers, setCovers } = useCovers();

  return (
      <div className="appearance-grid">
      <div className="appearance-field">
      <p className="settings-card-sub">{A.modeLabel}</p>
      <div className="theme-mode-row" role="group" aria-label={A.groupAria}>
        <button
          type="button"
          className={`btn btn-toggle${theme === 'dark' ? ' active' : ''}`}
          aria-pressed={theme === 'dark'}
          onClick={() => { if (theme !== 'dark') toggle(); }}
        >
          <span>{A.dark}</span>
        </button>
        <button
          type="button"
          className={`btn btn-toggle${theme === 'light' ? ' active' : ''}`}
          aria-pressed={theme === 'light'}
          onClick={() => { if (theme !== 'light') toggle(); }}
        >
          <span>{A.light}</span>
        </button>
      </div>

      </div>

      <div className="appearance-field">
      <p className="settings-card-sub">{A.caseLabel}</p>
      <div className="theme-mode-row" role="group" aria-label={A.caseAria}>
        <button
          type="button"
          className={`btn btn-toggle${!uppercase ? ' active' : ''}`}
          aria-pressed={!uppercase}
          onClick={() => { if (uppercase) setUppercase(false); }}
        >
          <span>{A.caseNormal}</span>
        </button>
        <button
          type="button"
          className={`btn btn-toggle${uppercase ? ' active' : ''}`}
          aria-pressed={uppercase}
          onClick={() => { if (!uppercase) setUppercase(true); }}
        >
          <span>{A.caseUpper}</span>
        </button>
      </div>

      </div>

      <div className="appearance-field">
      <p className="settings-card-sub">{A.steamLabel}</p>
      <div className="theme-mode-row" role="group" aria-label={A.steamAria}>
        <button
          type="button"
          className={`btn btn-toggle${showSteamButton ? ' active' : ''}`}
          aria-pressed={showSteamButton}
          onClick={() => { if (!showSteamButton) setShowSteamButton(true); }}
        >
          <span>{A.steamShow}</span>
        </button>
        <button
          type="button"
          className={`btn btn-toggle${!showSteamButton ? ' active' : ''}`}
          aria-pressed={!showSteamButton}
          onClick={() => { if (showSteamButton) setShowSteamButton(false); }}
        >
          <span>{A.steamHide}</span>
        </button>
      </div>

      </div>

      <div className="appearance-field">
      <p className="settings-card-sub">{A.effectsLabel}</p>
      <div className="theme-mode-row" role="group" aria-label={A.effectsAria}>
        <button
          type="button"
          className={`btn btn-toggle${effects ? ' active' : ''}`}
          aria-pressed={effects}
          onClick={() => { if (!effects) setEffects(true); }}
        >
          <span>{A.effectsOn}</span>
        </button>
        <button
          type="button"
          className={`btn btn-toggle${!effects ? ' active' : ''}`}
          aria-pressed={!effects}
          onClick={() => { if (effects) setEffects(false); }}
        >
          <span>{A.effectsOff}</span>
        </button>
      </div>

      </div>

      {/* Carátulas. Lleva explicación y las demás no, a propósito: es la única de esta pantalla que hace que
          salgan peticiones a la red, así que quien la enciende tiene que saber qué está encendiendo. */}
      <div className="appearance-field">
      <p className="settings-card-sub">{A.coversLabel}</p>
      <div className="theme-mode-row" role="group" aria-label={A.coversAria}>
        <button
          type="button"
          className={`btn btn-toggle${covers ? ' active' : ''}`}
          aria-pressed={covers}
          onClick={() => { if (!covers) setCovers(true); }}
        >
          <span>{A.coversOn}</span>
        </button>
        <button
          type="button"
          className={`btn btn-toggle${!covers ? ' active' : ''}`}
          aria-pressed={!covers}
          onClick={() => { if (covers) setCovers(false); }}
        >
          <span>{A.coversOff}</span>
        </button>
      </div>
      </div>
      </div>
  );
});
