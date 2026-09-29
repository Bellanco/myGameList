// TMDB (The Movie Database): pósters de series y películas, y fotos de actores, para los nominados de premios que
// no son juegos (ver `src/core/premios/nomineeKind`). IGDB solo tiene juegos: la serie «The Last of Us» casaba
// con el juego, y «Arcane» con un juego de 2016 que se llama igual.
//
// Esta carpeta la compila Cloudflare Pages, no Vite, así que aquí no se importa nada del bundle (misma regla que
// `_lib/http.ts` y `_lib/igdbCover.ts`). Lo usan `functions/poster.ts`, `functions/api/tmdb-search.ts` y su
// gemelo de desarrollo en `vite.config.ts`.
//
// NO HAY EMPAREJAMIENTO AUTOMÁTICO, y es la decisión que manda sobre todo lo demás: el administrador busca y
// ELIGE la ficha. Un nombre de persona tiene homónimos («Troy Baker» salen dos) y una serie, documentales con el
// mismo título; una imagen que nadie ha confirmado es justo lo que se quería evitar.

const TMDB_API = 'https://api.themoviedb.org/3';
const TMDB_IMAGENES = 'https://image.tmdb.org/t/p';

/**
 * Qué se busca. `person` para interpretaciones; `screen` para cine o serie, que en TMDB son dos tipos de ficha
 * (`movie` y `tv`) y se piden juntos con la búsqueda múltiple.
 */
export type TipoBusquedaTmdb = 'person' | 'screen';

/** El tipo de la ficha elegida. Se guarda con el nominado para poder auditar qué se eligió. */
export type TipoFichaTmdb = 'person' | 'movie' | 'tv';

/** Un candidato tal y como lo ve el panel: lo justo para reconocerlo y elegirlo. */
export interface CandidatoTmdb {
  kind: TipoFichaTmdb;
  id: number;
  /** Título o nombre en español si TMDB lo tiene; si no, el original. */
  title: string;
  /** El original, cuando difiere: «La casa de papel» ↔ «Money Heist». */
  originalTitle?: string;
  /** Año de estreno. Las personas no tienen. */
  year?: string;
  /** Ruta de la imagen en TMDB («/abc.jpg»). Solo se ofrecen candidatos que la tienen. */
  path: string;
  /** Para personas: dos o tres títulos por los que se le conoce, que es lo que separa a los homónimos. */
  knownFor?: string[];
}

/** Tope del texto buscado: el mismo orden que el de un título de juego en `/cover`. */
export const MAX_BUSQUEDA_TMDB = 200;

/** Cuántos candidatos se devuelven. Con más, la rejilla del panel deja de leerse de un vistazo. */
const MAX_CANDIDATOS = 12;

/**
 * DOS TAMAÑOS, los mismos papeles que en `/cover`: `normal` para la ranura 3:4 en una pantalla de densidad
 * sencilla (~205 px de ancho) y `medio` para la de densidad doble (~471 px reales).
 */
const TAMANOS = { normal: 'w342', medio: 'w500' } as const;
export type TamanoPoster = keyof typeof TAMANOS;

export function tamanoPoster(valor: string | null | undefined): TamanoPoster {
  return valor === 'medio' ? 'medio' : 'normal';
}

/**
 * ¿Es una ruta de imagen de TMDB? Es lo que impide que `/poster` sea un proxy abierto: solo sirve rutas con esta
 * forma, y siempre de `image.tmdb.org`. Las de TMDB son un nombre alfanumérico de ~27 caracteres con extensión.
 */
export function esRutaDeImagenTmdb(ruta: string | null | undefined): ruta is string {
  return typeof ruta === 'string' && /^\/[A-Za-z0-9]{10,64}\.(jpg|png)$/.test(ruta);
}

export function urlDeImagenTmdb(ruta: string, tamano: TamanoPoster): string {
  return `${TMDB_IMAGENES}/${TAMANOS[tamano]}${ruta}`;
}

interface ResultadoTmdb {
  id?: number;
  media_type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  profile_path?: string | null;
  known_for?: Array<{ title?: string; name?: string }>;
}

/** Convierte un resultado de TMDB en candidato, o `null` si no sirve (sin imagen, o de un tipo que no toca). */
export function aCandidato(resultado: ResultadoTmdb, tipo: TipoBusquedaTmdb): CandidatoTmdb | null {
  const kind: TipoFichaTmdb | null =
    tipo === 'person'
      ? 'person'
      : resultado.media_type === 'movie' || resultado.media_type === 'tv'
        ? resultado.media_type
        : null;
  if (!kind || typeof resultado.id !== 'number') return null;

  const path = kind === 'person' ? resultado.profile_path : resultado.poster_path;
  // Sin imagen no hay nada que elegir: la portada de casa ya la pone la tarjeta sin preguntarle a nadie.
  if (!esRutaDeImagenTmdb(path)) return null;

  const title = (kind === 'movie' ? resultado.title : resultado.name) || '';
  const original = (kind === 'movie' ? resultado.original_title : resultado.original_name) || '';
  const fecha = (kind === 'movie' ? resultado.release_date : resultado.first_air_date) || '';
  const knownFor = (resultado.known_for || [])
    .map((obra) => obra.title || obra.name || '')
    .filter(Boolean)
    .slice(0, 3);

  return {
    kind,
    id: resultado.id,
    title: title || original,
    ...(original && original !== title ? { originalTitle: original } : {}),
    ...(/^\d{4}/.test(fecha) ? { year: fecha.slice(0, 4) } : {}),
    path,
    ...(kind === 'person' && knownFor.length ? { knownFor } : {}),
  };
}

/**
 * Busca en TMDB. `null` si no se ha podido preguntar (token rechazado, límite, red): quien llama lo distingue de
 * «no hay resultados», que es una lista vacía.
 *
 * EN ESPAÑOL DE ESPAÑA si existe (`es-ES`): títulos y pósters localizados, y el original cuando no hay traducción,
 * que es lo que TMDB hace solo con ese parámetro.
 */
export async function buscarEnTmdb(
  token: string,
  consulta: string,
  tipo: TipoBusquedaTmdb,
  pedir: typeof fetch = fetch,
): Promise<CandidatoTmdb[] | null> {
  const ruta = tipo === 'person' ? 'search/person' : 'search/multi';
  const parametros = new URLSearchParams({ query: consulta, language: 'es-ES', include_adult: 'false' });
  try {
    const respuesta = await pedir(`${TMDB_API}/${ruta}?${parametros.toString()}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!respuesta.ok) return null;
    const cuerpo = (await respuesta.json()) as { results?: ResultadoTmdb[] };
    return (cuerpo.results || [])
      .map((resultado) => aCandidato(resultado, tipo))
      .filter((candidato): candidato is CandidatoTmdb => candidato !== null)
      .slice(0, MAX_CANDIDATOS);
  } catch {
    return null;
  }
}
