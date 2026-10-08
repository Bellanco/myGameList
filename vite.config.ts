import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
// El MISMO saneado que usan el cliente y la Pages Function: el servidor de desarrollo no puede ser más
// permisivo que producción, o se prueba con textos que en la web real se recortan.
import { sanitizeAnnouncement } from './src/core/announcement/announcement';
import { githubOAuthDevMiddleware } from './scripts/devGithubOAuth';
// Y el MISMO saneado de la foto del calendario de la porra, por lo mismo: el servidor de desarrollo no puede
// guardar algo que la Pages Function rechazaría.
import { sanitizePremiosSnapshot } from './src/core/premios/visibilitySnapshot';

// El MISMO emparejador que usa la Pages Function, no una copia: si el servidor de desarrollo resolviera las
// carátulas con otras reglas, probar en local no demostraría nada sobre producción.
import {
  buscarCandidatos,
  esIdDeCaratula,
  leerCaratulaCacheada,
  MAX_NOMBRE,
  resolverCaratula,
  tamanoPedido,
  urlDeImagen,
  type EntornoIgdb,
} from './functions/_lib/igdbCover';
// Y lo mismo con TMDB: las mismas reglas de ruta, tamaños y búsqueda que `/poster` y `/api/tmdb-search`.
import {
  buscarEnTmdb,
  esRutaDeImagenTmdb,
  MAX_BUSQUEDA_TMDB,
  tamanoPoster,
  urlDeImagenTmdb,
} from './functions/_lib/tmdb';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version?: string };

/**
 * Inyecta en `service-worker.js` la lista REAL de assets del arranque y un identificador de build.
 *
 * Por qué hace falta un plugin: el SW es un fichero estático de `public/`, así que no puede conocer los nombres
 * con hash que genera Vite. Sin esta lista el precache se queda en el shell HTML y la app NO arranca offline
 * (fallan todos los chunks que ese HTML referencia), que es exactamente el bug que este plugin cierra.
 *
 * Qué entra en la lista: los chunks alcanzables por importación ESTÁTICA desde el entry, más su CSS. Es decir, lo
 * mínimo para que la app arranque. Los chunks perezosos (Firebase, hub social, panel, temas) quedan fuera a
 * propósito: son la mayor parte del peso, no hacen falta para arrancar, y el propio SW los va guardando con su
 * regla de caché-primero cuando el usuario los visita.
 *
 * El identificador de build es un hash del contenido de esa lista, no una fecha: así dos builds del mismo código
 * dan el mismo nombre de caché (idempotente, sin invalidaciones gratuitas) y cambia en cuanto cambia el arranque.
 */
