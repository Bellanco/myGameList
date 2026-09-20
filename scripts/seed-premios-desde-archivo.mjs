/**
 * Copia los NOMINADOS de una edición ya publicada a las categorías de la edición en curso.
 *
 * PARA QUÉ: dejar la edición de pruebas con una papeleta de verdad —veintiséis categorías con sus cinco o seis
 * nominados— y poder así ver el comportamiento de la sección con datos reales en vez de con dos juegos de
 * ejemplo. Se usó el 20-09-2026 para sembrar «Test 2026» desde el archivo de 2025.
 *
 * SE QUEDA EN EL REPOSITORIO, como `import-premios-2025.mjs` y `purge-profile-pii.js`: lo que escribe en
 * producción tiene que poder leerse después. No forma parte de ningún flujo de la app.
 *
 * EMPAREJA POR ID DE CATEGORÍA, no por título: el archivo publicado conserva el id real de cada categoría, así
 * que el cruce es exacto y una categoría renombrada sigue casando. La que no esté en el archivo se queda como
 * está y se avisa por pantalla.
 *
 * LOS IDS DE NOMINADO SE REGENERAN (`<categoría>_option_<uuid>`), igual que hace `buildStableOptions`: los del
 * archivo son `_option_<n>`, derivados del índice, y `core/premios/options` explica por qué esa forma no puede
 * volver (al borrar uno y añadir otro, el nuevo hereda los votos del que se fue).
 *
 * NO TOCA NADA MÁS: ni el peso, ni el orden, ni las fechas de la categoría. Solo `options`, su espejo
 * `optionIds` y `updatedAt`.
 *
 * USO
 *   npm i --no-save firebase-admin
 *   export GOOGLE_APPLICATION_CREDENTIALS=/ruta/a/service-account.json   # NUNCA dentro del repo
 *   node scripts/seed-premios-desde-archivo.mjs [--from 2025] [--backup antes.json] [--apply]
 *
 * Sin `--apply` no escribe nada: enseña el cruce que haría. Con `--backup` guarda el estado previo de las
 * categorías, que es lo único que permite deshacerlo.
 */
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const valor = (nombre, porDefecto = '') => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] || porDefecto : porDefecto;
};
const DESDE = valor('from', '2025');
const RESPALDO = valor('backup');

let initializeApp;
let applicationDefault;
let getFirestore;
try {
  ({ initializeApp, applicationDefault } = await import('firebase-admin/app'));
  ({ getFirestore } = await import('firebase-admin/firestore'));
} catch {
  console.error('Falta firebase-admin. Instálalo sin guardarlo:  npm i --no-save firebase-admin');
  process.exit(1);
}

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Falta GOOGLE_APPLICATION_CREDENTIALS (ruta al service-account.json, FUERA del repo).');
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const archivo = (await db.doc(`premiosResults/${DESDE}`).get()).data();
if (!archivo) {
  console.error(`No existe premiosResults/${DESDE}.`);
  process.exit(1);
}

const snapshot = archivo.categoriesSnapshot || [];
const cats = await db.collection('premiosCategories').get();

if (RESPALDO) {
  const antes = {};
  cats.forEach((d) => { antes[d.id] = d.data(); });
  writeFileSync(RESPALDO, JSON.stringify(antes, null, 2), 'utf8');
  console.log(`Respaldo del estado previo en ${RESPALDO}\n`);
}

const porId = new Map(snapshot.map((c) => [c.id, c]));
const sinFuente = [];
let escritas = 0;
let nominados = 0;

for (const doc of cats.docs) {
  const actual = doc.data();
  const fuente = porId.get(doc.id);
  if (!fuente || !(fuente.options || []).length) {
    sinFuente.push(actual.title?.es || doc.id);
    continue;
  }

  const options = fuente.options.map((o) => ({
    id: `${doc.id}_option_${randomUUID()}`,
    name: String(o.name || '').trim(),
  }));

  console.log(`${(actual.title?.es || doc.id).padEnd(40)} ${String(actual.options?.length || 0).padStart(2)} → ${options.length}`);
  nominados += options.length;
  escritas += 1;

  if (APPLY) {
    await doc.ref.set(
      { options, optionIds: options.map((o) => o.id), updatedAt: new Date().toISOString() },
      { merge: true },
    );
  }
}

console.log(`\n${escritas} categorías con nominados (${nominados} en total), desde la edición ${DESDE}.`);
if (sinFuente.length) console.log(`Sin fuente en el archivo: ${sinFuente.join(', ')}`);
console.log(APPLY ? '\nESCRITO.' : '\nPrueba en seco: no se ha escrito nada. Añade --apply.');
