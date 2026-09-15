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
import { leerCaratulaCacheada, resolverCaratula, type EntornoIgdb } from './_lib/igdbCover';

const IMAGENES = 'https://images.igdb.com/igdb/image/upload';
/**
 * LOS TRES TAMAÑOS, y por qué hacen falta los tres.
 *
 * `t_cover_big` son 264×374: exactamente lo que pide la ranura 3:4 del mosaico, y ~25 kB por juego.
 *
 * `t_1080p` es la misma imagen hasta 1080 px de alto (una portada sale a ~762×1080), y la pide SOLO el renglón
 * de la lista, donde la portada se recorta en una franja que cruza la fila entera: a 1.400 px de ancho, ampliar
 * los 264 px de la pequeña son casi seis aumentos y lo que queda es una mancha de color, que es justo lo que no
 * se quería. Con la grande el aumento baja a menos de dos y la franja se reconoce.
 *
 * Cuesta unos 120 kB por juego en vez de 25, y por eso NO es el tamaño por defecto: lo pide quien lo necesita.
 * El service worker las guarda igual (misma regla de origen propio), así que se paga una vez por juego.
 *
 * `t_720p` (508×720, ~82 kB) es el del medio, y existe por una medición concreta: en una pantalla de densidad
 * doble la caja del mosaico ocupa 471×627 píxeles REALES, así que los 264 de la pequeña se estiran 1,78 veces y
 * la carátula sale blanda. Con este, el aumento desaparece. No sustituye a la pequeña: el mosaico ofrece los dos
 * con `srcset` y es el navegador quien elige, de modo que una pantalla normal se sigue llevando sus 25 kB.
 *
 * NINGUNO de los tres añade entradas al KV: ahí se guarda el emparejamiento (nombre → id de portada), que es el
 * mismo para los tres. Lo único que cambia es de qué URL de IGDB se traen los bytes.
 */
const TAMANOS = { normal: 't_cover_big', medio: 't_720p', ancho: 't_1080p' } as const;
type Tamano = keyof typeof TAMANOS;

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

/**
 * CUÁNTOS JUEGOS NUEVOS PUEDE RESOLVER UNA MISMA IP EN UNA HORA. Sin esto, `/cover` es un proxy abierto a IGDB:
 * cualquiera puede pedirle nombres inventados y gastar la cuota de la aplicación de Twitch, las peticiones de
 * Cloudflare y llenar el KV de claves basura. No hay sesión que exigir —la app funciona sin cuenta—, así que el
 * límite va por IP.
 *
 * Solo cuenta lo que OBLIGA a consultar IGDB: servir una carátula ya emparejada es gratis y no gasta cupo, así
 * que navegar por una biblioteca ya llena nunca topa. 500 da de sobra para llenar una biblioteca grande de una
 * sentada (la de referencia tiene 302) y deja margen para volver a intentarlo.
 *
 * Es un tope BLANDO: KV no tiene incremento atómico, así que dos peticiones simultáneas pueden leer el mismo
 * valor y contar una sola vez. Sirve para acotar el abuso, no como frontera de seguridad.
 */
const MAX_RESOLUCIONES_HORA = 500;

