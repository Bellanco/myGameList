/**
 * Completa la edición de 2025 del histórico con lo que no existía cuando se importó (`import-premios-2025.mjs`):
 *
 *   · EL VOTO POPULAR: cuántas personas votaron cada nominado, sacado de la misma hoja. Se AÑADE al archivo que
 *     ya hay, sin rehacerlo: los ids de los nominados son los que se escribieron aquel día.
 *   · EL TROFEO DE PARTICIPACIÓN para quien votó y quedó fuera de los cinco primeros, y el año en el trofeo de
 *     los que sí entraron. Solo a quien tiene perfil (confirmado el 28-09-2026: de los catorce, los siete de
 *     `PERFILES`). Deja además el registro privado de premiados, que aquella importación no escribió.
 *
 * USO
 *   node scripts/premios-2025-votos.mjs --dir <carpeta del CSV> --sdk <ruta node_modules> --key clave.json [--apply]
 */

import path from 'node:path';
import {
  buscadorDeCategorias,
  clave,
  concederPalmares,
  conectar,
  flag,
  leerCsv,
  norm,
  resolverPerfiles,
  value,
} from './lib/premios-import.mjs';

const SEASON_ID = '2025';
const DIR = path.resolve(value('dir') || '.');
const resultado = leerCsv(path.join(DIR, '2025 Game Awards - Resultado.csv'));

const cabecera = resultado.find((f) => (f[1] || '').trim() === 'Categoría');
const votantes = cabecera.slice(3).map((s) => s.trim()).filter(Boolean);

// Mismo recorte que la importación: se para en «Resultado Final» y «Best Perfomance» no contó aquel año.
const categorias = [];
for (const fila of resultado) {
  const titulo = (fila[1] || '').trim();
  if (titulo === 'Resultado Final') break;
  if (!titulo || titulo === 'Categoría' || titulo === 'Best Perfomance') continue;
  const votos = votantes.map((_, i) => (fila[3 + i] || '').trim()).filter(Boolean);
  categorias.push({ titulo, votos });
}

const { db } = conectar();
const ref = db.collection('premiosResults').doc(SEASON_ID);
const archivo = (await ref.get()).data();
if (!archivo) {
  console.error(`No existe premiosResults/${SEASON_ID}.`);
  process.exit(1);
}

const guardadas = (await db.collection('premiosCategories').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const buscar = buscadorDeCategorias(guardadas);
const porId = new Map((archivo.categoriesSnapshot || []).map((c) => [c.id, c]));

const votes = {};
const sueltos = [];
for (const { titulo, votos } of categorias) {
  const archivada = porId.get(buscar(titulo)?.id);
  if (!archivada) {
    console.error(`«${titulo}» no está en el archivo de ${SEASON_ID}; no se sigue.`);
    process.exit(1);
  }
  const idDe = (texto) =>
    (archivada.options || []).find((o) => norm(o.name) === norm(texto))?.id ||
    (archivada.options || []).find((o) => clave(o.name) === clave(texto))?.id ||
    null;
  const cuenta = {};
  for (const voto of votos) {
    const id = idDe(voto);
    if (id) cuenta[id] = (cuenta[id] || 0) + 1;
    else sueltos.push(`${titulo}: «${voto}»`);
  }
  votes[archivada.id] = cuenta;
  const max = Math.max(...Object.values(cuenta));
  const primeros = (archivada.options || []).filter((o) => cuenta[o.id] === max).map((o) => o.name);
  console.log(`  ${titulo.padEnd(28)} ${primeros.join(' = ')} (${max} de ${votos.length})`);
}

if (sueltos.length > 0) {
  // Un voto que no casa con ningún nominado archivado quedaría fuera del recuento sin que nadie lo supiera.
  console.error(`\nVotos que no casan con ningún nominado:\n  - ${sueltos.join('\n  - ')}`);
  process.exit(1);
}

const perfiles = await resolverPerfiles(db, votantes);
const recipients = (archivo.leaderboard || [])
  .map((fila) => ({
    uid: perfiles.get(fila.nickname)?.uid || '',
    // Los cinco primeros PUESTOS, el suyo; el resto, el de participar (puesto 0).
    rank: fila.rank >= 1 && fila.rank <= 5 ? fila.rank : 0,
    nombre: fila.nickname,
  }))
  .filter((r) => r.uid);

console.log(`\nTrofeos: ${recipients.map((r) => `${r.nombre} ${r.rank === 0 ? 'participación' : `${r.rank}.º`}`).join(' · ')}`);

if (!flag('apply')) {
  console.log('\nSimulación: no se ha escrito nada. Añade --apply para guardar.');
  process.exit(0);
}

await ref.update({ votes });
console.log(`Voto popular añadido a premiosResults/${SEASON_ID}.`);
const concedidos = await concederPalmares(db, {
  seasonId: SEASON_ID,
  seasonName: archivo.name,
  season: 2025,
  recipients,
});
console.log(`${concedidos} trofeo(s) concedidos o actualizados.`);
