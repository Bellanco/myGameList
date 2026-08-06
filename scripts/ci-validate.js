const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.join(__dirname, '..');

// Presupuesto de bytes del ARRANQUE (comprimido): la suma de los assets que el service worker precachea, que son
// exactamente los que el navegador necesita para pintar la app. Es el número que decide cuánto tarda en abrirse en
// una conexión mala, así que engordarlo debe ser una decisión consciente y no un efecto colateral de un import.
// Si se sube, hay que subirlo aquí a mano y explicar por qué en el commit.
const BOOT_PAYLOAD_BUDGET_KB = 200;
const publicDir = path.join(root, 'public');
const requiredFiles = [
  path.join(root, 'index.html'),
  path.join(publicDir, 'robots.txt'),
  path.join(publicDir, '_headers'),
  path.join(publicDir, 'manifest.json'),
  path.join(publicDir, 'service-worker.js'),
  path.join(root, 'src', 'main.tsx'),
  path.join(root, 'src', 'App.tsx'),
  path.join(root, 'README.md'),
  path.join(root, 'CHANGELOG.md'),
  path.join(root, 'tsconfig.json'),
  path.join(root, 'vite.config.ts'),
  path.join(root, 'vitest.config.js'),
];

const fail = (message) => {
  console.error('CI validation failed:', message);
  process.exit(1);
};

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    fail(`Missing required file: ${path.relative(root, file)}`);
  }
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!html.includes('type="module"') || !html.includes('/src/main.tsx')) {
  fail('index.html does not reference /src/main.tsx as module entry point');
}

// El service worker de `public/` tiene que conservar los marcadores que el build sustituye por la lista real de
// assets del arranque (plugin `serviceWorkerPrecache` en vite.config.ts). Si alguien los renombra o los quita, el
// build ya falla; esto lo detecta antes y con un mensaje que explica por qué existen.
const swSource = fs.readFileSync(path.join(publicDir, 'service-worker.js'), 'utf8');
for (const token of ['self.__SW_BUILD_ID__', 'self.__PRECACHE_ASSETS__']) {
  if (!swSource.includes(token)) {
    fail(
      `public/service-worker.js ya no contiene el marcador ${token}. ` +
        'El build lo sustituye por la lista de assets del arranque; sin él la app no arranca sin red.',
    );
  }
}

// Y en el build (CI compila ANTES de validar) esa sustitución tiene que haber ocurrido de verdad, con una lista
// no vacía. Es la comprobación que impide volver al bug original —PWA que dice funcionar offline y no arranca—
// sin que nadie se entere hasta que un usuario se queda sin red.
const builtSw = path.join(root, 'dist', 'service-worker.js');
if (fs.existsSync(builtSw)) {
  const built = fs.readFileSync(builtSw, 'utf8');
  if (built.includes('self.__PRECACHE_ASSETS__')) {
    fail('dist/service-worker.js sigue con el marcador sin sustituir: el precache del arranque se ha quedado vacío.');
  }
  const match = built.match(/const PRECACHE_ASSETS = (\[[^\]]*\])/);
  if (!match) {
    fail('dist/service-worker.js no declara PRECACHE_ASSETS con una lista literal.');
  }
  const precached = JSON.parse(match[1]);
  const hasJs = precached.some((asset) => asset.endsWith('.js'));
  const hasCss = precached.some((asset) => asset.endsWith('.css'));
  if (!hasJs || !hasCss) {
    fail(`dist/service-worker.js precachea ${precached.length} assets sin JS y/o sin CSS: la app no arrancaría sin red.`);
  }

  const gzipBytes = precached.reduce(
    (total, asset) => total + zlib.gzipSync(fs.readFileSync(path.join(root, 'dist', asset))).length,
    0,
  );
  const gzipKb = gzipBytes / 1024;
  console.log(
    `Service worker: ${precached.length} assets del arranque, ${gzipKb.toFixed(1)} kB comprimidos ` +
      `(presupuesto ${BOOT_PAYLOAD_BUDGET_KB} kB).`,
  );
  if (gzipKb > BOOT_PAYLOAD_BUDGET_KB) {
    fail(
      `El arranque pesa ${gzipKb.toFixed(1)} kB comprimidos y el presupuesto es ${BOOT_PAYLOAD_BUDGET_KB} kB. ` +
        'Mira si lo que ha entrado en el grafo estático debería ser un import() diferido.',
    );
  }
}

// El SDK de Firestore se usa en su variante `lite` (ver el comentario de `firebaseClient.ts`): el completo pesa
// ~108 kB comprimidos MÁS y su única ventaja —listeners en tiempo real y caché offline— no se usa en esta app.
// Como basta un import descuidado para volver a arrastrarlo, se comprueba aquí.
const fullFirestoreImports = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.tsx?$/.test(entry.name) && /['"]firebase\/firestore['"]/.test(fs.readFileSync(full, 'utf8'))) {
      fullFirestoreImports.push(path.relative(root, full));
    }
  }
};
walk(path.join(root, 'src'));
if (fullFirestoreImports.length > 0) {
  fail(
    `Estos ficheros importan el SDK completo de Firestore en vez de 'firebase/firestore/lite': ${fullFirestoreImports.join(', ')}. ` +
      'Si de verdad hace falta (onSnapshot / persistencia offline), quita esta comprobación explicando por qué.',
  );
}

console.log('CI validation passed. All required files are present.');
