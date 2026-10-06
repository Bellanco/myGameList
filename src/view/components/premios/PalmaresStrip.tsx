import { memo } from 'react';
import { Link } from 'react-router-dom';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import {
  isParticipation,
  palmaresCompetition,
  palmaresPlace,
  palmaresYear,
  shortYear,
  sortPalmares,
} from '../../../core/premios/palmares';
import type { PalmaresEntry } from '../../../model/types/premios';
import { resultsPath } from '../../../viewmodel/premios/premiosRoutes';
// La hoja de la vitrina se importa aquí: el perfil social, que es donde se pinta, va en otro chunk que la sección de
// premios, y sin esto los banderines saldrían sin estilo sin que nada lo avisara.
import '../../../styles/premios.scss';

const L = PREMIOS_UI.palmares;

/**
 * LA VITRINA DEL PALMARÉS en la ficha de un perfil: las ediciones de la porra en las que esa persona quedó entre
 * los cinco primeros o, desde 2025, en las que participó.
 *
 * Va DELANTE de la tira de logros y separada. Es lo más raro que puede tener un perfil —cinco puestos por
 * edición y una edición al año, más la participación de quien votó y no entró—, y mezclada entre las medallas del catálogo, que se cuentan por decenas, se
 * perdería. Esa separación es lo que la hace «especial» sin necesidad de ningún adorno extra.
 *
 * BANDERINES, NO MEDALLAS (06-10-2026). Con el disco redondo de los logros —aunque fuera en otro metal— la vitrina se
 * leía como «otra fila de logros». Ahora cada edición es una CINTA con colas de golondrina, la banda de un
 * campeonato: el puesto, la competición entera y el año. El metal (oro, plata, bronce, cobre; azul la
 * participación) sigue diciendo el puesto de un vistazo, pero la forma ya no se confunde con el catálogo.
 *
 * Sin título: «Palmarés» se queda como nombre de la región, y a la vista la separa de la tira de logros un filete
 * fino (en la hoja). En el móvil el banderín encoge —más bajo, letra menor, año a dos cifras— y la competición
 * sigue entera: abreviada no se sabe qué se ganó.
 *
 * LA PARTICIPACIÓN DICE EN QUÉ PUESTO QUEDÓ (`PalmaresEntry.place`); sin él dice «Participó».
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
  // Por el AÑO DE LA EDICIÓN, no por la fecha de concesión: las ediciones antiguas se importaron todas a la vez,
  // y por fecha 2020 saldría delante de 2025 solo por haber entrado después.
  const ordenadas = sortPalmares(entries);

  if (ordenadas.length === 0) return null;

  return (
    <section className="premios-palmares" aria-label={L.title}>
      <ul className="premios-palmares__list">
        {ordenadas.map((entry) => {
          const puesto = palmaresPlace(entry);
          const anio = palmaresYear(entry);
          return (
            <li key={`${entry.seasonId}-${entry.rank}`} className="premios-palmares__item" data-metal={metalDe(entry)}>
              {/* El ENLACE no se recorta: la cinta va en la capa de dentro. Con el `clip-path` en el enlace, el
                  contorno de foco se cortaba con las colas y el teclado no veía dónde estaba. */}
              <Link
                className="premios-palmares__link"
                to={resultsPath(entry.seasonId)}
                aria-label={L.entryAria(entry.rank, entry.seasonName, puesto)}
                title={L.entry(entry.rank, entry.seasonName, puesto)}
              >
                <span className="premios-palmares__band" aria-hidden="true">
                  <span className="premios-palmares__rank">{L.bandRank(puesto)}</span>
                  <span className="premios-palmares__name">{palmaresCompetition(entry)}</span>
                  {anio ? (
                    <span className="premios-palmares__year">
                      <span className="premios-palmares__year-full">{anio}</span>
                      <span className="premios-palmares__year-short">{shortYear(anio)}</span>
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
});

/** El metal de la cinta: el del puesto, como en la medalla; la participación, azul (no es un puesto). */
function metalDe(entry: PalmaresEntry): string {
  if (isParticipation(entry)) return 'azul';
  if (entry.rank <= 1) return 'oro';
  if (entry.rank === 2) return 'plata';
  if (entry.rank === 3) return 'bronce';
  return 'cobre';
}
