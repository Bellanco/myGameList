const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.join(__dirname, '..');

// Presupuesto de bytes del ARRANQUE (comprimido): la suma de los assets que el service worker precachea, que son
// exactamente los que el navegador necesita para pintar la app. Es el número que decide cuánto tarda en abrirse en
// una conexión mala, así que engordarlo debe ser una decisión consciente y no un efecto colateral de un import.
// Si se sube, hay que subirlo aquí a mano y explicar por qué en el commit.
//
// Pasó de 200 a 240 al autohospedar las fuentes, y NO porque el arranque se encareciera: la fuente base (~36 kB)
// se descargaba igual desde Google, solo que de un tercero y sin aparecer en esta cuenta. Ahora está contada, y
// además llega antes (sin los dos saltos de red a fonts.googleapis.com + fonts.gstatic.com).
//
// Y de 240 a 215 al sacar Zod (~19 kB comprimidos) del arranque: solo lo usa la validación de esquema al ESCRIBIR
// el gist social, así que ahora se carga bajo demanda (ver `loadSocialGistValidator`). El presupuesto se aprieta a
// propósito, para que volver a importarlo de forma estática desde un módulo del arranque rompa el build en vez de
// pasar desapercibido. El margen que queda es para crecimiento normal, no para reintroducir una librería entera.
//
// El TECHO no se ha movido desde entonces, pero el margen sí: llegó a quedar en 0,9 kB —el siguiente `import` de
// cualquier cosa rompía el build— y se recuperó sacando del CSS de arranque las hojas de dos pantallas que ya
// entraban por `lazy()`: el panel de administración (`admin.scss`, lo importa `AdminHub.tsx`) y el modal de la
// ruleta (`roulette-modal.scss`, lo importa `RouletteModal.tsx`). Son ~24 kB sin comprimir que descargaba todo el
// mundo para dos pantallas que casi nadie abre.
//
// Y DE 215 A 220, que es la primera vez que este número sube por crecimiento normal y no por una decisión de
// arquitectura. Se subió después de buscar grasa y NO ENCONTRARLA, midiendo —no suponiendo— contra los
// sourcemaps de los assets que este mismo script precachea:
//
//   · De los 52 símbolos de `IconSprite`, CERO son exclusivos de pantallas perezosas. Partir el sprite, que era
//     la sospecha principal (~31 kB de fuente), no habría sacado del arranque ni un icono.
//   · De las constantes de `core/constants/labels.ts`, CERO las usa solo un chunk perezoso.
//   · Las hojas de pantalla perezosa ya están todas fuera de `index.scss`: stats, admin, social, achievements,
//     reviews, import y el modal de la ruleta.
//
// El reparto de lo que queda es: ~63 kB de código propio, ~58 de React, 36 de la tipografía base, ~27 de CSS,
// 14 de react-router y ~13 entre el virtualizador y los textos. No hay pasajeros.
//
// El único candidato con tamaño para diferirse era `socialProjection.ts` (~23 kB de fuente), y se descartó a
// conciencia: lo usa `gistRepository` tanto al LEER el gist como al escribirlo, así que diferirlo obliga a
// partir en dos la pieza de la sincronización —la que ya costó una pérdida de datos— por unos 4 kB. No sale a
// cuenta, y dejarlo escrito aquí evita que alguien lo intente dentro de seis meses creyendo que es fruta baja.
//
// QUÉ HACER CUANDO ESTE MARGEN SE AGOTE, por orden: (1) convertir el sprite en un `.svg` externo referenciado
// con `<use href="/sprite.svg#icon-x">`, que saca ~6 kB de JS a cambio de una petición; (2) revisar si la
// tipografía base puede servirse con menos pesos. Subir el número otra vez es lo último, y exige volver a hacer
// estas tres mediciones y escribir el resultado aquí.
//
// Y HAY UNA TERCERA, seis veces más grande que la primera, que se midió el 17-09-2026 y NO se aplicó: sacar la
// tipografía base del precache. Son 36 kB, el 17 % del presupuesto, y no se perdería del todo —`/fonts/` cae en
// `handleStaleWhileRevalidate`, así que entraría en caché en la primera visita que la use—. Lo que sí se pierde
// es el primer arranque SIN RED DESPUÉS DE CADA DESPLIEGUE: `activate` borra las cachés que no son la del build
// nuevo, así que hasta que alguien vuelva a pedirla con red, la aplicación se pinta con la tipografía del
// sistema. Es degradación estética y no funcional, pero es recurrente —una vez por despliegue—, y por eso va
// después de las dos de arriba y no antes, pese a soltar mucho más espacio.
//
// SEGUNDA MEDICIÓN (17-09-2026), esta vez atribuyendo los bytes del chunk a sus módulos con el sourcemap —que es
// la forma de no discutir de memoria—: se decodifican los `mappings` y se suman los bytes de salida por fichero
// de origen. Lo que salió, sin comprimir, dentro de `index-*.js`:
//
//     28,4 kB  IconSprite.tsx        17,5 kB  GameTable.tsx        13,4 kB  App.tsx
//      9,8 kB  useSyncViewModel.ts    8,4 kB  useGameListViewModel  6,4 kB  gistRepository.ts
//
// Tres conclusiones:
//   · `IconSprite` es el mayor con diferencia, el 15 % del chunk. Confirma con datos que la palanca (1) de
//     arriba es la buena: sacarlo a un `.svg` externo son ~6 kB comprimidos, y subiría el margen de ~5 a ~11 kB.
//   · La RULETA se colaba en el arranque y ya no: el modal era perezoso, pero `App` importaba `buildListsPool`
//     y `buildListsWeigher` de forma estática para dos `useMemo`. El cálculo se mudó a `ListsRouletteModal`
//     (envoltorio dentro del chunk perezoso). OJO, LA LECCIÓN: eso SOLO no cambió ni un byte, porque
//     `normalizeName` vivía en el mismo módulo y la importan el listado y la importación, así que el fichero
//     entraba entero igual. Hizo falta mudarla a `core/utils/normalizeName`. Resultado: 215,1 → 214,3 kB.
//   · Los efectos de firma (`useSignatureEffects` 2,7 kB + `useShootingStars` 1,9) son diferibles y se
//     DESCARTARON: el wipe al navegar se quiere listo desde el primer render, y 4,6 kB sin comprimir no pagan
//     arriesgar la sensación de la aplicación.
//
// Y uno que PARECÍA una fuga y no lo es: `FeedShell` está en el arranque a propósito —es el esqueleto que se
// pinta mientras el hub social se descarga—. Si fuera perezoso no habría nada que enseñar durante la carga.
// Y UNA CONSECUENCIA PRÁCTICA (17-09-2026): **React está fijado en 19.2.8 en `package.json`, sin `^`**, y es por
// esto. Subirlo a 19.3.0 engorda su chunk de 57,5 a 65,8 kB —8,3 kB— y el arranque se va a 223,3, por encima del
// presupuesto: `npm update` lo subió, la validación lo cazó y hubo que volver atrás. Para poder actualizar React
// hay que hacer sitio ANTES, y el sitio está en la palanca (1) de arriba. No se quita el pin sin eso.
// ¿Y LOS OCHO TEMAS? Se preguntan solos al mirar el CSS, así que aquí está la medida (17-09-2026) para no
// repetirla: el CSS del arranque con los ocho pesa 26,5 kB comprimidos y con uno solo 22,3. Los siete que no
// usas cuestan **4,2 kB**, unos 600 bytes cada uno. Son solo TOKENS DE COLOR (CAPA 2/2b), que comprimen de
// maravilla porque repiten los mismos nombres de variable; la parte cara de un tema —letra, formas, texturas,
// ornamento (CAPA 3)— ya se carga bajo demanda desde `view/hooks/paletteSkin.ts`.
//
// NO se cargan por separado, y no es pereza: esos tokens son lo que pinta el PRIMER FOTOGRAMA. Sacarlos a un
// fichero aparte obliga a elegir entre bloquear el render hasta descargarlo o enseñar la aplicación sin color
// un instante, y cambiar de tema pasaría a ser asíncrono. Cuatro kilobytes no pagan eso: la palanca (1) da más
// del doble sin tocar el primer fotograma.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// DOS NÚMEROS Y NO UNO, desde el 17-09-2026. El de antes (220 kB para todo el precache) mezclaba dos cosas que
// no se parecen, y eso tenía un agujero: la tipografía son 36 kB con `font-display: swap`, o sea que NO retrasa
// el primer pintado —la página se dibuja con la letra del sistema—. Con un solo número, alguien podía sacarla
// del precache y meter 36 kB de JavaScript en su lugar sin que saltara nada, y la aplicación arrancaría mucho
// peor con el mismo total. Ahora eso no cuela.
//
//   · CRÍTICO — el JS y el CSS que hay que descargar y ejecutar ANTES de ver nada. Es el número que importa y
//     el que no debe crecer: si sube, hay que diferir algo, no subir el tope.
//   · TOTAL — todo el precache, fuentes incluidas. No retrasa el pintado; mide lo que cuesta dejar la
//     aplicación lista para funcionar sin red. Puede crecer con más holgura.
//
// De dónde salen los topes (medido el 17-09-2026, con React 19.3 y el motor de sync ya diferido): crítico
// 183,2 kB y total 219,2. Los topes dejan ~7 kB de margen en lo crítico —lo justo para un cambio normal, no
// para una pieza nueva— y ~21 en el total, que es donde caben una fuente más o un icono grande sin drama.
//
// SUBIR EL CRÍTICO ES LO ÚLTIMO, y sigue exigiendo lo de siempre: rehacer las tres mediciones de arriba y
// escribir aquí el resultado. Lo que hay que hacer ANTES está en la lista de palancas, por orden.
const BOOT_CRITICAL_BUDGET_KB = 190;
const BOOT_TOTAL_BUDGET_KB = 240;
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
  path.join(root, 'vitest.config.mjs'),
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