function serviceWorkerPrecache(): Plugin {
  const BUILD_ID_TOKEN = 'self.__SW_BUILD_ID__';
  const ASSETS_TOKEN = 'self.__PRECACHE_ASSETS__';
  // El MISMO identificador, también dentro del documento (`<meta name="app-build">`). Es lo que permite a
  // `core/utils/appUpdate` comparar la versión que ejecuta la página con la que sirve el service worker en vez
  // de suponer que un relevo de controlador significa que la página está vieja (ver `index.html`).
  const DOC_BUILD_TOKEN = '__BUILD_ID__';
  let precachePaths: string[] = [];
  let criticalFontPaths: string[] = [];

  return {
    name: 'service-worker-precache',
    apply: 'build',

    generateBundle(_options, bundle) {
      const chunks = new Map(
        Object.entries(bundle).filter((entry): entry is [string, Extract<typeof entry[1], { type: 'chunk' }>] => entry[1].type === 'chunk'),
      );

      // Recorrido transitivo de los imports ESTÁTICOS desde cada entry. `dynamicImports` se deja fuera: son
      // justo los chunks que no queremos precachear.
      const reachable = new Set<string>();
      const pending = [...chunks.entries()].filter(([, chunk]) => chunk.isEntry).map(([name]) => name);
      while (pending.length > 0) {
        const name = pending.pop() as string;
        if (reachable.has(name)) continue;
        reachable.add(name);
        for (const imported of chunks.get(name)?.imports || []) {
          if (chunks.has(imported)) pending.push(imported);
        }
      }

      const css = new Set<string>();
      for (const name of reachable) {
        const meta = (chunks.get(name) as { viteMetadata?: { importedCss?: Iterable<string> } } | undefined)?.viteMetadata;
        for (const file of meta?.importedCss || []) css.add(file);
      }

      precachePaths = [...reachable, ...css].sort().map((file) => `/${file}`);
    },

    // La fuente crítica va aparte: vive en `public/fonts/` (no la emite el bundle, así que no aparece en `bundle`)
    // y sin precachearla la app arrancaría sin red pero con la tipografía de sistema. Es la de la paleta POR
    // DEFECTO (Forja, Atkinson Hyperlegible Next), la misma que precarga `index.html`; DM Sans, la base de las
    // demás, cae en la caché de `/fonts/` la primera vez que se usa. Solo el subconjunto `latin`:
    // `latin-ext` cubre caracteres que el castellano y el inglés casi nunca usan, y su `unicode-range` hace que el
    // navegador solo lo pida si de verdad aparece uno.
    buildStart() {
      const fontsDir = new URL('./public/fonts/', import.meta.url);
      criticalFontPaths = readdirSync(fontsDir)
        .filter((name) => /^atkinson-hyperlegible-next-latin-[a-f0-9]+\.woff2$/.test(name))
        .map((name) => `/fonts/${name}`);
      if (criticalFontPaths.length === 0) {
        throw new Error('[service-worker-precache] No se ha encontrado la fuente crítica en public/fonts/ (atkinson-hyperlegible-next-latin-*.woff2).');
      }
    },

    // `closeBundle` y no `writeBundle`: para entonces Vite ya ha copiado `public/` en `dist/`, que es donde está
    // el service worker que hay que parchear.
    closeBundle() {
      const swUrl = new URL('./dist/service-worker.js', import.meta.url);
      const source = readFileSync(swUrl, 'utf-8');

      // Si los marcadores no están, el SW se desplegaría sin precache y la app volvería a no arrancar offline,
      // en silencio. Preferimos romper el build.
      if (!source.includes(BUILD_ID_TOKEN) || !source.includes(ASSETS_TOKEN)) {
        throw new Error(
          `[service-worker-precache] No se han encontrado los marcadores ${BUILD_ID_TOKEN} / ${ASSETS_TOKEN} en dist/service-worker.js. ` +
            'Si se han renombrado en public/service-worker.js, actualiza este plugin.',
        );
      }
      if (precachePaths.length === 0) {
        throw new Error('[service-worker-precache] La lista de assets del arranque ha salido vacía; el precache sería inútil.');
      }

      const precache = [...precachePaths, ...criticalFontPaths];
      const buildId = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12);
      const patched = source
        .replace(BUILD_ID_TOKEN, JSON.stringify(buildId))
        .replace(ASSETS_TOKEN, JSON.stringify(precache));

      writeFileSync(swUrl, patched);

      // Y EL MISMO IDENTIFICADOR EN EL DOCUMENTO. Se hace aquí, sobre `dist/index.html` ya emitido, y no con un
      // `define`: el `buildId` sale del listado de assets del arranque, que no existe hasta que el bundle está
      // escrito. Tocar el HTML no mueve ningún hash —no lleva ninguno en el nombre y se sirve con `no-store`—,
      // así que esto no puede hacer que dos builds distintos compartan el nombre de un chunk.
      const indexUrl = new URL('./dist/index.html', import.meta.url);
      const html = readFileSync(indexUrl, 'utf-8');
      if (!html.includes(DOC_BUILD_TOKEN)) {
        throw new Error(
          `[service-worker-precache] No se ha encontrado el marcador ${DOC_BUILD_TOKEN} en dist/index.html. ` +
            'Sin él, la app no puede saber si el service worker nuevo trae una versión distinta de la que ya ' +
            'está ejecutando, y volvería a anunciar una actualización en cada despliegue (ver core/utils/appUpdate).',
        );
      }
      writeFileSync(indexUrl, html.replace(DOC_BUILD_TOKEN, buildId));
    },
  };
}

