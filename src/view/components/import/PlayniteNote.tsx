import { UI_MESSAGES } from '../../../core/constants/labels';
// La hoja del flujo de importación se importa AQUÍ y no desde `index.scss`: este componente lo renderiza una
// pantalla perezosa (el grupo de Integración de Ajustes), así que su CSS viaja en ese chunk y no en el arranque.
import '../../../styles/import.scss';

const M = UI_MESSAGES.import.integrations;

/**
 * De dónde salen los juegos que trae la importación, dicho con chips en vez de con un párrafo.
 *
 * Antes era una frase dentro de un muro de cinco —«Engloba las tiendas de PC (Steam, GOG, Epic…)»— y la única
 * forma de saber si tu tienda estaba era leerlo entero. Una lista de nombres se lee de un vistazo y contesta la
 * única pregunta que se hace aquí: ¿está la mía?
 *
 * Las fichas NO son pulsables: son una lista de nombres, y hacer que algunas abrieran cosas y otras no es lo
 * que ya falló antes. Los pasos de PlayStation viven con la otra guía, en {@link ImportGuides}, donde las dos
 * tienen la misma cara.
 */
export function PlayniteNote() {
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
          <li className="import-store-chip">PlayStation</li>
          <li className="import-store-chip">Xbox</li>
        </ul>
      </div>

      <p className="settings-card-note import-merge">{M.mergeNote}</p>
    </>
  );
}
