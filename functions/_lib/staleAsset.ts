// Guardia de los directorios de assets con hash de contenido (`/assets/*`, `/fonts/*`).
//
// EL PROBLEMA: `public/_redirects` termina en `/* /index.html 200`, que es lo que hace funcionar las rutas de la
// SPA (`/social`, `/cuenta`, …). El efecto colateral es que CUALQUIER ruta sin fichero devuelve el shell con un
// 200, incluidos los chunks de un despliegue anterior. Un navegador que arrastre un `index.html` viejo —por la
// caché HTTP o por el service worker— pide `/assets/index-<hash antiguo>.js` y recibe `text/html`. Entonces:
//
//   1. El módulo se rechaza por MIME (`Expected a JavaScript-or-Wasm module script…`) y la app NO arranca.
//   2. El error no es un 404, así que no dispara la recuperación por `vite:preloadError` de `main.tsx`.
//   3. La regla `/assets/*` de `public/_headers` le pone `immutable, max-age=31536000` a esa respuesta, con lo
//      que el navegador se guarda el HTML un AÑO bajo la URL de un `.js`. El dispositivo queda inservible para
//      esta app y ni recargar ni desplegar de nuevo lo arreglan.
//
// `_redirects` no admite el código 404 (solo 301, 302, 303, 307 y 308), así que la única forma de devolver un
// 404 de verdad en estas rutas es una Function. Los assets que SÍ existen se devuelven tal cual, con las
// cabeceras que ya les puso la etapa de assets estáticos (`public/_headers`).
//
// El service worker hace la comprobación equivalente por su cuenta (`isShellFallback`): esto lo arregla para
// todos los navegadores, aquello rescata además a los que ya venían envenenados.

/** Un asset con hash nunca es HTML. Si llega HTML, es el shell del `_redirects` y el fichero ya no existe. */
export async function assetOrNotFound(context: { next: () => Promise<Response> }): Promise<Response> {
  const response = await context.next();

  if (!(response.headers.get('content-type') || '').includes('text/html')) {
    return response;
  }

  return new Response('Not found', {
    status: 404,
    statusText: 'Not Found',
    // `no-store` a propósito: es justo el cacheo de esta respuesta lo que dejaba el dispositivo inservible.
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