/**
 * Deja `404.html` al lado de `index.html`, con el MISMO contenido. Es lo que hace que un fichero que no existe dé un
 * 404 de verdad sin pasar por ninguna Pages Function.
 *
 * EL PROBLEMA: sin un `404.html` de primer nivel, Pages entra en «modo SPA» y contesta con el shell y un 200 a
 * CUALQUIER ruta sin fichero, incluidos los chunks de un despliegue anterior. El navegador se guarda entonces ese
 * HTML bajo la URL de un `.js` con el `immutable` de `public/_headers`, y el dispositivo queda inservible un año.
 * Lo resolvían dos Functions (`/assets/*` y `/fonts/*`) que convertían ese 200 en un 404, pero cada fichero del
 * build pasaba así por Workers, cuyo cupo gratuito es de 100.000 invocaciones al día: ~36 por dispositivo nuevo y
 * ~18 por dispositivo en cada despliegue (ver `docs/plan-capacidad-gratuita.md`, fase 3).
 *
 * CON ESTO: existe `404.html`, Pages deja el modo SPA y sirve este fichero con estado 404 a lo que no casa. Las
 * rutas de la app se reescriben al shell una a una en `public/_redirects` (y un test comprueba que no falte
 * ninguna). Es una COPIA del shell y no una página de error para que una dirección desconocida siga arrancando la
 * app, que la manda a su sitio como siempre; y para un chunk viejo es un 404, que es lo que `vite:preloadError`
 * sabe tratar.
 *
 * Se renunció a cambio al brotli de calidad 11 que servía la Function de `/assets/*`: el arranque viaja con la
 * compresión de Cloudflare (185 kB frente a 159 kB, medido el 25-09-2026), y solo en la primera visita.
 */
function notFoundShell(): Plugin {
  return {
    name: 'not-found-shell',
    apply: 'build',

    // `closeBundle` y AL FINAL (`order: 'post'`, `sequential`): `serviceWorkerPrecache` escribe el identificador de
    // build en `dist/index.html` en su propio `closeBundle`, y una copia hecha antes llevaría el marcador sin
    // sustituir. `npm run validate` comprueba que las dos salen iguales.
    closeBundle: {
      order: 'post',
      sequential: true,
      async handler() {
        await copyFile(new URL('./dist/index.html', import.meta.url), new URL('./dist/404.html', import.meta.url));
      },
    },
  };
}

/**
 * `/api/announcement` EN EL SERVIDOR DE DESARROLLO. Solo en `serve`: ni una línea de esto entra en el build.
 *
 * POR QUÉ HACE FALTA. El aviso a los usuarios lo sirve una Pages Function (`functions/api/announcement.ts`), y
 * las Pages Functions las ejecuta Cloudflare, no Vite: con `npm run dev` esa ruta devolvía el `index.html` del
 * SPA, así que el panel no podía guardar y la cápsula no salía nunca. La alternativa era levantar
 * `wrangler pages dev` sobre `dist` para cada prueba —sin recarga en caliente, y reconstruyendo a cada cambio—,
 * que es exactamente lo que hace que un evolutivo no se pruebe.
 *
 * ES EL MISMO CONTRATO, no una imitación aproximada: los tres métodos, el mismo saneado (se importa el del
 * núcleo, que es el que usa también la función de verdad) y el mismo cuerpo de respuesta. Lo único que NO tiene
 * es la comprobación de administrador: aquí no hay tokens que verificar y quien llama es la persona que ha
 * levantado el servidor en su propia máquina.
 *
 * EL AVISO VIVE EN UN FICHERO IGNORADO (`.announcement.local.json`), no en memoria: así sobrevive al reinicio
 * del servidor, se puede editar a mano y se borra solo con borrar el fichero.
 */
function localAnnouncementApi(): Plugin {
  const FILE = new URL('./.announcement.local.json', import.meta.url);
  const ROUTE = '/api/announcement';

  const send = (res: ServerResponse, status: number, body: unknown): void => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // Sin caché, al contrario que en producción: en local se quiere ver el cambio al recargar, no en cinco
    // minutos.
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
  };

  return {
    name: 'local-announcement-api',
    apply: 'serve',

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || req.url.split('?')[0] !== ROUTE) {
          next();
          return;
        }

        if (req.method === 'GET') {
          let stored: unknown = null;
          try {
            stored = JSON.parse(readFileSync(FILE, 'utf-8'));
          } catch {
            // No hay aviso publicado en este entorno, que es el estado normal.
          }
          send(res, 200, sanitizeAnnouncement(stored));
          return;
        }

        if (req.method === 'DELETE') {
          try {
            rmSync(FILE);
          } catch {
            // Ya no estaba.
          }
          send(res, 200, { ok: true });
          return;
        }

        if (req.method !== 'PUT') {
          send(res, 405, { error: 'Método no permitido' });
          return;
        }

        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          let clean = null;
          try {
            clean = sanitizeAnnouncement(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
          } catch {
            clean = null;
          }
          if (!clean) {
            send(res, 400, { error: 'El aviso necesita un identificador, un título y un enlace http(s)' });
            return;
          }
          writeFileSync(FILE, `${JSON.stringify(clean, null, 2)}\n`);
          send(res, 200, clean);
        });
      });
    },
  };
}

