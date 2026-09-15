// `/cover` — la carátula de un juego, servida DESDE ESTE DOMINIO.
//
// POR QUÉ UN PROXY Y NO UN ENLACE DIRECTO A IGDB. Es la pieza que sostiene tres promesas a la vez:
//   · La política dice que usando tus listas no se contacta con ningún servidor ajeno, y el smoke lo comprueba
//     (`tests/e2e/smoke.test.ts`). Un `<img src="https://images.igdb.com/…">` lo rompería en la primera visita.
//   · La CSP de `public/_headers` no lleva `images.igdb.com` en `img-src`, así que esas imágenes se bloquearían
//     en producción sin decir nada: huecos mudos en el mosaico.
//   · Tu IP no tiene por qué llegarle a IGDB por mirar tus propias listas.
// Por eso se devuelven los BYTES y nunca un redirección: un 302 haría que el navegador fuese él a IGDB, que es
// exactamente lo que esto viene a evitar.
//
// POR QUÉ NO CUELGA DE `/api/`. El service worker descarta de la caché todo `/api/*` a propósito (respuestas por
// usuario y revocables, ver su cabecera). Una carátula es lo contrario: pública, igual para todos e inmutable en
// la práctica. Colgando de `/cover` le toca la regla de «resto de GET del mismo origen → caché y revalida», y la
// biblioteca se pinta sin red a partir de la segunda visita.
//
// POR QUÉ EL NOMBRE VA EN LA CADENA DE CONSULTA Y NO EN LA RUTA: hay juegos con barra en el título
// («Half Life / Black Mesa»), y una barra codificada dentro de una ruta la normalizan los intermediarios.
import { resolverCaratula, type EntornoIgdb } from './_lib/igdbCover';

const IMAGENES = 'https://images.igdb.com/igdb/image/upload';
/** Tamaño de IGDB: 264×374, que es lo que pide la ranura 3:4 del mosaico sin quedarse corto en pantallas densas. */
const TAMANO = 't_cover_big';

/** Tope del título. Generoso para nombres reales y suficiente para que nadie use esto como saco de basura. */
const MAX_NOMBRE = 200;
const MAX_PLATAFORMAS = 200;

/** Un mes en el navegador. La carátula de un juego no cambia; si el emparejamiento mejora, cambia la respuesta. */
const CACHE_ACIERTO = 'public, max-age=2592000, stale-while-revalidate=86400';
/**
 * Y NADA cuando no hay carátula. Esta línea decía `max-age=3600` y costó media biblioteca: durante una ráfaga de
 * 429 se sirvieron 56 respuestas «sin carátula» falsas, y el navegador se las guardó una hora — así que aunque el
 * servidor ya devolviera la imagen buena, la página seguía pintando el hueco y no había forma de verlo salvo
 * recargando sin caché. Lo mismo pasaría al corregir una errata del título o al terminar el llenado inicial: el
 * juego estrena carátula y su dueño no la ve.
 *
 * Y no se gana nada guardándolo: lo caro es preguntarle a IGDB, y de eso ya se ocupa la caché negativa de KV,
 * que está del lado del servidor. Aquí lo único que se ahorraría es un 404 de trece bytes.
 */
const CACHE_FALLO = 'no-store';

interface Env extends EntornoIgdb {}

export const onRequestGet: (contexto: { request: Request; env: Env }) => Promise<Response> = async ({ request, env }) => {
  if (!env.IGDB_CLIENT_ID || !env.IGDB_CLIENT_SECRET || !env.COVERS) {
    // Configuración incompleta: fallo nuestro, no del cliente. 501 y no 500 para distinguirlo de una avería.
    return new Response('Las carátulas no están configuradas en este entorno', { status: 501 });
  }

  const url = new URL(request.url);
  const nombre = (url.searchParams.get('n') ?? '').trim();
  const plataformas = (url.searchParams.get('p') ?? '').slice(0, MAX_PLATAFORMAS);

  if (!nombre || nombre.length > MAX_NOMBRE) {
    return new Response('Falta el nombre del juego', { status: 400 });
  }

  const coverId = await resolverCaratula(
    env,
    nombre,
    plataformas.split(',').map((p) => p.trim()).filter(Boolean),
  );

  if (!coverId) {
    // 404 y no una imagen de relleno: quien pinta el hueco es el cliente, que ya tiene su portada de casa puesta
    // debajo. Devolver aquí un PNG genérico obligaría a descargarlo para tapar algo que ya está pintado.
    return new Response('Sin carátula', { status: 404, headers: { 'Cache-Control': CACHE_FALLO } });
  }

  // El id viene de IGDB, pero se valida igual antes de meterlo en una URL: si algún día llega por otro camino,
  // que no pueda salirse de la ruta.
  if (!/^[a-z0-9_-]{1,64}$/i.test(coverId)) {
    return new Response('Identificador de carátula inesperado', { status: 502 });
  }

  const imagen = await fetch(`${IMAGENES}/${TAMANO}/${coverId}.jpg`, {
    // La respuesta de IGDB se cachea en el borde: la misma carátula la comparten todos los que tengan el juego.
    cf: { cacheTtl: 2592000, cacheEverything: true },
  } as RequestInit);

  if (!imagen.ok) {
    return new Response('La carátula no se pudo descargar', { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }

  return new Response(imagen.body, {
    status: 200,
    headers: {
      'Content-Type': imagen.headers.get('Content-Type') ?? 'image/jpeg',
      'Cache-Control': CACHE_ACIERTO,
      // Sin `Vary`: la respuesta depende solo de la URL, y la URL ya lleva nombre y plataformas.
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
