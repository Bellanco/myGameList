/**
 * Importa al histórico las ediciones de 2018 y 2019, de las que NO queda hoja: solo se sabe cómo quedaron
 * (confirmado por quien las organizó, 28-09-2026): en 2018 ganó Bellanco y German quedó segundo; en 2019, al
 * revés.
 *
 * ES UN SCRIPT DE UN SOLO USO, como `import-premios-historico.mjs`, y se queda por lo mismo.
 *
 * LO QUE SE ARCHIVA:
 *   · El ganador de cada categoría, del palmarés real de The Game Awards (decisión del 28-09-2026). Aquí no hay
 *     marcas con las que contrastarlo: la simulación lo enseña entero para repasarlo antes de escribir.
 *   · La clasificación SIN PUNTOS (`unscored: true`): el puesto es el guardado y la pantalla no enseña puntos.
 *   · Sin voto popular: no hay votos.
 *   · El trofeo de cada puesto en el perfil, con su registro privado, como en el resto de ediciones.
 *
 * «Best Strategy Game» de 2018 se cruza con la categoría de Simulación y estrategia de la app, que es en lo que
 * se convirtió en 2019.
 *
 * USO
 *   node scripts/import-premios-2018-2019.mjs --offline
 *   node scripts/import-premios-2018-2019.mjs --sdk <ruta node_modules> --key clave.json [--apply]
 */

import {
  buscadorDeCategorias,
  concederPalmares,
  conectar,
  flag,
  resolverPerfiles,
} from './lib/premios-import.mjs';

const EDICIONES = {
  2018: {
    puestos: { Bellanco: 1, German: 2 },
    ganadores: [
      ['Game of the Year', 'God of War'],
      ['Best Game Direction', 'God of War'],
      ['Best Narrative', 'Red Dead Redemption 2'],
      ['Best Art Direction', 'Return of the Obra Dinn'],
      ['Best Score and Music', 'Red Dead Redemption 2'],
      ['Best Audio Design', 'Red Dead Redemption 2'],
      ['Best Performance', 'Roger Clark'],
      ['Games for Impact', 'Celeste'],
      ['Best Ongoing', 'Fortnite'],
      ['Best Indie', 'Celeste'],
      ['Best Mobile Game', 'Florence'],
      ['Best Community Support', 'Rainbow Six Siege'],
      ['Best VR / AR', 'Astro Bot Rescue Mission'],
      ['Best Action', 'Dead Cells'],
      ['Best Action / Adventure', 'God of War'],
      ['Best Role Playing', 'Monster Hunter: World'],
      ['Best Fighting', 'Soulcalibur VI'],
      ['Best Family', 'Overcooked! 2'],
      ['Best Sim / Strategy', 'Into the Breach'],
      ['Best Sport  / Racing', 'Forza Horizon 4'],
      ['Best Multiplayer', 'Fortnite'],
      ['Best Debut Indie', 'The Messenger'],
      ['Most Anticipated Game', 'The Last of Us Part II'],
      ['Best E-Sport Game', 'Overwatch'],
    ],
  },
  2019: {
    puestos: { German: 1, Bellanco: 2 },
    ganadores: [
      ['Game of the Year', 'Sekiro: Shadows Die Twice'],
      ['Best Game Direction', 'Death Stranding'],
      ['Best Narrative', 'Disco Elysium'],
      ['Best Art Direction', 'Control'],
      ['Best Score and Music', 'Death Stranding'],
      ['Best Audio Design', 'Call of Duty: Modern Warfare'],
      ['Best Performance', 'Mads Mikkelsen'],
      ['Games for Impact', 'Gris'],
      ['Best Ongoing', 'Fortnite'],
      ['Best Indie', 'Disco Elysium'],
      ['Best Mobile Game', 'Call of Duty: Mobile'],
      ['Best Community Support', 'Destiny 2'],
      ['Best VR / AR', 'Beat Saber'],
      ['Best Action', 'Apex Legends'],
      ['Best Action / Adventure', 'Sekiro: Shadows Die Twice'],
      ['Best Role Playing', 'Disco Elysium'],
      ['Best Fighting', 'Mortal Kombat 11'],
      ['Best Family', "Luigi's Mansion 3"],
      ['Best Sim / Strategy', 'Fire Emblem: Three Houses'],
      ['Best Sport  / Racing', 'Crash Team Racing Nitro-Fueled'],
      ['Best Multiplayer', 'Apex Legends'],
      ['Best Debut Indie', 'Disco Elysium'],
      ['Most Anticipated Game', 'The Last of Us Part II'],
      ['Best E-Sport Game', 'League of Legends'],
    ],
  },
};

