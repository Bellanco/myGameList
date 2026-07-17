import { type CSSProperties, useState } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';

const M = UI_MESSAGES.import.integrations;

const linkStyle: CSSProperties = {
  background: 'none',
  border: 0,
  padding: 0,
  margin: 0,
  font: 'inherit',
  color: 'var(--steam)',
  cursor: 'pointer',
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
  fontWeight: 600,
};

const panelStyle: CSSProperties = {
  marginTop: '0.6rem',
  padding: '0.75rem 0.9rem',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--surface)',
};

const stepsStyle: CSSProperties = {
  margin: '0.35rem 0 0',
  paddingLeft: '1.2rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
};

function Guide({ title, steps }: { title: string; steps: readonly string[] }) {
  return (
    <div className="settings-card-note" style={panelStyle}>
      <p style={{ margin: 0, fontWeight: 700 }}>{title}</p>
      <ol style={stepsStyle}>
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
            <button type="button" style={linkStyle} aria-expanded={psnOpen} onClick={() => setPsnOpen((v) => !v)}>
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
