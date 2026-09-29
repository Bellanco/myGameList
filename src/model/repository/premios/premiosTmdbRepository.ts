/**
 * La búsqueda de imágenes de TMDB del panel de premios (ver `functions/api/tmdb-search.ts`).
 *
 * Solo la usa el administrador, al editar una categoría de interpretaciones o de cine o serie: busca, ve los
 * candidatos y ELIGE uno. La votación no llama nunca aquí; pinta la imagen ya elegida por `/poster`.
 *
 * LANZA con un mensaje que se puede enseñar tal cual: quien llama lo pone en el panel debajo del buscador.
 */
import type { PremiosNomineeKind, PremiosTmdbCandidate } from '../../types/premios';
import { shareAuthHeaders } from '../shareRepository';

export async function buscarImagenesTmdb(
  consulta: string,
  tipo: Exclude<PremiosNomineeKind, 'game'>,
): Promise<PremiosTmdbCandidate[]> {
  const headers = await shareAuthHeaders(() => new Error('Hace falta iniciar sesión para buscar en TMDB.'));
  const parametros = new URLSearchParams({ q: consulta.trim(), k: tipo === 'person' ? 'person' : 'screen' });
  const respuesta = await fetch(`/api/tmdb-search?${parametros.toString()}`, { headers });
  const cuerpo = (await respuesta.json().catch(() => null)) as { results?: PremiosTmdbCandidate[]; error?: string } | null;
  if (!respuesta.ok) {
    throw new Error(cuerpo?.error || 'No se ha podido buscar en TMDB.');
  }
  return Array.isArray(cuerpo?.results) ? cuerpo.results : [];
}
