import { useState } from 'react';
import type { ImportField, ImportFieldGroup, ImportFieldPrefs } from '../../../model/types/import';
import { IMPORT_FIELDS } from '../../../core/import/fieldPrefs';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { Icon } from '../Icon';
import '../../../styles/import.scss';

const M = UI_MESSAGES.import.inbox.fields;

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
        className="btn btn-secondary import-card-action"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={open ? 'chevron-up' : 'chevron-down'} />
        <span>{open ? M.toggleHide : M.toggleShow}</span>
      </button>

      {open ? (
        <div className="import-fields">
          {(['newGames', 'existingGames'] as const).map((group) => (
            <fieldset key={group} className="import-fields-set">
              <legend className="settings-card-note import-fields-legend">{GROUP_TITLE[group]}</legend>
              <div className="import-fields-list">
                {IMPORT_FIELDS.map((field) => (
                  <label key={field} className="import-check">
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
                <p className="settings-card-note import-fields-hint">{M.existingHint}</p>
              ) : null}
            </fieldset>
          ))}
        </div>
      ) : (
        <div className="import-fields">
          {(['newGames', 'existingGames'] as const).map((group) => (
            <p key={group} className="settings-card-note">
              <strong>{GROUP_TITLE[group]}: </strong>
              {summarize(prefs[group])}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