// FUENTES PROPIAS. Se sirven desde `public/fonts/` para no depender de Google Fonts (dos saltos de red a un
// tercero en la ruta crítica, y la IP del visitante enviada en cada carga). Dos cosas que se pueden romper sin
// que nadie lo note:
//  1) el `preload` de `index.html` lleva el nombre CON HASH de la fuente base: si se re-ejecuta
//     `scripts/vendor-fonts.mjs` y el hash cambia, ese preload apunta a un 404 y se pierde la ventaja;
//  2) que alguien vuelva a meter una referencia a Google Fonts, que además la CSP ya no permite (fallaría en
//     producción, pero en silencio: el navegador cae a la fuente de sistema).
const fontsDir = path.join(publicDir, 'fonts');
if (!fs.existsSync(fontsDir)) {
  fail('Falta public/fonts/. Ejecuta `node scripts/vendor-fonts.mjs`.');
}
const preloadMatch = html.match(/<link rel="preload" href="(\/fonts\/[^"]+)"/);
if (!preloadMatch) {
  fail('index.html no precarga ninguna fuente propia (se perdió el <link rel="preload"> de la fuente base).');
}
const preloadedFont = path.join(root, 'public', preloadMatch[1]);
if (!fs.existsSync(preloadedFont)) {
  fail(
    `index.html precarga ${preloadMatch[1]}, que no existe en public/fonts/. ` +
      'Si has regenerado las fuentes, actualiza el href del preload con el nuevo nombre.',
  );
}