/**
 * `/api/premios` EN EL SERVIDOR DE DESARROLLO. Solo en `serve`: ni una línea de esto entra en el build.
 *
 * POR QUÉ HACE FALTA, y es la misma historia que el aviso: la foto del calendario de la porra —lo que decide si
 * la entrada se ofrece en el menú de Ajustes— la sirve una Pages Function (`functions/api/premios.ts`), y las
 * Pages Functions las ejecuta Cloudflare, no Vite. Con `npm run dev` esa ruta devolvía el `index.html` del SPA,
 * así que en local la entrada no aparecía nunca y el panel no podía publicarla.
 *
 * ES EL MISMO CONTRATO: los dos métodos y el mismo saneado, importado del núcleo. Lo único que no tiene es la
 * comprobación de administrador, porque aquí no hay tokens que verificar y quien llama es quien ha levantado el
 * servidor en su propia máquina.
 *
 * VIVE EN UN FICHERO IGNORADO (`.premios.local.json`), como el aviso: sobrevive al reinicio y se borra a mano.
 */
function localPremiosApi(): Plugin {
  const FILE = new URL('./.premios.local.json', import.meta.url);
  const ROUTE = '/api/premios';

  const send = (res: ServerResponse, status: number, body: unknown): void => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // Sin caché, al contrario que en producción: en local se quiere ver el cambio al recargar, no en cinco
    // minutos.
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
  };

  return {
    name: 'local-premios-api',
    apply: 'serve',

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || req.url.split('?')[0] !== ROUTE) {
          next();
          return;
        }

        if (req.method === 'GET') {
          let stored: unknown = null;
          try {
            stored = JSON.parse(readFileSync(FILE, 'utf-8'));
          } catch {
            // Sin edición publicada en este entorno, que es el estado normal de una máquina recién clonada.
          }
          send(res, 200, sanitizePremiosSnapshot(stored));
          return;
        }

        if (req.method !== 'PUT') {
          send(res, 405, { error: 'Método no permitido' });
          return;
        }

        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          let clean;
          try {
            clean = sanitizePremiosSnapshot(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
          } catch {
            clean = sanitizePremiosSnapshot(null);
          }
          writeFileSync(FILE, `${JSON.stringify(clean, null, 2)}\n`);
          send(res, 200, clean);
        });
      });
    },
  };
}

/**
 * `/cover` EN EL SERVIDOR DE DESARROLLO. Solo en `serve`: ni una línea entra en el build.
 *
 * POR QUÉ HACE FALTA, y es la misma historia que el aviso: las carátulas las sirve una Pages Function
 * (`functions/cover.ts`) y las Pages Functions las ejecuta Cloudflare, no Vite. Con `npm run dev` —que es lo que
 * abren «Mis Listas.command» y «Mis Listas.bat»— esa ruta devolvía el `index.html` del SPA, así que no salía ni
 * una carátula y no había forma de saber si el trabajo estaba bien hecho.
 *
 * ES EL MISMO CONTRATO: se importa el emparejador de VERDAD, con sus mismas reglas y su mismo `m=1`. Lo que no
 * tiene son los DOS racionamientos —el cupo por IP y el del servicio, con el sello de la administración que los
 * levanta—, y no es un descuido: los dos reparten un recurso
 * compartido entre desconocidos, y aquí quien llama es la persona que ha levantado el servidor en su propia
 * máquina contra su propia caché en un fichero. Lo que se sirve no cambia; lo que cambia es a quién hay que
 * racionárselo.
 *
 * LAS CREDENCIALES SALEN DE `.dev.vars` (el secreto) y de `wrangler.toml` (el client id, que es público y cuya
 * fuente de verdad es ese fichero). Sin el secreto, la ruta contesta 501 y lo dice por consola una vez: es la
 * diferencia entre «no hay carátulas porque no las has configurado» y «no hay carátulas y no sé por qué».
 *
 * LA CACHÉ VIVE EN UN FICHERO IGNORADO (`.covers.local.json`) en vez de en KV, por lo mismo que el aviso:
 * sobrevive al reinicio del servidor y se limpia borrando el fichero.
 *
 * Y ATIENDE TAMBIÉN `/api/igdb-search`, la búsqueda con la que el panel de premios elige la carátula de un nominado,
 * sin la comprobación de administrador por lo mismo que `localTmdbApi`: aquí quien llama es quien ha levantado el
 * servidor. Va en este gemelo y no en otro porque necesita las mismas credenciales y la misma caché del token.
 */
