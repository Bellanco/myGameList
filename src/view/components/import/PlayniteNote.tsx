import { UI_MESSAGES } from '../../../core/constants/labels';
// La hoja del flujo de importación se importa AQUÍ y no desde `index.scss`: la pantalla que la usa es perezosa,
// así que su CSS viaja en ese chunk y no pesa en el arranque.
import '../../../styles/import.scss';

const M = UI_MESSAGES.import.integrations;

/**
 * Qué trae la importación y qué hace falta para usarla: dos frases y ninguna pieza más.
 *
 * Aquí hubo un párrafo de cinco frases, y después siete fichas con los nombres de las tiendas. Las fichas
 * leían bien pero prometían lo que no eran —tenían forma de botón sin serlo, y una de ellas SÍ lo era, que fue
 * justo la confusión que hubo que deshacer—. Siete nombres dentro de una frase se leen igual de rápido, no
 * piden que nadie los pulse y ocupan una línea en vez de cuatro.
 */
export function PlayniteNote() {
  return (
    <>
      <p className="settings-card-sub">{M.sources}</p>
      <p className="settings-card-sub">{M.requires}</p>
    </>
  );
}
