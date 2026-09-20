/**
 * Importa al histórico la edición de 2025, que se jugó en una hoja de cálculo antes de que la porra viviera aquí.
 *
 * ES UN SCRIPT DE UN SOLO USO, y se queda en el repositorio por lo mismo que `purge-profile-pii.js`: lo que
 * escribió en producción tiene que poder leerse después. No forma parte de ningún flujo de la app.
 *
 * DE DÓNDE SALE CADA COSA:
 *   · `Datos.csv`     → los NOMINADOS de cada categoría (la lista completa, incluidos los que no votó nadie).
 *   · `Resultado.csv` → el GANADOR de cada categoría, el voto de cada participante y sus puntos finales.
 *
 * LOS PUNTOS NO SE COPIAN A CIEGAS: se recalculan con el mismo `scoreBallot` que usa la app —cruzando cada voto
 * con el ganador y el peso de su categoría— y se comparan con los del fichero. Si no cuadran, el script PARA. Es
 * la única forma de saber que el cruce de categorías y pesos es correcto y no una coincidencia afortunada.
 *
 * USO
 *   node scripts/import-premios-2025.mjs --sdk <ruta node_modules> --key clave.json [--apply]
 *
 * Sin `--apply` no escribe nada: enseña el archivo que construiría y las diferencias que haya encontrado.
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

const SEASON_ID = '2025';
const SEASON_NAME = 'Game Awards 2025';
const SEASON_YEAR = 2025;
const DOWNLOADS = `${process.env.HOME}/Downloads`;

/** Parser de CSV con comillas: los títulos llevan comas dentro («Erika Ishii, Ghost of Yōtei»). */
function parseCsv(texto) {
  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;

  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i += 1;
      } else if (c === '"') {
        entreComillas = false;
      } else {
        campo += c;
      }
      continue;
    }
    if (c === '"') entreComillas = true;
    else if (c === ',') {
      fila.push(campo);
      campo = '';
    } else if (c === '\n') {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else if (c !== '\r') campo += c;
  }
  if (campo || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

/** Para comparar títulos entre ficheros y con las categorías ya guardadas. */
const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const aNumero = (s) => Number(String(s || '0').replace(',', '.')) || 0;

// ─── Lectura de los dos ficheros ──────────────────────────────────────────────────────────────────────────

const datos = parseCsv(readFileSync(`${DOWNLOADS}/2025 Game Awards - Datos.csv`, 'utf8'));
const resultado = parseCsv(readFileSync(`${DOWNLOADS}/2025 Game Awards - Resultado.csv`, 'utf8'));

/** Nominados por categoría (título normalizado → lista de juegos). */
const nominados = new Map();
for (const fila of datos.slice(2)) {
  const titulo = (fila[1] || '').trim();
  if (!titulo) continue;
  const juegos = fila.slice(2).map((s) => s.trim()).filter(Boolean);
  if (juegos.length > 0) nominados.set(norm(titulo), { titulo, juegos });
}

const cabecera = resultado.find((f) => (f[1] || '').trim() === 'Categoría');
const votantes = cabecera.slice(3).map((s) => s.trim()).filter(Boolean);

/**
 * Categorías con su ganador y el voto de cada participante.
 *
 * SE CORTA EN «Resultado Final», y no es un detalle: debajo de esa fila el fichero repite la clasificación con el
 * nombre de cada persona en la columna de la categoría y sus puntos en la del ganador. Sin el corte, esas filas
 * entraban como catorce categorías más —«Sergio Pavón» ganada por «16»—.
 */
const categorias = [];
for (const fila of resultado) {
  const titulo = (fila[1] || '').trim();
  if (titulo === 'Resultado Final') break;
  if (!titulo || titulo === 'Categoría') continue;
  // «Mejor actuación» NO se añadió a aquella edición: está en la hoja porque la plantilla la traía, pero no contó
  // para nadie. Se queda fuera del archivo (confirmado por quien la organizó).
  if (titulo === 'Best Perfomance') continue;
  const winner = (fila[2] || '').trim();
  if (!winner) continue;
  const votos = {};
  votantes.forEach((nombre, i) => {
    const voto = (fila[3 + i] || '').trim();
    if (voto) votos[nombre] = voto;
  });
  categorias.push({ titulo, winner, votos });
}

/** Los puntos que dice el propio fichero, para contrastarlos con los recalculados. */
const filaPuntos = resultado.find((f) => (f[1] || '').trim() === 'Resultado Final');
const puntosDelFichero = new Map(votantes.map((nombre, i) => [nombre, aNumero(filaPuntos[3 + i])]));

console.log(`Categorías: ${categorias.length} · votantes: ${votantes.length} · listas de nominados: ${nominados.size}`);

// ─── Cruce con las categorías que ya viven en la app ──────────────────────────────────────────────────────

const sdkPath = value('sdk') || process.env.ADMIN_SDK_PATH || '';
const require = sdkPath
  ? createRequire(pathToFileURL(path.join(path.resolve(sdkPath), 'anchor.js')))
  : createRequire(import.meta.url);

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const key = value('key') || process.env.GOOGLE_APPLICATION_CREDENTIALS || '';
if (!key) {
  console.error('Falta la clave de servicio: --key <ruta>.');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(readFileSync(path.resolve(key), 'utf8'))) });