// EL ARTE DEL PODIO. La lámina se carga por su URL al abrir el trofeo, así que si un fichero desaparece —una
// limpieza de `public/`, un despliegue a medias— el canvas se queda en blanco y nadie se entera hasta que alguien
// gana algo. Los nombres los fija `core/premios/awards.ts`, que es la fuente: aquí solo se comprueba que están y
// que pesan lo que pesa un JPEG de verdad, no un marcador de posición.
const awardsDir = path.join(publicDir, 'awards');
for (let rank = 1; rank <= 5; rank += 1) {
  const lamina = path.join(awardsDir, `rank-${rank}.jpg`);
  if (!fs.existsSync(lamina)) {
    fail(`Falta public/awards/rank-${rank}.jpg: el trofeo de ese puesto se quedaría en blanco.`);
  } else if (fs.statSync(lamina).size < 10_000) {
    fail(`public/awards/rank-${rank}.jpg pesa menos de 10 kB: parece truncado o un marcador de posición.`);
  }
}

const googleFontRefs = [];
const walkStyles = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkStyles(full);
    else if (/\.(scss|css)$/.test(entry.name)) {
      const text = fs.readFileSync(full, 'utf8');
      // Solo cuentan las referencias REALES (un `url(...)`), no las menciones en comentarios.
      if (/url\(["']?https:\/\/fonts\.(googleapis|gstatic)\.com/.test(text)) {
        googleFontRefs.push(path.relative(root, full));
      }
    }
  }
};
walkStyles(path.join(root, 'src', 'styles'));
if (/fonts\.(googleapis|gstatic)\.com/.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  googleFontRefs.push('index.html');
}
if (googleFontRefs.length > 0) {
  fail(
    `Estos ficheros vuelven a cargar fuentes desde Google: ${googleFontRefs.join(', ')}. ` +
      'La CSP ya no lo permite; vendoriza la familia con `node scripts/vendor-fonts.mjs`.',
  );
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

  const pesos = precached.map((asset) => ({
    asset,
    kb: zlib.gzipSync(fs.readFileSync(path.join(root, 'dist', asset))).length / 1024,
  }));
  /* QUÉ BLOQUEA EL PRIMER PINTADO: el JavaScript y el CSS, sí; las FUENTES, no —van con `font-display: swap`,
     así que la página se dibuja con la del sistema y la buena entra cuando llega—. Es toda la clasificación que
     hace falta: en el precache no hay otra cosa. */
  const bloquea = ({ asset }) => !/\.(woff2?|ttf|otf)$/i.test(asset);
  const criticoKb = pesos.filter(bloquea).reduce((total, { kb }) => total + kb, 0);
  const totalKb = pesos.reduce((total, { kb }) => total + kb, 0);

  console.log(
    `Service worker: ${precached.length} assets del arranque · ` +
      `crítico ${criticoKb.toFixed(1)}/${BOOT_CRITICAL_BUDGET_KB} kB · ` +
      `total ${totalKb.toFixed(1)}/${BOOT_TOTAL_BUDGET_KB} kB (comprimidos).`,
  );
  if (criticoKb > BOOT_CRITICAL_BUDGET_KB) {
    fail(
      `Lo que BLOQUEA el primer pintado pesa ${criticoKb.toFixed(1)} kB comprimidos y el tope es ` +
        `${BOOT_CRITICAL_BUDGET_KB} kB. Este es el número que importa: mira si lo que ha entrado en el grafo ` +
        'estático debería ser un import() diferido.',
    );
  }
  if (totalKb > BOOT_TOTAL_BUDGET_KB) {
    fail(
      `El precache entero pesa ${totalKb.toFixed(1)} kB comprimidos y el tope es ${BOOT_TOTAL_BUDGET_KB} kB. ` +
        'No retrasa el primer pintado, pero sí lo que cuesta dejar la aplicación lista para funcionar sin red.',
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
