import { memo, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../core/constants/labels';
import { PALETTES } from '../../core/constants/palettes';
import { usePalette } from '../hooks/usePalette';
import { useTheme } from '../hooks/useTheme';
import { useUppercase } from '../hooks/useUppercase';

const A = UI_MESSAGES.settings.appearance;

/**
 * F1 — Selector de apariencia dentro de "Ajustes de cuenta": paleta (tema) + modo claro/oscuro.
 * Funciona siempre en local (no requiere sesión); si hay cuenta, se sincroniza vía Firestore.
 */
export const AppearanceSettings = memo(function AppearanceSettings() {
  const { palette, setPalette } = usePalette();
  const { theme, toggle } = useTheme();
  const { uppercase, setUppercase } = useUppercase();

  return (
    <div className="settings-appearance">
      <p className="settings-card-sub">{A.paletteLabel}</p>
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
  );
});
