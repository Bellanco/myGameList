import { type CSSProperties, useState } from 'react';
import type { ImportField, ImportFieldGroup, ImportFieldPrefs } from '../../../model/types/import';
import { IMPORT_FIELDS } from '../../../core/import/fieldPrefs';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { Icon } from '../Icon';

const M = UI_MESSAGES.import.inbox.fields;

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))',
  gap: '1rem',
};
const groupStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.45rem' };
const checkStyle: CSSProperties = { display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer' };

const GROUP_TITLE: Record<ImportFieldGroup, string> = { newGames: M.newGames, existingGames: M.existingGames };

/** Resumen legible de los campos activos de un grupo (para verlo con el panel plegado). */
function summarize(selection: ImportFieldPrefs[ImportFieldGroup]): string {
  return M.summary(
    IMPORT_FIELDS.filter((field) => selection[field])
      .map((field) => M.labels[field].toLowerCase())
      .join(', '),
  );
}

interface ImportFieldPrefsCardProps {
  prefs: ImportFieldPrefs;
  onChange: (group: ImportFieldGroup, field: ImportField, on: boolean) => void;
}

/**
 * Ajustes de la bandeja: qué datos traslada el import a cada juego, en dos grupos (nuevos / ya en tus listas).
 * Vale para TODOS los juegos, así no hay que decidirlo uno a uno. Plegado por defecto (con el resumen a la
 * vista) para no empujar la lista hacia abajo.
 */
export function ImportFieldPrefsCard({ prefs, onChange }: ImportFieldPrefsCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="settings-card">
      <div className="settings-card-head">
        <h2>{M.title}</h2>
        <p className="settings-card-note">{M.note}</p>
      </div>

      <button
        type="button"
        className="btn btn-secondary"
        style={{ alignSelf: 'flex-start' }}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={open ? 'chevron-up' : 'chevron-down'} />
        <span>{open ? M.toggleHide : M.toggleShow}</span>
      </button>

      {open ? (
        <div style={gridStyle}>
          {(['newGames', 'existingGames'] as const).map((group) => (
            <fieldset key={group} style={{ border: 'none', margin: 0, padding: 0 }}>
              <legend className="settings-card-note" style={{ fontWeight: 600, padding: 0 }}>
                {GROUP_TITLE[group]}
              </legend>
              <div style={groupStyle}>
                {IMPORT_FIELDS.map((field) => (
                  <label key={field} style={checkStyle}>
                    <input
                      type="checkbox"
                      checked={prefs[group][field]}
                      aria-label={M.fieldAria(M.labels[field], GROUP_TITLE[group])}
                      onChange={(event) => onChange(group, field, event.target.checked)}
                    />
                    <span>{M.labels[field]}</span>
                  </label>
                ))}
              </div>
              {group === 'existingGames' ? (
                <p className="settings-card-note" style={{ margin: '0.5rem 0 0' }}>{M.existingHint}</p>
              ) : null}
            </fieldset>
          ))}
        </div>
      ) : (
        <div style={gridStyle}>
          {(['newGames', 'existingGames'] as const).map((group) => (
            <p key={group} className="settings-card-note" style={{ margin: 0 }}>
              <strong>{GROUP_TITLE[group]}: </strong>
              {summarize(prefs[group])}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
