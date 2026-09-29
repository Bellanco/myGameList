// `/poster` — el póster o la foto de TMDB de un nominado de premios, servido DESDE ESTE DOMINIO.
//
// Es el hermano de `/cover` y por las mismas razones (ver su cabecera): la política promete que el navegador no
// habla con servidores ajenos, la CSP no lleva `image.tmdb.org` en `img-src`, y la IP de quien vota no tiene por
// qué llegarle a TMDB. Por eso se devuelven los BYTES y nunca una redirección.
//
// Y cuelga de `/poster` y no de `/api/` por lo mismo que `/cover`: el service worker no guarda nada de `/api/*`,
// y una imagen es pública, igual para todos e inmutable.
//
// NO NECESITA EL TOKEN NI GASTA CUPO. Las imágenes de TMDB son públicas, y aquí no se busca nada: la ruta la
// eligió el administrador en el panel (ver `api/tmdb-search.ts`) y viaja con el nominado. Lo que impide que esto
// sea un proxy abierto es que solo acepta rutas con forma de imagen de TMDB y solo las pide a `image.tmdb.org`.
import { esRutaDeImagenTmdb, tamanoPoster, urlDeImagenTmdb } from './_lib/tmdb';

/**
 * UN AÑO E INMUTABLE, a diferencia de `/cover`. Allí la misma URL puede cambiar de respuesta si mejora el
 * emparejamiento; aquí la URL ES la imagen: una ruta de TMDB nombra un fichero concreto, y si el administrador
 * elige otra, cambia la ruta y con ella la URL.
 */
const CACHE_IMAGEN = 'public, max-age=31536000, immutable';

export const onRequestGet: (contexto: { request: Request }) => Promise<Response> = async ({ request }) => {
  const url = new URL(request.url);
  const ruta = url.searchParams.get('p');
  if (!esRutaDeImagenTmdb(ruta)) {
    return new Response('Ruta de imagen no válida', { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const imagen = await fetch(urlDeImagenTmdb(ruta, tamanoPoster(url.searchParams.get('s'))), {
    // En el borde también: el mismo póster lo ven todos los que votan.
    cf: { cacheTtl: 31536000, cacheEverything: true },
  } as RequestInit).catch(() => null);

  if (!imagen || !imagen.ok) {
    // `no-store`: un fallo de TMDB no es un dato sobre la imagen, y guardarlo taparía el póster cuando vuelva.
    return new Response('La imagen no se pudo descargar', { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }

  return new Response(imagen.body, {
    status: 200,
    headers: {
      'Content-Type': imagen.headers.get('Content-Type') ?? 'image/jpeg',
      'Cache-Control': CACHE_IMAGEN,
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