/** Cupo gastado por una IP en la hora en curso; devuelve `false` cuando ya no queda. */
async function quedaCupo(env: Env, request: Request): Promise<boolean> {
  const ip = request.headers.get('CF-Connecting-IP') || 'desconocida';
  const hora = new Date().toISOString().slice(0, 13); // «2026-09-15T18»
  const clave = `igdb:cupo:v1:${ip}:${hora}`;
  const usado = Number(await env.COVERS?.get(clave)) || 0;
  if (usado >= MAX_RESOLUCIONES_HORA) return false;
  await env.COVERS?.put(clave, String(usado + 1), { expirationTtl: 3600 });
  return true;
}

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

  /* Modo «solo resolver» (`m=1`), el que usa el llenado inicial. Deja el emparejamiento en KV y contesta sin
     cuerpo: de otro modo, calentar una biblioteca de 300 juegos se descargaría ~6 MB de imágenes que nadie está
     mirando todavía. Cuando luego se pinte el mosaico, cada carátula ya sale de la caché. */
  const soloMapa = url.searchParams.get('m') === '1';

  /* MODO AMPLIADO (`x=1`): admite además DLC, packs y mods. Es una lente de diagnóstico del administrador, no
     una mejora —esas fichas dan peores emparejamientos, no más—, y va en la URL y no en una cabecera por dos
     razones que se refuerzan: el service worker cachea por URL y sin `Vary` (su cabecera documenta el estropicio
     que eso causó con `/api/share/mine`), y la caché de KV es compartida. Con el distintivo en la URL, la
     respuesta ampliada vive en su propio espacio y no puede acabar servida a otra persona.
     No es una frontera de seguridad: la URL se falsifica. Falsificarla solo te da a ti peores carátulas, y el
     cupo por IP acota el gasto. Quien manda de verdad sigue siendo `isAdminEmail` en el cliente. */
  const ampliado = url.searchParams.get('x') === '1';

  /* TAMAÑO (`s=medio` o `s=ancho`). Como `x=1`, viaja en la URL y no en una cabecera: el service worker cachea
     por URL y sin `Vary`, así que cada tamaño tiene que tener su propia clave de caché o el mosaico acabaría
     pintando la imagen grande —o al revés— según cuál se pidiera primero. Cualquier otro valor cae en el
     normal, que es lo que hay que servirle a un cliente viejo que no conozca este parámetro. */
  const pedido = url.searchParams.get('s');
  const tamano: Tamano = pedido === 'ancho' ? 'ancho' : pedido === 'medio' ? 'medio' : 'normal';

  const listaPlataformas = plataformas.split(',').map((p) => p.trim()).filter(Boolean);

  /* Primero la caché, y solo si no hay nada se gasta cupo: lo que se raciona es CONSULTAR a IGDB, no servir lo
     ya sabido. Así una biblioteca ya llena se navega sin tocar el contador. */
  let coverId = await leerCaratulaCacheada(env, nombre, listaPlataformas, ampliado);
  if (coverId === undefined) {
    if (!(await quedaCupo(env, request))) {
      // 429 y `no-store`: es pasajero. Con `Retry-After` en segundos hasta que termine la hora en curso.
      const restan = 3600 - (Math.floor(Date.now() / 1000) % 3600);
      return new Response('Demasiadas carátulas nuevas seguidas; inténtalo más tarde', {
        status: 429,
        headers: { 'Cache-Control': 'no-store', 'Retry-After': String(restan) },
      });
    }
    coverId = await resolverCaratula(env, nombre, listaPlataformas, ampliado);
  }

  if (!coverId) {
    // 404 y no una imagen de relleno: quien pinta el hueco es el cliente, que ya tiene su portada de casa puesta
    // debajo. Devolver aquí un PNG genérico obligaría a descargarlo para tapar algo que ya está pintado.
    return new Response('Sin carátula', { status: 404, headers: { 'Cache-Control': CACHE_FALLO } });
  }

  if (soloMapa) {
    // 204: hay carátula y ya está apuntada, pero aquí no se envía. `no-store` porque lo que importa de esta
    // respuesta es el efecto en KV, no la respuesta en sí.
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  }

  // El id viene de IGDB, pero se valida igual antes de meterlo en una URL: si algún día llega por otro camino,
  // que no pueda salirse de la ruta.
  if (!/^[a-z0-9_-]{1,64}$/i.test(coverId)) {
    return new Response('Identificador de carátula inesperado', { status: 502 });
  }

  const imagen = await fetch(`${IMAGENES}/${TAMANOS[tamano]}/${coverId}.jpg`, {
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
