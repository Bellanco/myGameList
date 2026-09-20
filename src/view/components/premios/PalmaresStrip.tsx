import { memo } from 'react';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import type { PalmaresEntry } from '../../../model/types/premios';
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
            <PalmaresMedal entry={entry} />
            <span className="premios-palmares__caption">{L.entry(entry.rank, entry.seasonName)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
});
