import { useState } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
// La hoja del flujo de importación se importa AQUÍ y no desde `index.scss`: este componente lo renderizan dos
// pantallas perezosas (Integraciones y Cuenta), así que su CSS viaja en esos chunks y no pesa en el arranque.
import '../../../styles/import.scss';

const M = UI_MESSAGES.import.integrations;

function Guide({ title, steps }: { title: string; steps: readonly string[] }) {
  return (
    <div className="settings-card-note import-guide">
      <p className="import-steps-title">{title}</p>
      <ol className="import-steps">
        {steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Nota de Integraciones: la palabra «PlayStation» del propio texto es pulsable y despliega
 * (mostrar/ocultar) una guía paso a paso para instalar su complemento de biblioteca en Playnite.
 * (Xbox no lleva guía: su complemento viene integrado en Playnite por defecto.)
 * Se usa igual en /integraciones y en /cuenta.
 */
export function PlayniteNote() {
  const [psnOpen, setPsnOpen] = useState(false);

  const note = M.note;
  const p = note.indexOf('PlayStation');

  return (
    <>
      <p className="settings-card-note">
        {p >= 0 ? (
          <>
            {note.slice(0, p)}
            <button type="button" className="import-guide-link" aria-expanded={psnOpen} onClick={() => setPsnOpen((v) => !v)}>
              PlayStation
            </button>
            {note.slice(p + 'PlayStation'.length)}
          </>
        ) : (
          note
        )}
      </p>
      {psnOpen ? <Guide title={M.consoles.psn.title} steps={M.consoles.psn.steps} /> : null}
    </>
  );
}
