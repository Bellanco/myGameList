/**
 * Copia las CATEGORÍAS de la porra desde el proyecto antiguo (`game-awards-d7881`, la aplicación `../GA`) a este
 * proyecto, en la colección `premiosCategories`.
 *
 * ES LO ÚNICO QUE SE MIGRA. No hay ediciones publicadas, así que el histórico, los votos y los ganadores nacen
 * vacíos aquí; ver `docs/plan-unificar-premios.md` §2.1. Migrar las categorías sí merece la pena: son 27 títulos
 * bilingües con su peso y su orden, y rehacerlos a mano en el panel es una tarde perdida.
 *
 * POR QUÉ NO HACE FALTA UNA CLAVE DEL PROYECTO VIEJO: allí las categorías son de LECTURA PÚBLICA —tienen que
 * serlo, porque hacen falta para votar—, así que se leen por la API REST sin autenticarse. La clave de servicio
 * solo se necesita para ESCRIBIR aquí.
 *
 * USO
 *   npm i firebase-admin --prefix /tmp/admin-sdk
 *   node scripts/migrate-premios-categories.mjs --sdk /tmp/admin-sdk/node_modules --key clave.json
 *   node scripts/migrate-premios-categories.mjs --sdk ... --key clave.json --apply
 *
 * SIN `--apply` NO ESCRIBE NADA: enseña qué haría y termina. Es una migración a producción; conviene mirarla
 * antes.
 *
 * Es IDEMPOTENTE y conserva el id de cada documento. Volver a ejecutarlo reescribe las mismas categorías con lo
 * que haya en el origen; lo que ya hubiera aquí con otro id no se toca.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] || '' : '';
};

const SOURCE_PROJECT = value('from') || 'game-awards-d7881';
const SOURCE_COLLECTION = 'categories';
const TARGET_COLLECTION = 'premiosCategories';

const apply = flag('apply');
const key = value('key') || process.env.GOOGLE_APPLICATION_CREDENTIALS || '';

/** Convierte un valor de la API REST de Firestore a su equivalente nativo. */
function fromRest(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromRest);
  if ('mapValue' in value) return fromRestFields(value.mapValue.fields || {});
  return null;
}

function fromRestFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromRest(v)]));
}

/** Lee la colección entera del proyecto de origen, paginando. */
async function readSourceCategories() {
  const base = `https://firestore.googleapis.com/v1/projects/${SOURCE_PROJECT}/databases/(default)/documents/${SOURCE_COLLECTION}`;
  const out = [];
  let pageToken = '';

  do {
    const url = `${base}?pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`El proyecto de origen respondió ${response.status}: ${await response.text()}`);
    }
    const body = await response.json();
    for (const document of body.documents || []) {
      out.push({ id: document.name.split('/').pop(), data: fromRestFields(document.fields || {}) });
    }
    pageToken = body.nextPageToken || '';
  } while (pageToken);

  return out;
}

const todas = await readSourceCategories();

// EL CENTINELA NO VIAJA. Cuando allí se borra la última categoría, el documento no se elimina: se deja vacío y
// marcado, para que la colección no desaparezca de Firestore (una colección sin documentos deja de existir). Aquí
// no hace falta ninguno —llegan 26 categorías de golpe— y arrastrarlo solo metería una fila fantasma en el panel.
const descartadas = todas.filter((c) => c.data.isPlaceholder || !(c.data.title?.es || c.data.title?.en));
const categorias = todas
  .filter((c) => !descartadas.includes(c))
  .sort((a, b) => (a.data.orderIndex ?? 0) - (b.data.orderIndex ?? 0));

console.log(`Origen: ${SOURCE_PROJECT}/${SOURCE_COLLECTION} → ${categorias.length} categorías`);
if (descartadas.length > 0) {
  console.log(`(${descartadas.length} documento(s) sin título descartados: el centinela de la colección de origen)`);
}
for (const { id, data } of categorias) {
  const titulo = data.title?.es || data.title?.en || '(sin título)';
  const nominados = (data.options || []).length;
  console.log(`  ${String(data.orderIndex ?? 0).padStart(2)} · ${titulo} · peso ${data.weight ?? 1} · ${nominados} nominados · ${id}`);
}

if (!apply) {
  console.log('\nSimulación: no se ha escrito nada. Añade --apply para migrarlas de verdad.');
  process.exit(0);
}

if (!key) {
  console.error('Para escribir hace falta la clave de servicio: --key <ruta>.');
  process.exit(1);
}

const sdkPath = value('sdk') || process.env.ADMIN_SDK_PATH || '';
const require = sdkPath
  ? createRequire(pathToFileURL(path.join(path.resolve(sdkPath), 'anchor.js')))
  : createRequire(import.meta.url);

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const credential = JSON.parse(readFileSync(path.resolve(key), 'utf8'));
initializeApp({ credential: cert(credential) });
const db = getFirestore();

console.log(`\nDestino: ${credential.project_id}/${TARGET_COLLECTION}`);

// En lotes, como cualquier escritura masiva: Firestore admite 500 operaciones por lote.
let escritas = 0;
let batch = db.batch();
let enLote = 0;

for (const { id, data } of categorias) {
  batch.set(db.collection(TARGET_COLLECTION).doc(id), {
    title: { es: data.title?.es || '', en: data.title?.en || data.title?.es || '' },
    // Los nominados NO se arrastran: cada edición pone los suyos, y los de la anterior se vacían al publicar.
    options: [],
    optionIds: [],
    weight: typeof data.weight === 'number' ? data.weight : 1,
    orderIndex: typeof data.orderIndex === 'number' ? data.orderIndex : 0,
    isActive: data.isActive !== false,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  enLote += 1;
  escritas += 1;
  if (enLote === 500) {
    await batch.commit();
    batch = db.batch();
    enLote = 0;
  }
}
if (enLote > 0) await batch.commit();

console.log(`${escritas} categorías migradas a ${TARGET_COLLECTION}.`);
console.log('Los nominados no se copian: los pone cada edición desde el panel.');
