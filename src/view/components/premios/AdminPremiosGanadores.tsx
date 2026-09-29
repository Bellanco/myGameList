import { useEffect, useMemo, useState } from 'react';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { archivableCategories, getValidWinnerId } from '../../../core/premios/archivable';
import { getCategoryTitle, getOptionId, tField } from '../../../core/premios/localize';
import { hasGameCovers } from '../../../core/premios/nomineeKind';
import { nomineeImageOf } from '../../../core/premios/nomineeImage';
import { fetchWinners, saveWinners } from '../../../model/repository/premios/premiosWinnersRepository';
import type { PremiosCategory, PremiosOption, PremiosWinnersMap } from '../../../model/types/premios';
import { NomineeCard } from './NomineeCard';

const L = PREMIOS_UI.admin.winners;

/**
 * Marcar quién ganó cada categoría.
 *
 * SE GUARDAN DONDE NO LOS VE NADIE. Los ganadores vivieron en la categoría, que es de lectura abierta porque
 * hace falta para votar, así que cualquiera podía consultarlos en cuanto se marcaban — mucho antes del anuncio.
 * Ahora van a un documento que solo lee quien modera, y el único canal público es el archivo publicado.
 *
 * Se guardan TODOS DE UNA VEZ: era una escritura por categoría, y con veintiséis eso son veintiséis viajes y la
 * posibilidad de quedarse a medias.
 *
 * SE MARCAN CON BOTONES, NO CON UN DESPLEGABLE. Con veintiséis categorías de cinco nominados, el desplegable
 * obligaba a abrir, leer y elegir a ciegas —los nominados solo se veían de uno en uno, y para comparar dos había
 * que abrirlo dos veces—. En botones están TODOS a la vista: se marca de una pulsada y se ve de un vistazo qué
 * queda por marcar.
 *
 * Y SON LAS TARJETAS DE VOTAR, con su carátula (29-09-2026), en una rejilla más pequeña. Así este es también el
 * sitio donde ver las portadas tal y como las verá quien vote —las mismas, pedidas igual, solo lo ya resuelto—
 * sin tener que abrir la edición para comprobarlas. Eran píldoras de texto.
 */
export interface AdminPremiosGanadoresProps {
  categories: PremiosCategory[];
  busy: boolean;
  ejecutar: (accion: () => Promise<string>) => Promise<void>;
}

export function AdminPremiosGanadores({ categories, busy, ejecutar }: AdminPremiosGanadoresProps) {
  const [winners, setWinners] = useState<PremiosWinnersMap>({});

  // Las que no se van a archivar no pueden tener ganador, así que ni se ofrecen. MISMO criterio que el del
  // bloque de publicar (`archivable`): lo que aquí se puede marcar es exactamente lo que allí se exige.
  const votables = useMemo(() => archivableCategories(categories), [categories]);

  useEffect(() => {
    let vivo = true;
    void fetchWinners(categories)
      .then((actuales) => {
        if (vivo) setWinners(actuales);
      })
      .catch(() => {
        // Sin ganadores previos se empieza en blanco, que es el caso normal de una edición nueva.
      });
    return () => {
      vivo = false;
    };
  }, [categories]);

  // Un ganador cuyo nominado ya no exista no cuenta: se le quitaron los nominados a la categoría después de
  // marcarlo y el id se quedó en el mapa. La cuenta tiene que decir lo mismo que el bloque de publicar.
  const marcados = votables.filter((category) => getValidWinnerId(category, winners)).length;

  const guardar = () =>
    ejecutar(async () => {
      const result = await saveWinners(categories, winners);
      const partes = [L.saved(result.saved)];
      if (result.skipped > 0) partes.push(L.skipped(result.skipped));
      if (result.migrated > 0) partes.push(L.migrated(result.migrated));
      return partes.join(' ');
    });

  return (
    <div className="premios-admin__block">
      <h3>{L.title}</h3>
      <p className="premios-admin__muted">{L.hint}</p>

      {votables.length === 0 ? (
        <p>{L.empty}</p>
      ) : (
        <>
          <p className="premios-admin__stage">{L.count(marcados, votables.length)}</p>

          <ul className="premios-admin__cats">
            {votables.map((category) => {
              const titulo = getCategoryTitle(category);
              const ganador = getValidWinnerId(category, winners);
              const conCaratula = hasGameCovers(category);
              return (
                <li key={category.id} className="premios-admin__cat">
                  <div className="premios-admin__cat-head">
                    <strong>{titulo}</strong>
                  </div>

                  {/* `role="group"` y `aria-pressed` y no un grupo de radios: marcar un ganador se deshace
                      volviendo a pulsarlo, y un radio no se puede desmarcar.
                      «SIN GANADOR» ES UNA TARJETA MÁS, LA PRIMERA, con el mismo tamaño que los nominados y marcada
                      cuando es lo que hay: era una píldora aparte, más pequeña, y con la categoría sin marcar no se
                      veía nada seleccionado. Así la rejilla dice siempre cuál es el estado. */}
                  <div className="premios-admin__nominee-grid" role="group" aria-label={titulo}>
                    <button
                      type="button"
                      className={`premios-nominee premios-admin__no-winner${ganador ? '' : ' is-selected'}`}
                      aria-pressed={!ganador}
                      onClick={() =>
                        setWinners((prev) => {
                          const next = { ...prev };
                          delete next[category.id];
                          return next;
                        })
                      }
                    >
                      <span className="premios-nominee__slot">
                        <span className="premios-admin__no-winner-slot" aria-hidden="true">—</span>
                      </span>
                      <span className="premios-nominee__body">
                        <span className="premios-nominee__name">{L.pick}</span>
                      </span>
                    </button>

                    {(category.options || []).map((option, index) => {
                      const image = nomineeImageOf(option);
                      const nominado: PremiosOption = {
                        id: getOptionId(option, category.id, index),
                        name: tField(option),
                        ...(image ? { image } : {}),
                      };
                      const elegido = ganador === nominado.id;
                      return (
                        <NomineeCard
                          key={nominado.id}
                          option={nominado}
                          selected={elegido}
                          withCover={conCaratula}
                          ariaLabel={L.markAria(nominado.name)}
                          onChoose={() =>
                            setWinners((prev) => {
                              const next = { ...prev };
                              // Volver a pulsar el que ya estaba marcado lo quita: es el gesto que se espera de
                              // un botón que se queda hundido.
                              if (elegido) delete next[category.id];
                              else next[category.id] = nominado.id;
                              return next;
                            })
                          }
                        />
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>

          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void guardar()}>
            {L.save}
          </button>
        </>
      )}
    </div>
  );
}
