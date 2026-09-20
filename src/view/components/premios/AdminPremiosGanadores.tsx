import { useEffect, useMemo, useState } from 'react';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { getCategoryTitle, getOptionId, tField } from '../../../core/premios/localize';
import { fetchWinners, saveWinners } from '../../../model/repository/premios/premiosWinnersRepository';
import type { PremiosCategory, PremiosWinnersMap } from '../../../model/types/premios';

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
 * queda por marcar. Son los mismos de la pantalla de votar, más pequeños, porque aquí no hay que elegir con
 * gusto sino apuntar un resultado que ya se sabe.
 */
export interface AdminPremiosGanadoresProps {
  categories: PremiosCategory[];
  busy: boolean;
  ejecutar: (accion: () => Promise<string>) => Promise<void>;
}

export function AdminPremiosGanadores({ categories, busy, ejecutar }: AdminPremiosGanadoresProps) {
  const [winners, setWinners] = useState<PremiosWinnersMap>({});

  // Las que no tienen nominados no pueden tener ganador, así que ni se ofrecen.
  const votables = useMemo(
    () => categories.filter((category) => (category.options?.length || 0) > 0),
    [categories],
  );

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

  const marcados = votables.filter((category) => winners[category.id]).length;

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
              return (
                <li key={category.id} className="premios-admin__cat">
                  <div className="premios-admin__cat-head">
                    <strong>{titulo}</strong>
                  </div>

                  {/* `role="group"` y `aria-pressed` y no un grupo de radios: marcar un ganador se deshace
                      volviendo a pulsarlo, y un radio no se puede desmarcar. El botón «Sin ganador» hace lo
                      mismo y está siempre, para quien navegue con el teclado de izquierda a derecha. */}
                  <div className="premios-admin__picks" role="group" aria-label={titulo}>
                    <button
                      type="button"
                      className={`premios-admin__pick${winners[category.id] ? '' : ' is-none'}`}
                      aria-pressed={!winners[category.id]}
                      onClick={() =>
                        setWinners((prev) => {
                          const next = { ...prev };
                          delete next[category.id];
                          return next;
                        })
                      }
                    >
                      {L.pick}
                    </button>

                    {(category.options || []).map((option, index) => {
                      const id = getOptionId(option, category.id, index);
                      const elegido = winners[category.id] === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          className={`premios-admin__pick${elegido ? ' is-winner' : ''}`}
                          aria-pressed={elegido}
                          onClick={() =>
                            setWinners((prev) => {
                              const next = { ...prev };
                              // Volver a pulsar el que ya estaba marcado lo quita: es el gesto que se espera de
                              // un botón que se queda hundido.
                              if (elegido) delete next[category.id];
                              else next[category.id] = id;
                              return next;
                            })
                          }
                        >
                          {tField(option)}
                        </button>
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
