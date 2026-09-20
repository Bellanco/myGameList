import { memo } from 'react';
import { Link } from 'react-router-dom';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import type { PalmaresEntry } from '../../../model/types/premios';
import { resultsPath } from '../../../viewmodel/premios/premiosRoutes';
import { PalmaresMedal } from './PalmaresMedal';

const L = PREMIOS_UI.palmares;

/**
 * LA VITRINA DEL PALMARÉS en la ficha de un perfil: las ediciones de la porra que esa persona ha ganado.
 *
 * Va DELANTE de la tira de logros y separada. Es lo más raro que puede tener un perfil —cinco puestos por
 * edición y una edición al año—, y mezclada entre las medallas del catálogo, que se cuentan por decenas, se
 * perdería. Esa separación es lo que la hace «especial» sin necesidad de ningún adorno extra.
 *
 * Con rótulo, a diferencia de la tira de logros —que es solo imagen—: un trofeo sin edición no dice nada, y son
 * pocos, así que el nombre cabe.
 *
 * Y CADA TROFEO SE PULSA: lleva al resumen de los votos de esa edición (`/premios/resultados/:seasonId`), que es
 * donde está lo que la medalla resume —quién ganó cada categoría y con cuántos votos—. Es la misma dirección que
 * reparte el botón de compartir, así que el archivo se ve igual desde el perfil que desde un enlace recibido, y
 * sin sesión (ver `panelNeedsSession`). Un enlace de verdad y no un manejador: se abre en otra pestaña con el
 * gesto de siempre y el navegador enseña a dónde va.
 *
 * Si no hay ninguno, NO SE PINTA NADA: ni marco vacío ni «todavía no ha ganado». Es el mismo criterio que la
 * tira de logros de quien no publica ninguno.
 */
export const PalmaresStrip = memo(function PalmaresStrip({ entries }: { entries: PalmaresEntry[] }) {
  const ordenadas = [...entries]
    .filter((entry) => entry && entry.seasonId)
    // Lo más reciente primero, y a igualdad de fecha manda el mejor puesto.
    .sort((a, b) => (b.awardedAt || 0) - (a.awardedAt || 0) || (a.rank || 99) - (b.rank || 99));

  if (ordenadas.length === 0) return null;

  return (
    <section className="premios-palmares" aria-label={L.title}>
      <h4 className="premios-palmares__title">{L.title}</h4>
      <ul className="premios-palmares__list">
        {ordenadas.map((entry) => (
          <li key={`${entry.seasonId}-${entry.rank}`} className="premios-palmares__item">
            <Link
              className="premios-palmares__link"
              to={resultsPath(entry.seasonId)}
              aria-label={L.entryAria(entry.rank, entry.seasonName)}
            >
              <PalmaresMedal entry={entry} />
              <span className="premios-palmares__caption">{L.entry(entry.rank, entry.seasonName)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
});
