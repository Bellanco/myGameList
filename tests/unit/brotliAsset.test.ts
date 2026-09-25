// `/assets/*` con el brotli del build (`functions/_lib/brotliAsset.ts`).
//
// Lo que se fija aquí es CUÁNDO se sirve el `.br` y cuándo no, y que el «no» sea siempre el camino de antes
// (`assetOrNotFound`, con su 404 para chunks viejos). Que el runtime de Workers respete `encodeBody: 'manual'` no
// se puede probar en jsdom: eso se comprueba contra un despliegue de vista previa.
import { describe, expect, it, vi } from 'vitest';
import { aceptaBrotli, brotliOrAsset, type AssetFetcher } from '../../functions/_lib/brotliAsset';

const ORIGEN = 'https://mygamelist.pages.dev';
const BYTES_BR = new Uint8Array([0x1b, 0x2a, 0x00, 0x42]);

/** El asset normal, tal y como lo devuelve la etapa de estáticos con `public/_headers` ya aplicado. */
function assetNormal(): Response {
  return new Response('console.log(1)', {
    headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}

/** El shell de la SPA, que es lo que contesta `_redirects` a cualquier ruta sin fichero. */
function shell(): Response {
  return new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function assetsFalsos(respuesta: () => Response) {
  const fetch = vi.fn(async (_input: Request | string | URL) => respuesta());
  return { fetch } satisfies AssetFetcher;
}

function contexto(ruta: string, opciones: { encoding?: string; method?: string; assets?: AssetFetcher; next?: () => Response } = {}) {
  const headers: Record<string, string> = {};
  if (opciones.encoding !== undefined) headers['Accept-Encoding'] = opciones.encoding;
  const next = vi.fn(async () => (opciones.next ?? assetNormal)());
  return {
    next,
    ctx: {
      request: new Request(`${ORIGEN}${ruta}`, { method: opciones.method ?? 'GET', headers }),
      env: { ASSETS: opciones.assets },
      next,
    },
  };
}

function brPublicado(): Response {
  return new Response(BYTES_BR, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      ETag: '"br-1"',
    },
  });
}

describe('aceptaBrotli', () => {
  it('lo que mandan los navegadores de verdad', () => {
    expect(aceptaBrotli('gzip, deflate, br, zstd')).toBe(true);
    expect(aceptaBrotli('br;q=1.0, gzip;q=0.8')).toBe(true);
  });

  it('sin la cabecera, o sin br, no', () => {
    expect(aceptaBrotli(null)).toBe(false);
    expect(aceptaBrotli('gzip, deflate')).toBe(false);
    expect(aceptaBrotli('identity')).toBe(false);
  });

  it('q=0 es un rechazo explícito, no una aceptación', () => {
    expect(aceptaBrotli('gzip, br;q=0')).toBe(false);
    expect(aceptaBrotli('br; q=0.0')).toBe(false);
  });

  it('no se confunde con codificaciones que empiezan igual', () => {
    expect(aceptaBrotli('brotli, gzip')).toBe(false);
  });
});

describe('/assets/* con el brotli del build', () => {
  it('sirve el .br con la codificación, el tipo y las cabeceras que le puso _headers', async () => {
    const assets = assetsFalsos(brPublicado);
    const { ctx, next } = contexto('/assets/index-abc.js', { encoding: 'gzip, deflate, br', assets });

    const respuesta = await brotliOrAsset(ctx);

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('Content-Encoding')).toBe('br');
    expect(respuesta.headers.get('Content-Type')).toBe('text/javascript; charset=utf-8');
    expect(respuesta.headers.get('Vary')).toBe('Accept-Encoding');
    // Las de `_headers` llegan copiadas de la respuesta del `.br`, no reescritas aquí.
    expect(respuesta.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(respuesta.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(new Uint8Array(await respuesta.arrayBuffer())).toEqual(BYTES_BR);
    expect(next).not.toHaveBeenCalled();
  });

  it('pide el .br de la MISMA ruta y sin compresión añadida', async () => {
    const assets = assetsFalsos(brPublicado);
    const { ctx } = contexto('/assets/index-abc.css', { encoding: 'br', assets });

    const respuesta = await brotliOrAsset(ctx);

    const pedido = assets.fetch.mock.calls[0][0] as Request;
    expect(pedido.url).toBe(`${ORIGEN}/assets/index-abc.css.br`);
    expect(pedido.headers.get('Accept-Encoding')).toBe('identity');
    expect(respuesta.headers.get('Content-Type')).toBe('text/css; charset=utf-8');
  });

  it('respeta un Vary que ya viniera, sin duplicar Accept-Encoding', async () => {
    const assets = assetsFalsos(() => new Response(BYTES_BR, { headers: { Vary: 'Origin' } }));
    const { ctx } = contexto('/assets/a.js', { encoding: 'br', assets });
    expect((await brotliOrAsset(ctx)).headers.get('Vary')).toBe('Origin, Accept-Encoding');

    const yaLoTiene = assetsFalsos(() => new Response(BYTES_BR, { headers: { Vary: 'accept-encoding' } }));
    const segundo = contexto('/assets/a.js', { encoding: 'br', assets: yaLoTiene });
    expect((await brotliOrAsset(segundo.ctx)).headers.get('Vary')).toBe('accept-encoding');
  });

  it('un navegador sin brotli recibe el asset de siempre y ni se pide el .br', async () => {
    const assets = assetsFalsos(brPublicado);
    const { ctx, next } = contexto('/assets/index-abc.js', { encoding: 'gzip, deflate', assets });

    const respuesta = await brotliOrAsset(ctx);

    expect(assets.fetch).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(respuesta.headers.get('Content-Encoding')).toBeNull();
    expect(await respuesta.text()).toBe('console.log(1)');
  });

  it('solo toca .js y .css: un mapa o cualquier otra cosa va por el camino normal', async () => {
    const assets = assetsFalsos(brPublicado);
    for (const ruta of ['/assets/index-abc.js.map', '/assets/logo.svg', '/assets/index-abc.js.br']) {
      const { ctx, next } = contexto(ruta, { encoding: 'br', assets });
      await brotliOrAsset(ctx);
      expect(next).toHaveBeenCalledOnce();
    }
    expect(assets.fetch).not.toHaveBeenCalled();
  });

  it('solo GET: un HEAD va por el camino normal', async () => {
    const assets = assetsFalsos(brPublicado);
    const { ctx, next } = contexto('/assets/index-abc.js', { encoding: 'br', method: 'HEAD', assets });
    await brotliOrAsset(ctx);
    expect(assets.fetch).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it('sin el binding de assets (otro entorno) no se rompe: camino normal', async () => {
    const { ctx, next } = contexto('/assets/index-abc.js', { encoding: 'br' });
    const respuesta = await brotliOrAsset(ctx);
    expect(next).toHaveBeenCalledOnce();
    expect(await respuesta.text()).toBe('console.log(1)');
  });

  it('si no hay .br (el _redirects contesta con el shell), se sirve el asset normal', async () => {
    const assets = assetsFalsos(shell);
    const { ctx, next } = contexto('/assets/index-abc.js', { encoding: 'br', assets });

    const respuesta = await brotliOrAsset(ctx);

    expect(next).toHaveBeenCalledOnce();
    expect(respuesta.headers.get('Content-Encoding')).toBeNull();
    expect(await respuesta.text()).toBe('console.log(1)');
  });

  it('un chunk de un despliegue anterior sigue dando 404, no el shell', async () => {
    const assets = assetsFalsos(shell);
    const { ctx } = contexto('/assets/index-viejo.js', { encoding: 'br', assets, next: shell });

    const respuesta = await brotliOrAsset(ctx);

    expect(respuesta.status).toBe(404);
    expect(respuesta.headers.get('Cache-Control')).toBe('no-store');
  });

  it('si pedir el .br falla, se sirve el asset normal en vez de propagar el error', async () => {
    const assets: AssetFetcher = { fetch: vi.fn(async () => { throw new Error('se cayó'); }) };
    const { ctx, next } = contexto('/assets/index-abc.js', { encoding: 'br', assets });

    const respuesta = await brotliOrAsset(ctx);

    expect(next).toHaveBeenCalledOnce();
    expect(respuesta.status).toBe(200);
  });

  it('un .br que responde con error tampoco se sirve', async () => {
    const assets = assetsFalsos(() => new Response('nope', { status: 500 }));
    const { ctx, next } = contexto('/assets/index-abc.js', { encoding: 'br', assets });
    await brotliOrAsset(ctx);
    expect(next).toHaveBeenCalledOnce();
  });
});
