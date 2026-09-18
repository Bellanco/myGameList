import { useMemo, useState, type ReactNode } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { isWindows } from '../../../core/utils/platform';
import { Icon } from '../Icon';
// La hoja del flujo de importación se importa AQUÍ y no desde `index.scss`: la pantalla que la usa es perezosa,
// así que su CSS viaja en ese chunk y no pesa en el arranque.
import '../../../styles/import.scss';

const M = UI_MESSAGES.import.integrations;

/**
 * LAS DOS GUÍAS, CON LA MISMA CARA. Cómo traer tu biblioteca y cómo añadir los juegos de PlayStation son lo
 * mismo —una lista de pasos que se despliega—, y hasta ahora una era un enlace subrayado y la otra una palabra
 * pulsable escondida en mitad de un párrafo: dos formas distintas para la misma cosa, y ninguna decía que
 * detrás había pasos. Como filas iguales, con su flecha, se ve de un vistazo que hay dos guías y que se abren.
 */
function Guia({ title, steps }: { title: string; steps: readonly ReactNode[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`import-guide-block ${open ? 'is-open' : ''}`.trim()}>
      <button
        type="button"
        className="import-guide-row"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{title}</span>
        <Icon name="chevron-down" className="ui-icon import-guide-caret" />
      </button>
      {open ? (
        <ol className="import-steps">
          {steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

export function ImportGuides() {
  /**
   * El primer paso lleva el enlace de descarga PEGADO, y solo en Windows: es donde único se puede instalar
   * Playnite. Se calcula una vez —el sistema no cambia a mitad de visita— y lo que decide es qué se enseña,
   * nunca qué se puede hacer.
   */
  const pasos = useMemo<readonly ReactNode[]>(() => {
    if (!isWindows()) return M.steps;
    const [primero, ...resto] = M.steps;
    return [
      <>
        {primero}{' '}{M.downloadHint}{' '}
        <a href={M.downloadUrl} target="_blank" rel="noopener noreferrer">{M.downloadLabel}</a>.
      </>,
      ...resto,
    ];
  }, []);

  return (
    <div className="import-guides">
      <Guia title={M.stepsTitle} steps={pasos} />
      <Guia title={M.consoles.psn.title} steps={M.consoles.psn.steps} />
    </div>
  );
}
