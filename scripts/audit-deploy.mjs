// Comprueba que el HTML que sirve el DOMINIO DESPLEGADO no carga nada de otro origen.
//
// POR QUÉ HACE FALTA, si ya existe el smoke «una visita anónima no contacta con terceros» (`tests/e2e/smoke.test.ts`):
// ese test corre contra `vite preview`, y lo que se le escapa es justo lo que añade el borde al servir. Así estuvo
// cargándose en cada visita el beacon de Cloudflare Web Analytics desde mayo hasta septiembre de 2026: Pages lo
// inyecta en el HTML al desplegar y no está en ningún fichero del repositorio (ver el comentario de la CSP en
// `public/_headers`). Solo lee; no necesita credenciales. Uso:
//
//   npm run audit:deploy                                   # producción
//   npm run audit:deploy -- https://<hash>.mygamelist.pages.dev/completados
//
// Sale con 1 si encuentra algo o si no puede leer la página.
import { recursosAjenos } from './lib/deployed-html.mjs';

const url = process.argv[2] || 'https://mygamelist.pages.dev/completados';

let respuesta;
try {
  respuesta = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
} catch (error) {
  console.error(`No se ha podido pedir ${url}: ${error.message}`);
  process.exit(1);
}
if (!respuesta.ok) {
  console.error(`${url} ha respondido ${respuesta.status}.`);
  process.exit(1);
}

// La URL final, no la pedida: si hubo redirección, los relativos se resuelven contra donde se acabó.
const ajenos = recursosAjenos(await respuesta.text(), respuesta.url);
if (ajenos.length > 0) {
  console.error(`El HTML servido por ${respuesta.url} carga recursos de otro origen:`);
  for (const { etiqueta, url: recurso } of ajenos) console.error(`  <${etiqueta}> ${recurso}`);
  console.error(
    'Si no está en index.html, lo ha inyectado el borde: revisa las funciones del panel de Cloudflare Pages ' +
      '(Web Analytics, en la pestaña Metrics). La política promete que usar las listas no contacta con terceros.',
  );
  process.exit(1);
}
console.log(`${respuesta.url}: el HTML servido solo carga recursos de su propio origen.`);