function localCoverApi(): Plugin {
  const RUTA = '/cover';
  const FICHERO = new URL('./.covers.local.json', import.meta.url);
  /* Los tamaños, el tope del título y la comprobación del identificador NO se copian aquí: salen de
     `functions/_lib/igdbCover`, el mismo módulo del que tira la Pages Function. Estuvieron duplicados, y esa es
     justo la forma en que un gemelo deja de serlo — añadir un tamaño en un sitio y olvidarlo en el otro hace que
     desarrollo sirva una imagen distinta de la de producción sin que nada avise. */

  /** Lee un valor de un fichero en formato `CLAVE=valor`, que es el de `.dev.vars`. */
  const deDevVars = (clave: string): string => {
    try {
      const texto = readFileSync(new URL('./.dev.vars', import.meta.url), 'utf-8');
      return new RegExp(`^${clave}=(.*)$`, 'm').exec(texto)?.[1]?.trim() ?? '';
    } catch {
      return '';
    }
  };

  const deWranglerToml = (clave: string): string => {
    try {
      const texto = readFileSync(new URL('./wrangler.toml', import.meta.url), 'utf-8');
      return new RegExp(`^${clave}\\s*=\\s*"([^"]*)"`, 'm').exec(texto)?.[1] ?? '';
    } catch {
      return '';
    }
  };

  /** Remedo mínimo de KV: solo `get`/`put` con caducidad, que es todo lo que usa el emparejador. */
  type Guardado = { valor: string; caduca: number };
  let almacen: Record<string, Guardado> = {};
  try {
    almacen = JSON.parse(readFileSync(FICHERO, 'utf-8')) as Record<string, Guardado>;
  } catch {
    almacen = {};
  }
  const guardar = () => {
    try {
      writeFileSync(FICHERO, `${JSON.stringify(almacen, null, 2)}\n`);
    } catch {
      // Disco lleno o permiso: se sigue con la caché en memoria.
    }
  };
  const kv = {
    get: async (clave: string) => {
      const dato = almacen[clave];
      if (!dato) return null;
      if (dato.caduca && dato.caduca < Date.now()) {
        delete almacen[clave];
        return null;
      }
      return dato.valor;
    },
    put: async (clave: string, valor: string, opciones?: { expirationTtl?: number }) => {
      almacen[clave] = { valor, caduca: opciones?.expirationTtl ? Date.now() + opciones.expirationTtl * 1000 : 0 };
      guardar();
    },
    delete: async () => {},
    list: async () => ({ keys: [], list_complete: true }),
  };

  let avisado = false;

  return {
    name: 'local-cover-api',
    apply: 'serve',

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const ruta = req.url?.split('?')[0];
        if (!req.url || (ruta !== RUTA && ruta !== '/api/igdb-search')) {
          next();
          return;
        }
        const url = new URL(req.url, 'http://localhost');

        // `i=`: la carátula ya elegida, que no necesita credenciales ni caché (ver `functions/cover.ts`).
        const elegida = ruta === RUTA ? url.searchParams.get('i') : null;
        if (elegida !== null) {
          if (!esIdDeCaratula(elegida)) {
            res.statusCode = 400;
            res.end('Identificador de carátula no válido');
            return;
          }
          void fetch(urlDeImagen(elegida, tamanoPedido(url.searchParams.get('s'))))
            .then(async (imagen) => {
              if (!imagen.ok) throw new Error(String(imagen.status));
              res.statusCode = 200;
              res.setHeader('Content-Type', imagen.headers.get('Content-Type') ?? 'image/jpeg');
              res.setHeader('Cache-Control', 'no-store');
              res.end(Buffer.from(await imagen.arrayBuffer()));
            })
            .catch(() => {
              res.statusCode = 502;
              res.setHeader('Cache-Control', 'no-store');
              res.end('La carátula no se pudo descargar');
            });
          return;
        }

        const env = {
          IGDB_CLIENT_ID: deWranglerToml('IGDB_CLIENT_ID'),
          IGDB_CLIENT_SECRET: deDevVars('IGDB_CLIENT_SECRET'),
          COVERS: kv,
        } as unknown as EntornoIgdb;

        if (!env.IGDB_CLIENT_ID || !env.IGDB_CLIENT_SECRET) {
          if (!avisado) {
            avisado = true;
            // eslint-disable-next-line no-console
            console.warn(
              '[carátulas] No hay credenciales de IGDB en desarrollo: copia `.dev.vars.example` a `.dev.vars` y ' +
                'pon ahí IGDB_CLIENT_SECRET. Hasta entonces las cajas enseñarán su portada de casa.',
            );
          }
          res.statusCode = 501;
          res.setHeader('Cache-Control', 'no-store');
          res.end('Las carátulas no están configuradas en desarrollo');
          return;
        }

        if (ruta === '/api/igdb-search') {
          const enviar = (status: number, cuerpo: unknown): void => {
            res.statusCode = status;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify(cuerpo));
          };
          const consulta = (url.searchParams.get('q') ?? '').trim();
          if (!consulta || consulta.length > MAX_NOMBRE) {
            enviar(400, { error: 'Falta qué buscar' });
            return;
          }
          void Promise.all([buscarCandidatos(env, consulta), leerCaratulaCacheada(env, consulta, [])])
            .then(([candidatos, automatica]) =>
              candidatos === null
                ? enviar(503, { error: 'No se ha podido consultar IGDB; inténtalo más tarde' })
                : enviar(200, { results: candidatos, automatic: automatica ?? null }),
            )
            .catch(() => enviar(502, { error: 'No se pudo atender la búsqueda en IGDB' }));
          return;
        }

        const nombre = (url.searchParams.get('n') ?? '').trim();
        if (!nombre || nombre.length > MAX_NOMBRE) {
          res.statusCode = 400;
          res.end('Falta el nombre del juego');
          return;
        }
        const plataformas = (url.searchParams.get('p') ?? '').split(',').map((p) => p.trim()).filter(Boolean);
        const soloMapa = url.searchParams.get('m') === '1';
        const tamano = tamanoPedido(url.searchParams.get('s'));
        // `c=1`: solo lo ya resuelto, igual que en producción (ver `functions/cover.ts`). `c=2`, lo ajeno, resuelve
        // como siempre: su raya es un trozo del cupo del servicio, y aquí no hay cupo que repartir (ver arriba).
        const soloCache = url.searchParams.get('c') === '1';

        void (async () => {
          try {
            const cacheada = soloCache ? await leerCaratulaCacheada(env, nombre, plataformas) : null;
            if (soloCache && cacheada === undefined) {
              res.statusCode = 404;
              res.setHeader('Cache-Control', 'private, max-age=3600');
              res.setHeader('X-Cover', 'sin-resolver');
              res.end('Carátula aún sin resolver');
              return;
            }
            const coverId = soloCache ? cacheada : await resolverCaratula(env, nombre, plataformas);
            // Mismo contrato que producción: no haber podido preguntar a IGDB es 503, no «no tiene».
            if (coverId === undefined) {
              res.statusCode = 503;
              res.setHeader('Cache-Control', 'no-store');
              res.end('No se ha podido consultar IGDB; inténtalo más tarde');
              return;
            }
            if (!coverId) {
              res.statusCode = 404;
              res.setHeader('Cache-Control', 'no-store');
              res.end('Sin carátula');
              return;
            }
            if (soloMapa) {
              res.statusCode = 204;
              res.setHeader('Cache-Control', 'no-store');
              res.end();
              return;
            }
            if (!esIdDeCaratula(coverId)) {
              res.statusCode = 502;
              res.end('Identificador de carátula inesperado');
              return;
            }
            const imagen = await fetch(urlDeImagen(coverId, tamano));
            if (!imagen.ok) {
              res.statusCode = 502;
              res.end('La carátula no se pudo descargar');
              return;
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', imagen.headers.get('Content-Type') ?? 'image/jpeg');
            // Sin caché de navegador en local: se quiere ver el efecto de un cambio al recargar.
            res.setHeader('Cache-Control', 'no-store');
            res.end(Buffer.from(await imagen.arrayBuffer()));
          } catch {
            res.statusCode = 502;
            res.setHeader('Cache-Control', 'no-store');
            res.end('No se pudo resolver la carátula');
          }
        })();
      });
    },
  };
}