for (const [anio, { puestos, ganadores }] of Object.entries(EDICIONES)) {
  console.log(`\n══════ ${anio} ══════`);
  for (const [titulo, ganador] of ganadores) console.log(`  ${titulo.padEnd(28)} ${ganador}`);
  console.log(`  Clasificación: ${Object.entries(puestos).map(([n, r]) => `${r}.º ${n}`).join(' · ')} (sin puntos)`);
}

if (flag('offline')) {
  console.log('\nModo --offline: no se ha consultado ni escrito nada.');
  process.exit(0);
}

const { db, FieldValue } = conectar();
const guardadas = (await db.collection('premiosCategories').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const buscar = buscadorDeCategorias(guardadas);
const perfiles = await resolverPerfiles(db, ['Bellanco', 'German']);

for (const [anio, { puestos, ganadores }] of Object.entries(EDICIONES)) {
  const seasonId = String(anio);
  const seasonName = `Game Awards ${anio}`;
  const winners = {};
  const snapshot = [];
  for (const [titulo, ganador] of ganadores) {
    const guardada = buscar(titulo);
    if (!guardada) {
      console.error(`✖ ${anio}: «${titulo}» no existe en la app; no se sigue.`);
      process.exit(1);
    }
    const option = { id: `${guardada.id}_option_0`, name: ganador };
    winners[guardada.id] = option.id;
    snapshot.push({ id: guardada.id, title: guardada.title, winner: option.id, weight: 1, options: [option] });
  }

  const filas = Object.entries(puestos)
    .map(([nombre, rank]) => ({ nombre, rank, ...perfiles.get(nombre) }))
    .sort((a, b) => a.rank - b.rank);
  const archivo = {
    season: Number(anio),
    seasonId,
    name: seasonName,
    winners,
    categoriesSnapshot: snapshot,
    // PÚBLICO: el pseudónimo, nunca el uid. Los puntos a 0 no significan nada: manda `unscored`.
    leaderboard: filas.map((f) => ({ rank: f.rank, profileId: f.profileId, nickname: f.nombre, points: 0 })),
    totalBallots: filas.length,
    unscored: true,
  };

  console.log(`\n${seasonName}: ${snapshot.length} categorías · ${filas.map((f) => `${f.rank}.º ${f.nombre}${f.profileId ? ' ·perfil' : ''}`).join(' · ')}`);
  const previo = await db.collection('premiosResults').doc(seasonId).get();
  if (previo.exists) console.warn(`  ⚠ premiosResults/${seasonId} ya existe: se sustituye.`);

  if (!flag('apply')) continue;
  await db.collection('premiosResults').doc(seasonId).set({ ...archivo, closedAt: FieldValue.serverTimestamp() });
  console.log(`  Archivo escrito en premiosResults/${seasonId}.`);
  const concedidos = await concederPalmares(db, {
    seasonId,
    seasonName,
    season: Number(anio),
    recipients: filas.map((f) => ({ uid: f.uid, rank: f.rank, nombre: f.nombre })),
  });
  console.log(`  ${concedidos} trofeo(s) concedidos.`);
}

if (!flag('apply')) console.log('\nSimulación: no se ha escrito nada. Añade --apply para guardar las ediciones.');
