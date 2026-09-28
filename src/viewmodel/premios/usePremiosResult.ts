/**
 * El archivo de una edición publicada.
 *
 * SE RESUELVE POR ID Y CON UNA SOLA LECTURA: el pedido en la dirección, o el que apunte la configuración. Nunca
 * listando la colección — al público las reglas solo le dejan leer los archivos ya cerrados, y una consulta que
 * tropiece con un documento prohibido falla entera.
 *
 * Funciona SIN SESIÓN, que es el sentido de haber abierto esta lectura: quien recibe el enlace de una edición ve
 * quién ganó sin tener cuenta.
 */
import { useEffect, useMemo, useState } from 'react';
import { assignDenseRanks } from '../../core/premios/scoring';
import { fetchSeasonResult } from '../../model/repository/premios/premiosSeasonRepository';
import type { PremiosArchivedEntry, PremiosSeasonResult, PremiosVotingConfig } from '../../model/types/premios';

export interface PremiosResult {
  loading: boolean;
  result: PremiosSeasonResult | null;
  /** La clasificación con el puesto RECALCULADO (ver abajo). */
  leaderboard: PremiosArchivedEntry[];
}

export function usePremiosResult(
  seasonId: string,
  config: PremiosVotingConfig | null,
): PremiosResult {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<PremiosSeasonResult | null>(null);

  const id = seasonId || config?.lastPublishedId || '';

  useEffect(() => {
    let vivo = true;
    if (!id) {
      setResult(null);
      setLoading(false);
      return () => {
        vivo = false;
      };
    }
    setLoading(true);
    void fetchSeasonResult(id)
      .then((archivo) => {
        if (vivo) setResult(archivo);
      })
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, [id]);

  // EL PUESTO SE RECALCULA AL LEER, no se cree el que venga guardado: los archivos publicados antes del ranking
  // denso guardaban la POSICIÓN en la lista, así que un empate salía como 1, 2, 3 en vez de 1, 1, 2. Recalcular
  // es idempotente y evita migrar nada.
  //
  // Salvo en una edición SIN PUNTUACIÓN: ahí los puntos son todos 0 y recalcular pondría a todo el mundo primero.
  // El puesto guardado es el único dato que hay, y manda.
  const leaderboard = useMemo(
    () =>
      result?.unscored
        ? [...(result.leaderboard || [])].sort((a, b) => a.rank - b.rank)
        : (assignDenseRanks(result?.leaderboard || []) as PremiosArchivedEntry[]),
    [result],
  );

  return { loading, result, leaderboard };
}