/**
 * GEMELO DE `/poster` Y `/api/tmdb-search` en desarrollo, como `localCoverApi` lo es de `/cover`: sin él, el panel
 * no podría buscar imágenes de nominados en local y la votación enseñaría huecos donde producción pinta pósters.
 *
 * Tira de `functions/_lib/tmdb`, el mismo módulo que las Functions, y lee el token de `.dev.vars`. Lo único que
 * no tiene es la comprobación de administrador de la búsqueda: aquí no hay tokens que verificar, y quien llama es
 * quien ha levantado el servidor en su propia máquina (el mismo criterio que `localPremiosApi`).
 */
function localTmdbApi(): Plugin {
  const deDevVars = (clave: string): string => {
    try {
      const texto = readFileSync(new URL('./.dev.vars', import.meta.url), 'utf-8');
      return new RegExp(`^${clave}=(.*)$`, 'm').exec(texto)?.[1]?.trim() ?? '';
    } catch {
      return '';
    }
  };

  const enviar = (res: ServerResponse, status: number, cuerpo: unknown): void => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(cuerpo));
  };

  return {
    name: 'local-tmdb-api',
    apply: 'serve',

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const ruta = req.url?.split('?')[0];
        if (ruta !== '/poster' && ruta !== '/api/tmdb-search') {
          next();
          return;
        }
        const url = new URL(req.url ?? '', 'http://localhost');

        void (async () => {
          try {
            if (ruta === '/poster') {
              const camino = url.searchParams.get('p');
              if (!esRutaDeImagenTmdb(camino)) {
                res.statusCode = 400;
                res.end('Ruta de imagen no válida');
                return;
              }
              const imagen = await fetch(urlDeImagenTmdb(camino, tamanoPoster(url.searchParams.get('s'))));
              if (!imagen.ok) {
                res.statusCode = 502;
                res.end('La imagen no se pudo descargar');
                return;
              }
              res.statusCode = 200;
              res.setHeader('Content-Type', imagen.headers.get('Content-Type') ?? 'image/jpeg');
              // Sin caché de navegador en local, como `/cover`: se quiere ver el cambio al recargar.
              res.setHeader('Cache-Control', 'no-store');
              res.end(Buffer.from(await imagen.arrayBuffer()));
              return;
            }

            const token = deDevVars('TMDB_READ_TOKEN');
            if (!token) {
              enviar(res, 501, {
                error: 'No hay TMDB_READ_TOKEN en .dev.vars: la búsqueda de TMDB no funciona en desarrollo.',
              });
              return;
            }
            const consulta = (url.searchParams.get('q') ?? '').trim();
            if (!consulta || consulta.length > MAX_BUSQUEDA_TMDB) {
              enviar(res, 400, { error: 'Falta qué buscar' });
              return;
            }
            const tipo = url.searchParams.get('k') === 'person' ? 'person' : 'screen';
            const candidatos = await buscarEnTmdb(token, consulta, tipo);
            if (candidatos === null) {
              enviar(res, 503, { error: 'No se ha podido consultar TMDB; inténtalo más tarde' });
              return;
            }
            enviar(res, 200, { results: candidatos });
          } catch {
            res.statusCode = 502;
            res.setHeader('Cache-Control', 'no-store');
            res.end('No se pudo atender la petición a TMDB');
          }
        })();
      });
    },
  };
}

