/**
 * Los votos de cada uno de una edición publicada, para quien votó en ella, hasta que se abre la siguiente.
 *
 * SOLO SE PIDE CUANDO PUEDE SALIR BIEN, y eso lo decide quien llama (`PremiosHub`): con sesión, saliendo en la
 * clasificación y mirando la edición que guarda los votos.
 * Las reglas lo niegan a cualquier otro (`premiosReveal`), y pedirlo de todos modos sería una lectura gastada y
 * un `permission-denied` en la consola de cada visitante. Ver `docs/plan-premios-votos-a-la-vista.md`.
 */
import { useEffect, useState } from 'react';
import { fetchSeasonReveal } from '../../model/repository/premios/premiosSeasonRepository';
import type { PremiosReveal } from '../../model/types/premios';

/** @param seasonId La edición cuyos votos se piden, o vacío para no pedir nada. */
export function usePremiosReveal(seasonId: string): PremiosReveal | null {
  const [reveal, setReveal] = useState<PremiosReveal | null>(null);

  useEffect(() => {
    let vivo = true;
    setReveal(null);
    if (!seasonId) {
      return () => {
        vivo = false;
      };
    }
    void fetchSeasonReveal(seasonId).then((leido) => {
      if (vivo) setReveal(leido);
    });
    return () => {
      vivo = false;
    };
  }, [seasonId]);

  return reveal;
}
