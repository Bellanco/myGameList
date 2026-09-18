import { APPEARANCE_UI } from '../../core/constants/labels';
import { memo, type CSSProperties } from 'react';
import { PALETTES } from '../../core/constants/palettes';
import { usePalette } from '../hooks/usePalette';
import { useTheme } from '../hooks/useTheme';
import { useUppercase } from '../hooks/useUppercase';
import { useShowSteamButton } from '../hooks/useShowSteamButton';
import { useEffects } from '../hooks/useEffects';
import { useCovers } from '../hooks/useCovers';

const A = APPEARANCE_UI;

/**
 * F1 — Selector de apariencia dentro de "Ajustes de cuenta": paleta (tema) + modo claro/oscuro.
 * Funciona siempre en local (no requiere sesión); si hay cuenta, se sincroniza vía Firestore.
 */
export const AppearanceSettings = memo(function AppearanceSettings({ only }: { only?: 'theme' | 'toggles' }) {
  const { palette, setPalette } = usePalette();
  const { theme, toggle } = useTheme();
  const { uppercase, setUppercase } = useUppercase();
  const { showSteamButton, setShowSteamButton } = useShowSteamButton();
  const { effects, setEffects } = useEffects();
  const { covers, setCovers } = useCovers();

  return (
    <div className="settings-appearance">
      {only !== 'toggles' ? (
      <>
      {/* EL RÓTULO SOLO CUANDO ACOMPAÑA. En «Personalización» el selector tiene tarjeta propia y el encabezado
          de la tarjeta ya dice «Temas»: repetirlo debajo es una línea de ruido. Donde el selector convive con
          otras cosas, el rótulo hace falta para saber qué es esta rejilla de ocho opciones. */}
      {only !== 'theme' ? <p className="settings-card-sub">{A.paletteLabel}</p> : null}
      <div className="score-scale-choice" role="radiogroup" aria-label={A.paletteAria}>
        {PALETTES.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={palette === p.id}
            className={`score-scale-opt${palette === p.id ? ' on' : ''}`}
            style={{ '--sw-accent': p.accent, '--sw-accent2': p.accent2 ?? p.accent, '--sw-dark': p.bg.dark, '--sw-light': p.bg.light } as CSSProperties}
            onClick={() => setPalette(p.id)}
          >
            <span className="score-scale-dot" aria-hidden="true" />
            <span className="score-scale-txt"><b>{p.label}</b></span>
            <span className="score-scale-sample" aria-hidden="true">
              <span className="palette-swatch" aria-hidden="true" />
            </span>
          </button>
        ))}
      </div>

      </>
      ) : null}

      {only !== 'theme' ? (
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
      ) : null}
    </div>
  );
});