const db = getFirestore();

const guardadas = (await db.collection('premiosCategories').get()).docs.map((d) => ({ id: d.id, ...d.data() }));

/**
 * Clave dura para comparar títulos: sin acentos, sin mayúsculas y SIN NADA que no sea letra o número. Así
 * «Best VR / AR» y «Best VR/AR», o «Best Sim / Strategy» y «Best Sim/Strategy», son el mismo título — que es lo
 * que son.
 */
const clave = (s) => norm(s).replace(/[^a-z0-9]/g, '');

/**
 * Lo que la normalización no puede resolver: nombres DISTINTOS para la misma categoría, y un typo del fichero.
 * Van explícitos a propósito. Un emparejamiento aproximado —por parecido de cadenas— acertaría estos cinco y
 * algún día casaría dos categorías que no son la misma, y el resultado sería un archivo con los ganadores
 * cambiados de sitio sin que nada avisara.
 */
const ALIAS = {
  bestperfomance: 'bestperformance', // typo del fichero
  bestaction: 'bestactiongame',
  bestroleplaying: 'bestrpg',
  bestfighting: 'bestfightinggame',
  bestsportracing: 'bestsportsracing',
  bestesportgame: 'bestesportsgame',
};

/** Se cruza por el título en INGLÉS, que es como vienen los ficheros; si no casa, por el español. */
function buscarCategoria(titulo) {
  const k = clave(titulo);
  const objetivo = ALIAS[k] || k;
  return (
    guardadas.find((c) => clave(c.title?.en) === objetivo) ||
    guardadas.find((c) => clave(c.title?.es) === objetivo) ||
    null
  );
}

/**
 * EL PESO QUE TUVO CADA CATEGORÍA EN 2025, que NO es el que tiene hoy.
 *
 * No se deduce de las categorías guardadas a propósito: hoy «Mejor juego móvil» y «Mejor juego de esports» valen
 * medio punto y en 2025 valían uno, mientras que «Mejor adaptación» valía medio y hoy también. Usar los pesos
 * actuales cambiaría la clasificación de una edición ya jugada.
 *
 * Los tres números salen de CONTRASTAR el recuento con los puntos oficiales del fichero: es la única combinación
 * que reproduce los catorce resultados al céntimo, y el script lo comprueba antes de escribir nada.
 */
function pesoDe2025(titulo) {
  const k = clave(titulo);
  if (k === clave('Game of the Year')) return 3;
  if (k === clave('Best Adaptation')) return 0.5;
  return 1;
}

