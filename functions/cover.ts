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
import { coverExemptionKey } from './_lib/keys';
import {
  apuntarSiSePuede,
  emparejarYGuardar,
  esIdDeCaratula,
  leerCaratulaCacheada,
  MAX_NOMBRE,
  tamanoPedido,
  urlDeImagen,
  type EntornoIgdb,
  type TamanoCaratula,
} from './_lib/igdbCover';

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
 * Es un tope BLANDO, y conviene saber POR QUÉ no puede ser otra cosa sobre KV:
 *   · No hay incremento atómico. Dos peticiones simultáneas leen el mismo valor y cuentan una sola vez.
 *   · Las lecturas se sirven de la caché del punto de presencia durante AL MENOS 60 s (ese es el mínimo que
 *     admite `cacheTtl`), así que durante una ráfaga el contador que se lee viene con retraso. Con el llenado
 *     inicial, que va a ~6 juegos por segundo, eso son unos cientos de resoluciones de margen por encima del
 *     tope antes de que la cuenta se entere. Por eso el número va holgado: acota el abuso sostenido —que es
 *     para lo que existe—, no la ráfaga exacta.
 * Quien necesite una frontera de verdad necesita otro sustrato (un Durable Object), no un número más pequeño.
 */
const MAX_RESOLUCIONES_HORA = 500;

/**
 * DE CUÁNTAS EN CUÁNTAS SE APUNTA EL GASTO, y por qué no de una en una.
 *
 * Escribir en cada resolución ponía hasta SEIS escrituras por segundo sobre la misma clave de KV durante todo
 * el llenado inicial —KV admite del orden de una por segundo y clave—, y gastaba una escritura del presupuesto
 * diario por cada juego: ~300 por biblioteca llenada, más las del propio emparejamiento.
 *
 * Así que se cuenta por lotes: solo una de cada diez resoluciones escribe, y cuando lo hace suma diez. El
 * contador mide lo mismo en promedio y las escrituras bajan a la décima parte. Al ser un tope blando que ya
 * vive con el retraso de la caché de KV (ver arriba), esta imprecisión no cambia nada de lo que el cupo puede
 * prometer: el abuso sostenido sigue topando a las 500, que es lo que importa.
 */
const LOTE_CUPO = 10;

/**
 * ¿ESTA PETICIÓN VIENE DE OTRA WEB?
 *
 * `Sec-Fetch-Site` la pone el NAVEGADOR y el JavaScript de la página no puede tocarla, así que un
 * `<img src="https://…/cover?n=…">` colgado en otro sitio llega marcado como `cross-site`, y el mosaico de esta
 * app —que siempre pide en relativo, ver `coverUrl`— llega como `same-origin`. Es la única señal fiable para
 * distinguirlos, porque la petición de una imagen no puede llevar cabeceras propias.
 *
 * TODO LO DEMÁS PASA: `same-site`, `none` (pegar la URL en la barra, abrir un marcador) y la cabecera AUSENTE,
 * que es lo que mandan los navegadores que no la implementan —Safari hasta el 16.4— y cualquier cliente que no
 * sea un navegador. Ante la duda se deja pasar, y a propósito: esto NO es una frontera de seguridad y no puede
 * serlo, porque `curl` escribe la cabecera que le apetezca. Lo que corta es el caso real y barato de cortar —que
 * otro sitio cuelgue sus carátulas de aquí y nos deje pagando sus consultas a IGDB y sus escrituras de KV—, no
 * al que se moleste en falsificarla, que para eso está el cupo por IP.
 */
function vieneDeOtroSitio(request: Request): boolean {
  return request.headers.get('Sec-Fetch-Site') === 'cross-site';
}

/** Cupo gastado por una IP en la hora en curso; devuelve `false` cuando ya no queda. */
async function quedaCupo(env: Env, request: Request): Promise<boolean> {
  const ip = request.headers.get('CF-Connecting-IP') || 'desconocida';
  const hora = new Date().toISOString().slice(0, 13); // «2026-09-15T18»
  const clave = `igdb:cupo:v1:${ip}:${hora}`;
  const usado = Number(await env.COVERS?.get(clave)) || 0;
  if (usado >= MAX_RESOLUCIONES_HORA) {
    /* Agotado, salvo que esta IP tenga el cupo levantado (ver `/api/cover-quota`). La comprobación va AQUÍ y no
       al principio a propósito: así la lectura de más solo la paga quien ha llegado al tope, y no las miles de
       peticiones que nunca se acercan a él. */
    return Boolean(await env.COVERS?.get(coverExemptionKey(ip)));
  }
  // El azar es lo que reparte el coste: cada resolución tiene una probabilidad de 1/LOTE de apuntar el lote
  // entero. Sin él haría falta un contador compartido entre peticiones, que es justo lo que KV no da.
  //
  // Y se apunta con `apuntarSiSePuede`: si la escritura no sale —presupuesto diario agotado, sobre todo—, lo que
  // NO puede pasar es que una carátula deje de servirse por no haber podido anotar el contador. El cupo es un
  // tope blando que ya vive con el retraso de la caché de KV; una anotación perdida cabe de sobra en ese margen.
  if (Math.random() < 1 / LOTE_CUPO) {
    await apuntarSiSePuede(env.COVERS, clave, String(usado + LOTE_CUPO), 3600);
  }
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
     pintando la imagen grande —o al revés— según cuál se pidiera primero. */
  const tamano: TamanoCaratula = tamanoPedido(url.searchParams.get('s'));

  const listaPlataformas = plataformas.split(',').map((p) => p.trim()).filter(Boolean);

  /* Primero la caché, y solo si no hay nada se gasta cupo: lo que se raciona es CONSULTAR a IGDB, no servir lo
     ya sabido. Así una biblioteca ya llena se navega sin tocar el contador.
     La lectura se hace AQUÍ y la resolución llama a `emparejarYGuardar`, que ya no vuelve a mirar la caché: con
     la función que hacía las dos cosas, cada juego nuevo leía dos veces la misma clave de KV. */
  let coverId = await leerCaratulaCacheada(env, nombre, listaPlataformas, ampliado);
  if (coverId === undefined) {
    /* De otra web no se RESUELVEN juegos nuevos, y la comprobación va AQUÍ y no al entrar: una carátula ya
       emparejada se le sirve a quien sea. Servirla no cuesta ni una consulta a IGDB ni una escritura de KV —los
       bytes los pone la caché del borde—, así que negarla rompería enlaces sin ahorrar nada. Lo que no se le
       regala a un tercero es el trabajo caro, que es emparejar títulos que nadie ha pedido todavía.
       Antes que el cupo para que un sitio ajeno no gaste ni la lectura del contador. */
    if (vieneDeOtroSitio(request)) {
      return new Response('Las carátulas nuevas solo se resuelven desde esta web', {
        status: 403,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    if (!(await quedaCupo(env, request))) {
      // 429 y `no-store`: es pasajero. Con `Retry-After` en segundos hasta que termine la hora en curso.
      const restan = 3600 - (Math.floor(Date.now() / 1000) % 3600);
      return new Response('Demasiadas carátulas nuevas seguidas; inténtalo más tarde', {
        status: 429,
        headers: { 'Cache-Control': 'no-store', 'Retry-After': String(restan) },
      });
    }
    coverId = await emparejarYGuardar(env, nombre, listaPlataformas, ampliado);
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

  if (!esIdDeCaratula(coverId)) {
    return new Response('Identificador de carátula inesperado', { status: 502 });
  }

  const imagen = await fetch(urlDeImagen(coverId, tamano), {
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
