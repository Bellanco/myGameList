/**
 * La búsqueda de carátulas de IGDB del panel de premios (ver `functions/api/igdb-search.ts`).
 *
 * Solo la usa el administrador, al editar una categoría de juegos cuyo nominado sale con la carátula equivocada:
 * busca, ve los candidatos con su año y sus plataformas y ELIGE uno. La votación no llama nunca aquí; pinta la
 * carátula ya elegida por `/cover?i=`.
 *
 * LANZA con un mensaje que se puede enseñar tal cual: quien llama lo pone en el panel debajo del buscador.
 */
import type { PremiosIgdbCandidate } from '../../types/premios';
import { shareAuthHeaders } from '../shareRepository';

export interface BusquedaIgdb {
  candidatos: PremiosIgdbCandidate[];
  /** `image_id` de la carátula que sale hoy para ese nombre sin elegir nada, o `null` si no hay ninguna resuelta. */
  automatica: string | null;
}

export async function buscarCaratulasIgdb(consulta: string): Promise<BusquedaIgdb> {
  const headers = await shareAuthHeaders(() => new Error('Hace falta iniciar sesión para buscar en IGDB.'));
  const parametros = new URLSearchParams({ q: consulta.trim() });
  const respuesta = await fetch(`/api/igdb-search?${parametros.toString()}`, { headers });
  const cuerpo = (await respuesta.json().catch(() => null)) as {
    results?: PremiosIgdbCandidate[];
    automatic?: string | null;
    error?: string;
  } | null;
  if (!respuesta.ok) {
    throw new Error(cuerpo?.error || 'No se ha podido buscar en IGDB.');
  }
  return {
    candidatos: Array.isArray(cuerpo?.results) ? cuerpo.results : [],
    automatica: typeof cuerpo?.automatic === 'string' ? cuerpo.automatic : null,
  };
}