const sinCasar = [];
const snapshot = [];
const winners = {};

for (const categoria of categorias) {
  const guardada = buscarCategoria(categoria.titulo);
  if (!guardada) {
    sinCasar.push(categoria.titulo);
    continue;
  }

  // Los nominados salen del fichero de datos; si faltara alguno votado, se añade: un voto a un juego que no
  // figura como nominado seguiría siendo un voto válido y tiene que poder resolverse.
  const lista = nominados.get(norm(categoria.titulo))?.juegos || [];
  const votados = [...new Set([...Object.values(categoria.votos), categoria.winner])];
  const juegos = [...new Set([...lista, ...votados])];

  const options = juegos.map((name, i) => ({ id: `${guardada.id}_option_${i}`, name }));
  const porNombre = new Map(options.map((o) => [norm(o.name), o.id]));
  const winnerId = porNombre.get(norm(categoria.winner)) || null;
  if (winnerId) winners[guardada.id] = winnerId;

  snapshot.push({
    id: guardada.id,
    title: guardada.title,
    winner: winnerId,
    weight: pesoDe2025(categoria.titulo),
    options,
    // Solo para el recuento de abajo; no se guarda.
    _votos: categoria.votos,
    _porNombre: porNombre,
  });
}

if (sinCasar.length > 0) {
  console.error(`Estas categorías del fichero no existen en la app:\n  - ${sinCasar.join('\n  - ')}`);
  process.exit(1);
}

// ─── Recuento propio, y comparación con el del fichero ────────────────────────────────────────────────────

const puntos = new Map(votantes.map((nombre) => [nombre, 0]));
for (const categoria of snapshot) {
  for (const [nombre, voto] of Object.entries(categoria._votos)) {
    if (categoria._porNombre.get(norm(voto)) === categoria.winner) {
      puntos.set(nombre, puntos.get(nombre) + categoria.weight);
    }
  }
}

const descuadres = votantes
  .map((nombre) => ({ nombre, calculado: puntos.get(nombre), fichero: puntosDelFichero.get(nombre) }))
  .filter((fila) => Math.abs(fila.calculado - fila.fichero) > 0.001);

console.log('\nRecuento (calculado vs. fichero):');
for (const nombre of votantes) {
  const c = puntos.get(nombre);
  const f = puntosDelFichero.get(nombre);
  console.log(`  ${nombre.padEnd(14)} ${String(c).padStart(5)} · ${String(f).padStart(5)} ${c === f ? '' : '  ← DESCUADRA'}`);
}

if (descuadres.length > 0) {
  // Diagnóstico: casi siempre el problema es un GANADOR que no aparece entre los nominados con el mismo texto
  // (un nombre escrito de dos maneras), así que esa categoría no puntúa para nadie.
  console.error('\nCategorías cuyo ganador no se ha podido resolver:');
  for (const c of snapshot) {
    if (!c.winner) console.error(`  - ${c.title?.es || c.id}`);
  }
  console.error('\nAciertos contados por categoría:');
  for (const c of snapshot) {
    const aciertos = Object.values(c._votos).filter((v) => c._porNombre.get(norm(v)) === c.winner).length;
    console.error(`  ${String(c.weight).padStart(3)} · ${aciertos} acierto(s) · ${c.title?.es || c.id}`);
  }

  console.error(`\n${descuadres.length} participante(s) no cuadran. El cruce de categorías o de pesos está mal; no se escribe nada.`);
  process.exit(1);
}
console.log('\nEl recuento propio coincide con el del fichero: el cruce de categorías y pesos es correcto.');

// ─── El archivo, y a quién pertenece cada fila ────────────────────────────────────────────────────────────

/**
 * Quién es quién: el nombre que usó cada participante en la hoja, y el perfil que tiene hoy en la app.
 *
 * Confirmado uno a uno con quien organizó la edición (20-09-2026). Los que no aparecen aquí votaron pero no
 * tienen perfil: su fila sale con su nombre y no enlaza a ninguna parte, que es exactamente lo que debe pasar.
 */
