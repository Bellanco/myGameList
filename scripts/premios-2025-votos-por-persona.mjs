/**
 * Lleva a la app LO QUE VOTÓ CADA UNO en 2025, para la clasificación final de la pantalla de resultados
 * (`docs/plan-premios-votos-a-la-vista.md`). Aquella edición se jugó en hoja de cálculo y sus papeletas nunca
 * existieron en Firestore: solo el archivo, con la clasificación y el recuento.
 *
 * ES UN SCRIPT DE UN SOLO USO, como `premios-2025-votos.mjs`, y se queda por lo mismo: lo que escribió en
 * producción tiene que poder leerse después.
 *
 * DE DÓNDE SALE CADA COSA:
 *   · `2025 Game Awards - Resultado.csv` → el voto de cada participante, por NOMBRE de nominado.
 *   · El archivo publicado (`premiosResults/2025`) → los ids de categorías y nominados, los pesos, los ganadores y
 *     la clasificación. Los votos se cruzan contra él, no contra las categorías de hoy, que ya se han vaciado.
 *
 * LO QUE ESCRIBE (y es lo mismo que deja publicar una edición desde el panel):
 *   · `premiosReveal/2025` — una fila por participante: puesto, pseudónimo, nombre, puntos y elecciones.
 *   · `premiosAdmin/voters-2025` — los uid de quienes votaron CON CUENTA. Es el permiso para verlo: las reglas lo
 *     consultan y nadie más lo lee. Los que votaron sin cuenta salen en la lista, pero no pueden verla.
 *   · `premiosConfig/voting.votesSeasonId = '2025'` — solo ese campo: `updatedAt` hace de fecha de publicación y
 *     no se toca.
 * Se borra todo solo al abrir la siguiente edición, o a mano desde el histórico.
 *
 * NO ESCRIBE NADA QUE NO CUADRE: cada voto tiene que casar con un nominado del archivo y el recuento con los
 * puntos publicados de cada participante. Si algo falla, PARA. Y los uid tienen que ser los mismos del registro
 * de trofeos de 2025, que ya los cruzó el 20-09-2026.
 *
 * USO
 *   node scripts/premios-2025-votos-por-persona.mjs --offline [--csv <ruta>]
 *   node scripts/premios-2025-votos-por-persona.mjs --sdk <ruta node_modules> --key clave.json [--csv <ruta>] [--apply]
 *
 * `--offline` valida contra el archivo público sin credenciales. Sin `--apply` no escribe nada. Volver a lanzarlo
 * es idempotente: sustituye los mismos tres datos.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { buscadorDeCategorias, clave, conectar, flag, leerCsv, puestosDensos, resolverPerfiles, value } from './lib/premios-import.mjs';

const SEASON_ID = '2025';
const CSV_NAME = '2025 Game Awards - Resultado.csv';
const PROJECT = 'mylists-f7313';

const csvPath = [value('csv'), path.resolve(CSV_NAME), path.join(process.env.HOME || '', 'Downloads', CSV_NAME)].find(
  (ruta) => ruta && existsSync(ruta),
);
if (!csvPath) {
  console.error(`No encuentro «${CSV_NAME}». Pásalo con --csv <ruta>.`);
  process.exit(1);
}

// ─── El voto de cada participante, de la hoja ─────────────────────────────────────────────────────────────

const filas = leerCsv(csvPath);
const cabecera = filas.find((f) => (f[1] || '').trim() === 'Categoría');
const votantes = cabecera.slice(3).map((s) => s.trim()).filter(Boolean);

/** Categoría de la hoja → { nombre de participante → nominado votado }. Mismo corte que `import-premios-2025`. */
const votosPorCategoria = [];
for (const fila of filas) {
  const titulo = (fila[1] || '').trim();
  if (titulo === 'Resultado Final') break;
  if (!titulo || titulo === 'Categoría') continue;
  // «Mejor actuación» no contó aquella edición y no está en el archivo (ver `import-premios-2025.mjs`).
  if (titulo === 'Best Perfomance') continue;
  if (!(fila[2] || '').trim()) continue;
  const votos = {};
  votantes.forEach((nombre, i) => {
    const voto = (fila[3 + i] || '').trim();
    if (voto) votos[nombre] = voto;
  });
  votosPorCategoria.push({ titulo, votos });
}

// ─── El archivo publicado ─────────────────────────────────────────────────────────────────────────────────

