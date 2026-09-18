import { useState } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
// La hoja del flujo de importación se importa AQUÍ y no desde `index.scss`: este componente lo renderiza una
// pantalla perezosa (el grupo de Integración de Ajustes), así que su CSS viaja en ese chunk y no en el arranque.
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
 * De dónde salen los juegos que trae la importación, dicho con chips en vez de con un párrafo.
 *
 * Antes era una frase dentro de un muro de cinco —«Engloba las tiendas de PC (Steam, GOG, Epic…)»— y la única
 * forma de saber si tu tienda estaba era leerlo entero. Una lista de nombres se lee de un vistazo y contesta la
 * única pregunta que se hace aquí: ¿está la mía?
 *
 * LA GUÍA DE PLAYSTATION CUELGA DE SU CHIP. Antes colgaba de la palabra «PlayStation» dentro del párrafo, que
 * era un enlace escondido en mitad de un texto: nadie que no lo supiera iba a encontrarlo. Ahora el chip de
 * PlayStation es el que despliega sus pasos, y se ve que es pulsable. (Xbox no lleva guía: su complemento viene
 * con Playnite.)
 */
export function PlayniteNote() {
  const [psnOpen, setPsnOpen] = useState(false);

  return (
    <>
      <p className="settings-card-note import-requires">{M.requires}</p>

      <div className="import-stores">
        <p className="settings-card-sub">{M.storesLabel}</p>
        <ul className="import-store-chips">
          {M.stores.map((store) => (
            <li key={store} className="import-store-chip">{store}</li>
          ))}
        </ul>

        <p className="settings-card-sub">{M.consolesLabel}</p>
        <ul className="import-store-chips">
          <li>
            <button
              type="button"
              className="import-store-chip is-guide"
              aria-expanded={psnOpen}
              onClick={() => setPsnOpen((v) => !v)}
            >
              PlayStation
            </button>
          </li>
          <li className="import-store-chip">Xbox</li>
        </ul>
      </div>

      {psnOpen ? <Guide title={M.consoles.psn.title} steps={M.consoles.psn.steps} /> : null}

      <p className="settings-card-note import-merge">{M.mergeNote}</p>
    </>
  );
}
