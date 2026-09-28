/**
 * Lo que comparten los scripts que llevan al histórico ediciones jugadas en hoja de cálculo
 * (`import-premios-historico.mjs`, `premios-2025-votos.mjs`). Sale de `import-premios-2025.mjs`, que se deja
 * como está porque es el registro de lo que se escribió aquel día.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const args = process.argv.slice(2);
export const flag = (name) => args.includes(`--${name}`);
export const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] || '' : '';
};

/** Parser de CSV con comillas: los títulos llevan comas dentro («Erika Ishii, Ghost of Yōtei»). */
export function parseCsv(texto) {
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

export const leerCsv = (ruta) => parseCsv(readFileSync(ruta, 'utf8'));

/** Para comparar textos: sin acentos, sin mayúsculas y con los espacios colapsados. */
export const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Clave dura: además, SIN NADA que no sea letra o número. «Best VR / AR» y «Best VR/AR» son el mismo título, y
 * «Baldur’s Gate 3» con apóstrofo curvo el mismo juego que con el recto.
 */
export const clave = (s) => norm(s).replace(/[^a-z0-9]/g, '');

export const aNumero = (s) => Number(String(s || '0').replace(',', '.')) || 0;

/**
 * Lo que la normalización no puede resolver entre el título de la hoja y el de la app. Es la tabla de
 * `import-premios-2025.mjs` más los nombres que la categoría tuvo ANTES de 2025, que las hojas viejas traen tal
 * cual: explícitos por el mismo motivo que allí (un parecido de cadenas acabaría casando dos categorías
 * distintas).
 */
const ALIAS = {
  bestperfomance: 'bestperformance', // typo de la plantilla
  bestaction: 'bestactiongame',
  bestroleplaying: 'bestrpg',
  bestfighting: 'bestfightinggame',
  bestsportracing: 'bestsportsracing',
  bestesportgame: 'bestesportsgame',
  // Nombres antiguos → el de 2025, que es el que se cruza con la app.
  bestindie: 'bestindependentgame',
  bestdebutgame: 'bestdebutindiegame',
  bestdebutindie: 'bestdebutindiegame',
};

/** Busca la categoría de la app por el título de la hoja: primero en inglés, que es como vienen, y luego en español. */
export function buscadorDeCategorias(guardadas) {
  return (titulo) => {
    const k = clave(titulo);
    const objetivo = ALIAS[k] || k;
    return (
      guardadas.find((c) => clave(c.title?.en) === objetivo || ALIAS[clave(c.title?.en)] === objetivo) ||
      guardadas.find((c) => clave(c.title?.es) === objetivo) ||
      null
    );
  };
}

/**
 * Quién es quién: el nombre que usó cada participante en la hoja y el perfil que tiene hoy en la app. Confirmado
 * con quien organizó las ediciones (20-09-2026 para 2025; 28-09-2026 para las anteriores: «Diego es Bellanco y
 * Germán es Germán»). Los que no están votaron pero no tienen perfil.
 */
export const PERFILES = {
  Bellanco: 'Bellanco',
  Kaspavicius: 'Kaspavicius',
  Fermp: 'Fermp',
  German: 'German Garcia',
  'Sergio Pavón': 'Sergio Pavon',
  Zorkil: 'Zorkil86',
  Marcos: 'Purewaa',
};

/** Puesto DENSO: los empatados comparten puesto y el siguiente es el inmediato (como `assignDenseRanks`). */
export function puestosDensos(filas) {
  const ordenadas = [...filas].sort((a, b) => b.points - a.points);
  let rank = 0;
  let anteriores = null;
  return ordenadas.map((fila) => {
    if (fila.points !== anteriores) {
      rank += 1;
      anteriores = fila.points;
    }
    return { ...fila, rank };
  });
}

/** Firebase Admin, con el SDK de donde se diga (el proyecto no lo trae como dependencia). */
export function conectar() {
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
  return { db: getFirestore(), FieldValue };
}

/** Uid y pseudónimo de cada nombre de la hoja que tenga perfil. */
export async function resolverPerfiles(db, nombres) {
  const perfiles = (await db.collection('profiles').get()).docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .filter((p) => p.uid !== '_placeholder');
  const porNombre = new Map(perfiles.map((p) => [norm(p.displayName), p]));
  const resultado = new Map();
  for (const nombre of nombres) {
    const perfil = PERFILES[nombre] ? porNombre.get(norm(PERFILES[nombre])) : null;
    if (PERFILES[nombre] && !perfil) console.warn(`  ⚠ «${nombre}» debería ser «${PERFILES[nombre]}», y no hay perfil con ese nombre.`);
    resultado.set(nombre, { uid: perfil?.uid || '', profileId: perfil?.profileId || '' });
  }
  return resultado;
}

/**
 * Concede el trofeo de una edición, cada uno en su perfil, y deja el REGISTRO privado de a quién se le dio: sin
 * él, el interruptor del histórico no podría devolverlo después de apagarlo (ver `premiosPalmaresRepository`).
 * Es idempotente como `grantPalmares`: sustituye la entrada de esa edición en vez de duplicarla.
 */
export async function concederPalmares(db, { seasonId, seasonName, season, recipients }) {
  const awardedAt = Date.now();
  let concedidos = 0;
  for (const { uid, rank, nombre } of recipients) {
    if (!uid) continue;
    const ref = db.collection('profiles').doc(uid);
    const previo = (await ref.get()).data()?.palmares || [];
    const sinEsta = Array.isArray(previo) ? previo.filter((e) => e?.seasonId !== seasonId) : [];
    await ref.set({ palmares: [...sinEsta, { seasonId, seasonName, season, rank, awardedAt }] }, { merge: true });
    concedidos += 1;
    console.log(`  trofeo ${rank === 0 ? 'de participación' : `${rank}.º`} → ${nombre}`);
  }
  await db
    .collection('premiosAdmin')
    .doc(`palmares-${seasonId}`)
    .set(
      {
        seasonId,
        granted: true,
        recipients: recipients.filter((r) => r.uid).map(({ uid, rank }) => ({ uid, rank })),
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  return concedidos;
}