/** El archivo, leído del documento público por REST: lo único que hace falta para validar sin credenciales. */
async function archivoPublico() {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/premiosResults/${SEASON_ID}`;
  const respuesta = await fetch(url);
  if (!respuesta.ok) throw new Error(`No se ha podido leer el archivo público (${respuesta.status}).`);
  const valor = (v) => {
    const [tipo, x] = Object.entries(v)[0];
    if (tipo === 'mapValue') return Object.fromEntries(Object.entries(x.fields || {}).map(([k, w]) => [k, valor(w)]));
    if (tipo === 'arrayValue') return (x.values || []).map(valor);
    if (tipo === 'integerValue') return Number(x);
    if (tipo === 'nullValue') return null;
    return x;
  };
  return Object.fromEntries(Object.entries((await respuesta.json()).fields).map(([k, v]) => [k, valor(v)]));
}

const offline = flag('offline');
const conexion = offline ? null : conectar();
const archivo = conexion
  ? (await conexion.db.collection('premiosResults').doc(SEASON_ID).get()).data()
  : await archivoPublico();
if (!archivo) {
  console.error(`No hay archivo de ${SEASON_ID}.`);
  process.exit(1);
}

// ─── El cruce, con todas las comprobaciones ───────────────────────────────────────────────────────────────

const categorias = archivo.categoriesSnapshot || [];
const buscar = buscadorDeCategorias(categorias);
const elecciones = new Map(votantes.map((nombre) => [nombre, {}]));
const fallos = [];

for (const { titulo, votos } of votosPorCategoria) {
  const categoria = buscar(titulo);
  if (!categoria) {
    fallos.push(`la categoría «${titulo}» no está en el archivo`);
    continue;
  }
  const porNombre = new Map((categoria.options || []).map((o) => [clave(o.name), o.id]));
  for (const [nombre, voto] of Object.entries(votos)) {
    const id = porNombre.get(clave(voto));
    if (!id) fallos.push(`«${nombre}» votó «${voto}» en «${titulo}», que no es nominado del archivo`);
    else elecciones.get(nombre)[categoria.id] = id;
  }
}

/** Puntos con las reglas de la app (`scoreBallot`): el peso de cada categoría acertada. */
const puntosDe = (seleccion) =>
  categorias.reduce((total, c) => (c.winner && seleccion[c.id] === c.winner ? total + (c.weight || 1) : total), 0);

// MISMO ORDEN Y MISMOS PUESTOS QUE LA PANTALLA: el archivo pasado por el puesto denso (ver `usePremiosResult`).
const clasificacion = puestosDensos(archivo.leaderboard || []);
const ballots = clasificacion.map((fila) => {
  const seleccion = elecciones.get(fila.nickname);
  if (!seleccion) {
    fallos.push(`«${fila.nickname}» está en la clasificación y no en la hoja`);
    return null;
  }
  const recuento = puntosDe(seleccion);
  if (recuento !== fila.points) fallos.push(`«${fila.nickname}»: el recuento da ${recuento} y el archivo dice ${fila.points}`);
  return { rank: fila.rank, profileId: fila.profileId || '', nickname: fila.nickname, points: fila.points, selections: seleccion };
});
for (const nombre of votantes) {
  if (!clasificacion.some((fila) => fila.nickname === nombre)) fallos.push(`«${nombre}» está en la hoja y no en la clasificación`);
}

console.log(`Hoja: ${votantes.length} participantes · ${votosPorCategoria.length} categorías · archivo: ${categorias.length} categorías`);
console.log(ballots.filter(Boolean).map((b) => `  ${b.rank}. ${b.nickname} — ${b.points} — ${Object.keys(b.selections).length} votos`).join('\n'));

if (fallos.length > 0) {
  console.error(`\nNO CUADRA (${fallos.length}):\n  · ${fallos.join('\n  · ')}`);
  process.exit(1);
}
console.log('\nCuadra: todos los votos casan y el recuento da los puntos publicados.');

if (offline) {
  console.log('Modo --offline: sin credenciales no se resuelven los uid ni se escribe nada.');
  process.exit(0);
}

// ─── Quién puede verlo: los uid de los que votaron con cuenta ─────────────────────────────────────────────

const { db } = conexion;
const perfiles = await resolverPerfiles(db, votantes);
const uids = [...perfiles.values()].map((p) => p.uid).filter(Boolean);

// Tienen que ser los mismos que recibieron su trofeo de 2025: ese cruce ya se hizo y se revisó (20-09-2026).
const registro = (await db.collection('premiosAdmin').doc(`palmares-${SEASON_ID}`).get()).data();
const deTrofeos = new Set((registro?.recipients || []).map((r) => r.uid).filter(Boolean));
const distintos = uids.length !== deTrofeos.size || uids.some((uid) => !deTrofeos.has(uid));
console.log(`Votantes con cuenta: ${uids.length} (registro de trofeos: ${deTrofeos.size})`);
if (distintos) {
  console.error('Los uid no coinciden con los del registro de trofeos de 2025: no se escribe nada.');
  process.exit(1);
}

if (!flag('apply')) {
  console.log('\nSimulación: no se ha escrito nada. Añade --apply para escribirlo.');
  process.exit(0);
}

await db.collection('premiosReveal').doc(SEASON_ID).set({ seasonId: SEASON_ID, ballots });
await db.collection('premiosAdmin').doc(`voters-${SEASON_ID}`).set({ seasonId: SEASON_ID, uids });
await db.collection('premiosConfig').doc('voting').update({ votesSeasonId: SEASON_ID });
console.log(`\nEscrito: premiosReveal/${SEASON_ID} (${ballots.length} filas), premiosAdmin/voters-${SEASON_ID} (${uids.length}) y votesSeasonId.`);