/**
 * GEMELO DE `/api/github-oauth` en desarrollo: el canje del `code` de «Conectar con GitHub» por el token. La lógica
 * y el porqué están en `scripts/devGithubOAuth.ts`, que llama a la misma Function de producción.
 *
 * Con una OAUTH APP DE DESARROLLO, nunca la de producción (su callback es el dominio publicado y GitHub no acepta
 * otro): su `client_id` va en `VITE_GITHUB_CLIENT_ID` de `.env.development.local` —el mismo que lee la
 * aplicación, así que el botón aparece en local en cuanto lo pones— y su secreto en `GITHUB_DEV_CLIENT_SECRET` de
 * `.dev.vars`. Con otro nombre que el de producción A PROPÓSITO: `wrangler pages secret bulk .dev.vars` sube todas
 * las líneas, y un `GITHUB_CLIENT_SECRET` de desarrollo pisaría el bueno. Sin nada de esto, local sigue como
 * estaba: sin OAuth, y el botón abre la conexión manual.
 */
function localGithubOAuthApi(): Plugin {
  let clientId = '';
  const deDevVars = (clave: string): string => {
    try {
      const texto = readFileSync(new URL('./.dev.vars', import.meta.url), 'utf-8');
      return new RegExp(`^${clave}=(.*)$`, 'm').exec(texto)?.[1]?.trim() ?? '';
    } catch {
      return '';
    }
  };

  return {
    name: 'local-github-oauth-api',
    apply: 'serve',
    configResolved(config) {
      clientId = String(config.env.VITE_GITHUB_CLIENT_ID ?? '').trim();
    },
    configureServer(server) {
      server.middlewares.use(githubOAuthDevMiddleware({
        clientId: () => clientId,
        clientSecret: () => deDevVars('GITHUB_DEV_CLIENT_SECRET'),
        warn: (message) => server.config.logger.warn(message),
      }));
    },
  };
}

