// `/assets/*` servido con el brotli que se hizo en el BUILD, no con el que hace Cloudflare al vuelo.
//
// POR QUÉ: Pages comprime al vuelo con un brotli de nivel bajo, que apenas mejora al gzip —en el chunk de React
// sale incluso más grande: 67 745 bytes frente a 67 361—. Comprimido con calidad 11 en el build, el arranque baja
// de 185 a 159 kB por la red (medido el 25-09-2026 sobre los 15 ficheros de producción), y lo mismo pasa con cada
// chunk perezoso. Calidad 11 al vuelo no es viable (es lenta); una vez por build, sí.
//
// CÓMO: el plugin `brotliAssets` de `vite.config.ts` deja un `<fichero>.br` al lado de cada `.js` y `.css`. Si el
// navegador acepta brotli, esto devuelve ese fichero tal cual con `Content-Encoding: br`, y `encodeBody: 'manual'`
// le dice al runtime que el cuerpo YA va comprimido (sin él lo comprimiría otra vez). En cualquier otro caso —otra
// petición, otro tipo de fichero, un navegador sin brotli o un `.br` que no está— sigue el camino de siempre,
// `assetOrNotFound`, con su 404 para los chunks de un despliegue anterior.
//
// LAS CABECERAS SALEN DE LA RESPUESTA DEL `.br`. `env.ASSETS.fetch` aplica `public/_headers` igual que a cualquier
// fichero estático, así que el `.br` ya trae el `immutable` de `/assets/*` y las cabeceras de seguridad de `/*`.
// Lo que genera una Function NO pasa por `_headers`, y por eso se copian en vez de escribirse aquí a mano: una
// cabecera nueva en `_headers` llega sola. Solo se corrigen las tres que describen la representación.
import { assetOrNotFound } from './staleAsset';

/** Lo que usa este módulo del binding de assets estáticos de Pages. */
export interface AssetFetcher {
  fetch(input: Request | string | URL): Promise<Response>;
}

export interface BrotliAssetContext {
  request: Request;
  env: { ASSETS?: AssetFetcher };
  next: () => Promise<Response>;
}

/** El `ResponseInit` del runtime de Workers, que añade `encodeBody` al estándar. */
type WorkersResponseInit = ResponseInit & { encodeBody?: 'automatic' | 'manual' };

/** Los tipos que el plugin comprime. El `Content-Type` va aquí porque el `.br` llega como un binario cualquiera. */
const TIPOS: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

/** `Accept-Encoding` admite brotli: aparece `br` y no con `q=0`, que es la forma de rechazarlo. */
export function aceptaBrotli(cabecera: string | null): boolean {
  return (cabecera || '').split(',').some((parte) => {
    const [token, ...parametros] = parte.split(';').map((trozo) => trozo.trim().toLowerCase());
    if (token !== 'br') return false;
    const q = parametros.find((parametro) => parametro.startsWith('q='));
    return q === undefined || Number(q.slice(2)) > 0;
  });
}

function conVary(cabeceras: Headers): void {
  const actual = cabeceras.get('Vary') || '';
  if (!actual.toLowerCase().split(',').some((valor) => valor.trim() === 'accept-encoding')) {
    cabeceras.set('Vary', actual ? `${actual}, Accept-Encoding` : 'Accept-Encoding');
  }
}

export async function brotliOrAsset(context: BrotliAssetContext): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const extension = url.pathname.slice(url.pathname.lastIndexOf('.'));
  const tipo = TIPOS[extension];

  if (request.method !== 'GET' || !tipo || !env.ASSETS || !aceptaBrotli(request.headers.get('Accept-Encoding'))) {
    return assetOrNotFound(context);
  }

  try {
    // `identity`: el `.br` tiene que llegar con sus bytes tal cual. Si el servidor de assets lo comprimiera otra vez
    // por su cuenta, el cuerpo iría doblemente codificado.
    const comprimido = await env.ASSETS.fetch(
      new Request(`${url.origin}${url.pathname}.br`, { headers: { 'Accept-Encoding': 'identity' } }),
    );
    // Sin `.br` el `_redirects` contesta con el shell y un 200: eso no es el fichero, se sigue por el camino normal.
    if (comprimido.ok && !(comprimido.headers.get('Content-Type') || '').includes('text/html')) {
      const cabeceras = new Headers(comprimido.headers);
      cabeceras.set('Content-Type', tipo);
      cabeceras.set('Content-Encoding', 'br');
      conVary(cabeceras);
      const init: WorkersResponseInit = { status: 200, headers: cabeceras, encodeBody: 'manual' };
      return new Response(comprimido.body, init);
    }
    await comprimido.body?.cancel();
  } catch {
    // Cualquier fallo aquí se queda aquí: el asset normal sigue estando, solo que con la compresión de Cloudflare.
  }

  return assetOrNotFound(context);
}