const PERFILES = {
  Bellanco: 'Bellanco',
  Kaspavicius: 'Kaspavicius',
  Fermp: 'Fermp',
  German: 'German Garcia',
  'Sergio Pavón': 'Sergio Pavon',
  Zorkil: 'Zorkil86',
  Marcos: 'Purewaa',
};

const perfiles = (await db.collection('profiles').get()).docs
  .map((d) => ({ uid: d.id, ...d.data() }))
  .filter((p) => p.uid !== '_placeholder');

const porNombreDePerfil = new Map(perfiles.map((p) => [norm(p.displayName), p]));

/** Clasificación con el puesto DENSO: los empatados comparten puesto y el siguiente es el inmediato. */
const ordenados = [...votantes]
  .map((nombre) => {
    const perfil = PERFILES[nombre] ? porNombreDePerfil.get(norm(PERFILES[nombre])) : null;
    return { nickname: nombre, points: puntos.get(nombre), uid: perfil?.uid || '', profileId: perfil?.profileId || '' };
  })
  .sort((a, b) => b.points - a.points);

let rank = 0;
let anteriores = null;
const leaderboard = ordenados.map((entry) => {
  if (entry.points !== anteriores) {
    rank += 1;
    anteriores = entry.points;
  }
  // El archivo es PÚBLICO: va el pseudónimo, nunca el uid (ver docs/plan-unificar-premios.md §4.1).
  return { rank, profileId: entry.profileId, nickname: entry.nickname, points: entry.points };
});

const archivo = {
  season: SEASON_YEAR,
  seasonId: SEASON_ID,
  name: SEASON_NAME,
  winners,
  categoriesSnapshot: snapshot.map(({ _votos, _porNombre, ...resto }) => resto),
  leaderboard,
  totalBallots: votantes.length,
};

console.log('\nClasificación:');
for (const fila of leaderboard) {
  const marca = fila.profileId ? '·perfil' : '';
  console.log(`  ${String(fila.rank).padStart(2)}. ${fila.nickname.padEnd(14)} ${String(fila.points).padStart(5)} ${marca}`);
}

if (!flag('apply')) {
  console.log('\nSimulación: no se ha escrito nada. Añade --apply para guardar la edición en el histórico.');
  process.exit(0);
}

await db.collection('premiosResults').doc(SEASON_ID).set({ ...archivo, closedAt: FieldValue.serverTimestamp() });
console.log(`\nArchivo escrito en premiosResults/${SEASON_ID}.`);

// La pantalla pública resuelve la última edición por este id, con una sola lectura.
await db.collection('premiosConfig').doc('voting').set(
  { lastPublishedId: SEASON_ID, season: SEASON_YEAR + 1, updatedAt: new Date().toISOString() },
  { merge: true },
);
console.log('La pantalla de resultados pasa a enseñar esta edición.');

// Y los trofeos de los cinco primeros PUESTOS, a quien tenga perfil donde ponérselos.
const awardedAt = Date.now();
let concedidos = 0;
for (const entry of ordenados) {
  const fila = leaderboard.find((f) => f.nickname === entry.nickname);
  if (!entry.uid || fila.rank > 5) continue;
  const ref = db.collection('profiles').doc(entry.uid);
  const previo = (await ref.get()).data()?.palmares || [];
  const sinEsta = Array.isArray(previo) ? previo.filter((e) => e?.seasonId !== SEASON_ID) : [];
  await ref.set(
    { palmares: [...sinEsta, { seasonId: SEASON_ID, seasonName: SEASON_NAME, rank: fila.rank, awardedAt }] },
    { merge: true },
  );
  concedidos += 1;
  console.log(`  trofeo ${fila.rank}.º → ${entry.nickname}`);
}
console.log(`${concedidos} trofeo(s) concedidos.`);
