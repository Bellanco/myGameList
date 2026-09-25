// Qué recursos de OTRO origen carga un HTML tal y como lo sirve el dominio. Lo usa `scripts/audit-deploy.mjs`.
//
// Va aparte, y sin red, para poder probarlo (`tests/unit/auditDeploy.test.ts`): el script solo pide la página y
// pinta el resultado.
//
// SOLO LAS ETIQUETAS QUE HACEN QUE EL NAVEGADOR PIDA ALGO: `<script src>`, `<link href>` de los tipos que se
// descargan o abren conexión, `<iframe src>` e `<img src>`. Los `<meta>` de Open Graph y los `<a href>` quedan
// fuera a propósito: llevan URLs absolutas (la tarjeta de compartir apunta al dominio de producción) y no los pide
// quien visita la página, sino, si acaso, la red social que la previsualiza.

/** `rel` de `<link>` que provocan una petición o una conexión a su `href` al cargar la página. */
const LINK_REL_QUE_PIDEN = new Set(['stylesheet', 'preload', 'modulepreload', 'prefetch', 'preconnect', 'dns-prefetch', 'icon', 'apple-touch-icon', 'manifest']);

function atributo(etiqueta, nombre) {
  const m = etiqueta.match(new RegExp(`\\s${nombre}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
}

/**
 * Los recursos de un origen distinto al de `urlPagina`, como `{ etiqueta, url }`. Una lista vacía significa que
 * la página, tal cual llega, solo pide cosas a su propio origen.
 */
export function recursosAjenos(html, urlPagina) {
  const origen = new URL(urlPagina).origin;
  const ajenos = [];
  const apuntar = (etiqueta, valor) => {
    if (!valor) return;
    let url;
    try {
      url = new URL(valor, urlPagina);
    } catch {
      return;
    }
    // `data:` y `blob:` no salen a la red.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    if (url.origin !== origen) ajenos.push({ etiqueta, url: url.href });
  };

  for (const [etiqueta] of html.matchAll(/<(script|iframe|img)\b[^>]*>/gi)) {
    apuntar(etiqueta.match(/^<(\w+)/)[1].toLowerCase(), atributo(etiqueta, 'src'));
  }
  for (const [etiqueta] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rels = (atributo(etiqueta, 'rel') || '').toLowerCase().split(/\s+/);
    if (rels.some((rel) => LINK_REL_QUE_PIDEN.has(rel))) apuntar(`link ${rels.join(' ')}`, atributo(etiqueta, 'href'));
  }
  return ajenos;
}