export default defineConfig({
  // Identificador de build inyectado en tiempo de compilación; lo usa la telemetría para etiquetar errores/eventos.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version || '0.0.0'),
  },
  plugins: [
    react(),
    serviceWorkerPrecache(),
    notFoundShell(),
    localAnnouncementApi(),
    localPremiosApi(),
    localCoverApi(),
    localTmdbApi(),
    localGithubOAuthApi(),
  ],
  server: {
    port: 8000,
    open: false,
  },
  build: {
    outDir: 'dist',
    // Target explícito y moderno: evita sorpresas si cambia el default al actualizar Vite.
    target: 'es2022',
    // `hidden`: se emiten los .map pero SIN el comentario `sourceMappingURL`, así que el navegador no los
    // descarga solo. Con `dropConsole` + minificación, los stacks que llegan a la telemetría venían de código
    // ofuscado e ilegibles; ahora se pueden mapear a mano. El código es GPL y público, así que publicar los
    // mapas no revela nada que no esté ya en el repositorio.
    sourcemap: 'hidden',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Minificación oxc con eliminación de console.*/debugger en producción (no afecta a dev).
        // Vite 8 usa oxc; el drop va en las opciones de minify de rolldown (compress), no en el transform.
        minify: { compress: { dropConsole: true, dropDebugger: true } },
        manualChunks: (id) => {
          // Vendor chunks for better caching and parallelization
          // `firebase/analytics` en su PROPIO chunk, antes que la regla general: `firebaseClient` lo pide con
          // `import()` solo con el consentimiento dado, y dentro del grupo `firebase` (que se importa estático)
          // arrastraba `@firebase/analytics` e `installations` (~5 kB comprimidos): se descargaba siempre, con
          // consentimiento o sin él.
          if (id.includes('node_modules/firebase/analytics/')) {
            return 'firebase-analytics';
          }
          if (id.includes('node_modules/firebase/')) {
            return 'firebase';
          }
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react';
          }
          // `react-router`, SIN el `-dom`: `react-router-dom` es una fachada que apenas tiene código propio y
          // reexporta desde `react-router`, así que la regla anterior (`react-router-dom/`) no casaba con nada —
          // no se emitía ningún chunk `router` y los ~363 kB de fuente de `react-router`, el módulo más grande
          // del bundle, acababan dentro del chunk de entrada. Sin el `/` final para cubrir ambos paquetes.
          if (id.includes('node_modules/react-router')) {
            return 'router';
          }
          if (id.includes('node_modules/@tanstack/react-virtual/')) {
            return 'virtual';
          }
        },
      },
    },
  },
});
