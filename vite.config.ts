import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
// El MISMO saneado que usan el cliente y la Pages Function: el servidor de desarrollo no puede ser más
// permisivo que producción, o se prueba con textos que en la web real se recortan.
import { sanitizeAnnouncement } from './src/core/announcement/announcement';

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

    // La fuente base va aparte: vive en `public/fonts/` (no la emite el bundle, así que no aparece en `bundle`)
    // y sin precachearla la app arrancaría sin red pero con la tipografía de sistema. Solo el subconjunto `latin`:
    // `latin-ext` cubre caracteres que el castellano y el inglés casi nunca usan, y su `unicode-range` hace que el
    // navegador solo lo pida si de verdad aparece uno.
    buildStart() {
      const fontsDir = new URL('./public/fonts/', import.meta.url);
      criticalFontPaths = readdirSync(fontsDir)
        .filter((name) => /^dm-sans-latin-[a-f0-9]+\.woff2$/.test(name))
        .map((name) => `/fonts/${name}`);
      if (criticalFontPaths.length === 0) {
        throw new Error('[service-worker-precache] No se ha encontrado la fuente base en public/fonts/ (dm-sans-latin-*.woff2).');
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

export default defineConfig({
  // Identificador de build inyectado en tiempo de compilación; lo usa la telemetría para etiquetar errores/eventos.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version || '0.0.0'),
  },
  plugins: [
    react(),
    serviceWorkerPrecache(),
    localAnnouncementApi(),
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
