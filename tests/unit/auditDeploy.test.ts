// Recursos de otro origen en el HTML servido (`scripts/lib/deployed-html.mjs`, que usa `npm run audit:deploy`) y
// el candado de la CSP contra el beacon de Cloudflare Web Analytics.
import { describe, expect, it } from 'vitest';
import headersFile from '../../public/_headers?raw';
import indexHtml from '../../index.html?raw';
import { recursosAjenos } from '../../scripts/lib/deployed-html.mjs';

const PAGINA = 'https://mygamelist.pages.dev/completados';

describe('recursosAjenos', () => {
  it('caza el beacon que inyecta Cloudflare, tal y como llegaba a producción', () => {
    const html = `<head></head><body><div id="root"></div>
      <script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "x"}'></script></body>`;
    expect(recursosAjenos(html, PAGINA)).toEqual([
      { etiqueta: 'script', url: 'https://static.cloudflareinsights.com/beacon.min.js' },
    ]);
  });

  it('lo propio no cuenta: rutas relativas, absolutas del mismo origen y data:', () => {
    const html = `
      <script type="module" src="/assets/index-abc.js"></script>
      <link rel="modulepreload" href="assets/react-abc.js">
      <link rel="stylesheet" href="https://mygamelist.pages.dev/assets/index.css">
      <link rel="icon" href="/favicon.ico?v=2">
      <img src="data:image/png;base64,AAAA">`;
    expect(recursosAjenos(html, PAGINA)).toEqual([]);
  });

  it('cuenta los link que piden algo o abren conexión, y los iframe e img', () => {
    const html = `
      <link rel="preconnect" href="https://fonts.gstatic.com">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=X">
      <iframe src="https://www.youtube.com/embed/1"></iframe>
      <img src=https://ejemplo.org/pixel.gif>`;
    expect(recursosAjenos(html, PAGINA).map((r) => r.etiqueta)).toEqual(['iframe', 'img', 'link preconnect', 'link stylesheet']);
  });

  it('los metadatos y enlaces no los pide quien visita: no cuentan', () => {
    const html = `
      <meta property="og:image" content="https://mygamelist.pages.dev/share-card.jpg">
      <link rel="canonical" href="https://otro-dominio.example/">
      <a href="https://github.com/Bellanco/myGameList">código</a>`;
    // Desde una vista previa, el og:image y el canonical apuntan a otro origen y aun así no son peticiones.
    expect(recursosAjenos(html, 'https://5eed50cc.mygamelist.pages.dev/')).toEqual([]);
  });

  it('el index.html del repositorio no carga nada de fuera', () => {
    expect(recursosAjenos(indexHtml, PAGINA)).toEqual([]);
  });
});

describe('la CSP no deja cargar el beacon de Cloudflare Web Analytics', () => {
  it('static.cloudflareinsights.com no está en script-src', () => {
    const scriptSrc = headersFile.match(/script-src([^;]*)/)?.[1] ?? '';
    expect(scriptSrc).not.toBe('');
    // Si esto falla, alguien lo ha vuelto a permitir: ver el comentario de la CSP en `public/_headers`.
    expect(scriptSrc).not.toMatch(/cloudflareinsights/);
  });
});
