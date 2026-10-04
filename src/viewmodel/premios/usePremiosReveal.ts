/**
 * Los votos de cada uno de la edición publicada y sin terminar, para quien votó en ella.
 *
 * SOLO SE PIDE CUANDO PUEDE SALIR BIEN: con sesión, con papeleta propia y mirando el archivo de ESTA edición.
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
