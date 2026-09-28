/**
 * Importa al histórico las ediciones de 2020 a 2023, que se jugaron en hoja de cálculo entre dos personas
 * (Diego → «Bellanco», Germán → «German»), antes de que la porra viviera aquí.
 *
 * ES UN SCRIPT DE UN SOLO USO, y se queda en el repositorio por lo mismo que `import-premios-2025.mjs`: lo que
 * escribió en producción tiene que poder leerse después.
 *
 * LAS HOJAS NO TRAEN EL GANADOR OFICIAL (salvo 2023), solo quién acertó: una «X», un «1», «Victoria» o
 * «Derrota». El ganador de cada categoría sale del palmarés real de The Game Awards, escrito abajo a mano, y el
 * script comprueba que cuadra con TODAS las marcas de la hoja antes de escribir nada (decisión del 28-09-2026).
 * Si una marca dice «acertó» y el ganador dice otra cosa, PARA.
 *
 * LOS PUNTOS:
 *   · 2020 — la hoja no trae totales. Se cuentan por el ganador real y el nombre votado, una categoría, un
 *            punto. «Best E-Sport Game» NO contó aquel año y se queda fuera del archivo (ver `NO_CONTARON`):
 *            sale un empate 11–11, que es lo que dice la hoja.
 *   · 2021 — se recuentan y tienen que dar los de la hoja (12–11).
 *   · 2022 — se publican LOS DE LA HOJA (11–12), aunque el recuento por marcas no dé eso: es lo que se anunció
 *            (decisión del 28-09-2026). El script enseña la diferencia.
 *   · 2023 — se recuentan con las reglas de aquel año (el juego del año a 3, las «Doble» a 2, Adaptación a 0,5 y
 *            medio punto por la segunda opción cuando los dos eligieron lo mismo y fallaron) y tienen que dar,
 *            categoría a categoría, los de la hoja (21,5–17).
 *
 * NO TOCA la edición que enseña la pantalla pública (`lastPublishedId`): son ediciones viejas y la última sigue
 * siendo la que es.
 *
 * USO
 *   node scripts/import-premios-historico.mjs --dir <carpeta de los CSV> --offline
 *   node scripts/import-premios-historico.mjs --dir <carpeta> --sdk <ruta node_modules> --key clave.json [--apply]
 *
 * `--offline` valida las hojas sin conectarse. Sin `--apply` no escribe nada.
 */

import path from 'node:path';
import {
  aNumero,
  buscadorDeCategorias,
  clave,
  concederPalmares,
  conectar,
  flag,
  leerCsv,
  puestosDensos,
  resolverPerfiles,
  value,
} from './lib/premios-import.mjs';

const DIR = path.resolve(value('dir') || '.');
const SOLO = value('solo'); // un año concreto, para repasar

/** Los dos participantes, con el nombre con el que salen en la clasificación (el mismo que en 2025). */
const D = 'Bellanco';
const G = 'German';

/**
 * EL PALMARÉS REAL DE THE GAME AWARDS, por el título tal y como lo escribe la hoja (pasado por `clave`).
 * Donde la hoja trae el nombre del juego se usa su misma grafía, para que el nominado y el voto casen solos.
 */
const GANADORES = {
  2020: {
    gameoftheyear: 'The Last of Us Part II',
    bestgamedirection: 'The Last of Us Part II',
    bestnarrative: 'The Last of Us Part II',
    bestartdirection: 'Ghost of Tsushima',
    bestscoreandmusic: 'Final Fantasy VII Remake',
    bestaudiodesign: 'The Last of Us Part II',
    bestperfomance: 'Laura Bailey',
    gamesforimpact: 'Tell Me Why',
    bestongoing: 'Fortnite',
    bestindie: 'Hades',
    bestmobilegame: 'Among Us',
    bestcommunitysupport: 'Fall Guys',
    bestvrar: 'Half-Life: Alyx',
    innovationinaccesibility: 'The Last of Us Part II',
    bestaction: 'Hades',
    bestactionadventure: 'The Last of Us Part II',
    bestroleplaying: 'Final Fantasy VII Remake',
    bestfighting: 'Mortal Kombat 11 Ultimate',
    bestfamily: 'Animal Crossing: New Horizons',
    bestsimstrategy: 'Microsoft Flight Simulator',
    bestsportracing: "Tony Hawk's Pro Skater 1+2",
    bestmultiplayer: 'Among Us',
    bestdebutgame: 'Phasmophobia',
    bestesportgame: 'Valorant',
  },
  2021: {
    gameoftheyear: 'It Takes Two',
    bestgamedirection: 'Deathloop',
    bestnarrative: "Marvel's Guardians of the Galaxy",
    bestartdirection: 'Deathloop',
    bestscoreandmusic: 'NieR Replicant ver.1.22474487139...',
    bestaudiodesign: 'Forza Horizon 5',
    bestperfomance: 'Maggie Robertson',
    gamesforimpact: 'Life is Strange: True Colors',
    bestongoing: 'Final Fantasy XIV Online',
    bestindie: 'Kena: Bridge of Spirits',
    bestmobilegame: 'Genshin Impact',
    bestcommunitysupport: 'Final Fantasy XIV Online',
    bestvrar: 'Resident Evil 4 VR',
    innovationinaccesibility: 'Forza Horizon 5',
    bestaction: 'Returnal',
    bestactionadventure: 'Metroid Dread',
    bestroleplaying: 'Tales of Arise',
    bestfighting: 'Guilty Gear -Strive-',
    bestfamily: 'It Takes Two',
    bestsimstrategy: 'Age of Empires IV',
    bestsportracing: 'Forza Horizon 5',
    bestmultiplayer: 'It Takes Two',
    bestdebutgame: 'Kena: Bridge of Spirits',
    bestesportgame: 'League of Legends',
    mostanticipatedgame: 'Elden Ring',
  },
  2022: {
    gameoftheyear: 'Elden Ring',
    bestgamedirection: 'Elden Ring',
    bestnarrative: 'God of War Ragnarök',
    bestartdirection: 'Elden Ring',
    bestscoreandmusic: 'God of War Ragnarök',
    bestaudiodesign: 'God of War Ragnarök',
    bestperfomance: 'Christopher Judge',
    gamesforimpact: 'As Dusk Falls',
    bestongoing: 'Final Fantasy XIV Online',
    bestindie: 'Stray',
    bestmobilegame: 'Marvel Snap',
    bestcommunitysupport: 'Final Fantasy XIV Online',
    innovationinaccesibility: 'God of War Ragnarök',
    bestvrar: 'Moss: Book II',
    bestaction: 'Bayonetta 3',
    bestactionadventure: 'God of War Ragnarök',
    bestroleplaying: 'Elden Ring',
    bestfighting: 'MultiVersus',
    bestfamily: 'Kirby and the Forgotten Land',
    bestsimstrategy: 'Mario + Rabbids Sparks of Hope',
    bestsportracing: 'Gran Turismo 7',
    bestmultiplayer: 'Splatoon 3',
    bestdebutindie: 'Stray',
    mostanticipatedgame: 'The Legend of Zelda: Tears of the Kingdom',
    bestesportgame: 'Valorant',
    bestadaptation: 'Arcane',
  },
  2023: {
    gameoftheyear: 'Baldur’s Gate 3',
    bestgamedirection: 'Alan Wake 2',
    bestnarrative: 'Alan Wake 2',
    bestartdirection: 'Alan Wake 2',
    bestscoreandmusic: 'Final Fantasy XVI, Composer Masayoshi Soken',
    bestaudiodesign: 'Hi-Fi Rush',
    bestperfomance: 'Neil Newbon, Baldur’s Gate 3',
    gamesforimpact: 'Tchia',
    bestongoing: 'Cyberpunk 2077',
    bestindie: 'Sea of Stars',
    bestmobilegame: 'Honkai: Star Rail',
    bestcommunitysupport: 'Baldur’s Gate 3',
    innovationinaccesibility: 'Forza Motorsport',
    bestvrar: 'Resident Evil Village VR Mode',
    bestaction: 'Armored Core VI: Fires Of Rubicon',
    bestactionadventure: 'The Legend of Zelda: Tears of the Kingdom',
    bestroleplaying: 'Baldur’s Gate 3',
    bestfighting: 'Street Fighter 6',
    bestfamily: 'Super Mario Bros. Wonder',
    bestsimstrategy: 'Pikmin 4',
    bestsportracing: 'Forza Motorsport',
    bestmultiplayer: 'Baldur’s Gate 3',
    bestdebutindie: 'Cocoon',
    mostanticipatedgame: 'Final Fantasy VII Rebirth',
    bestesportgame: 'Valorant',
    bestadaptation: 'The Last of Us',
  },
};

/**
 * LO QUE SE ESCRIBIÓ A MANO EN LA HOJA y es el mismo nominado con otra grafía: typos, nombres cortos, la
 * interpretación sin el juego. Por año, porque «Final Fantasy» a secas es el XIV en 2021 y podría no serlo otro
 * año. La clave es la del texto de la hoja (`clave`); el valor, el nombre con el que se archiva.
 */
const GRAFIAS = {
  2020: {
    thelastofus2: 'The Last of Us Part II',
    thelasofus2: 'The Last of Us Part II',
    kentuckyroutezero: 'Kentucky Route Zero',
    nomanssky: "No Man's Sky",
    amonus: 'Among Us',
    fallsguys: 'Fall Guys',
    marvelsspidermanmilesmorales: "Marvel's Spider-Man: Miles Morales",
    streetfighter5: 'Street Fighter V',
    tonyhawks: "Tony Hawk's Pro Skater 1+2",
    animalcrossing: 'Animal Crossing: New Horizons',
    microsoftflightsimulator2020: 'Microsoft Flight Simulator',
    xcom: 'XCOM: Chimera Squad',
    fornite: 'Fortnite',
    watchdogslegion: 'Watch Dogs: Legion',
  },
  2021: {
    itstaketwo: 'It Takes Two',
    psychonaut2: 'Psychonauts 2',
    giancarloesposito: 'Giancarlo Esposito',
    giancarlofc6: 'Giancarlo Esposito',
    finalfantasy: 'Final Fantasy XIV Online',
    residentevil: 'Resident Evil 4 VR',
    residentevil4: 'Resident Evil 4 VR',
    forzahorizont: 'Forza Horizon 5',
    forzahorizon: 'Forza Horizon 5',
    inscryption: 'Inscryption',
    monsterhunter: 'Monster Hunter Rise',
    demonslayer: 'Demon Slayer: The Hinokami Chronicles',
    kena: 'Kena: Bridge of Spirits',
    elderring: 'Elden Ring',
    nomanssky: "No Man's Sky",
    nolongerhome: 'No Longer Home',
  },
  2022: {
    finalfantasyxiv: 'Final Fantasy XIV Online',
    fornite: 'Fortnite',
    manongageimmortality: 'Manon Gage',
    ashlyburchaloyenhorizonforbiddenwest: 'Ashly Burch',
  },
  2023: {
    fornite: 'Fortnite',
  },
};

/**
 * CATEGORÍAS QUE ESTÁN EN LA HOJA Y NO CONTARON, confirmado por quien las organizó (28-09-2026). Se quedan fuera
 * del archivo, igual que «Best Perfomance» en `import-premios-2025.mjs`: ni puntúan ni salen como ganador.
 * Lo que la hoja deja en blanco NO es esto por sí solo: Accesibilidad y Lucha de 2020 también están en blanco y
 * se archivan, porque no las acertó nadie y su ganador es un dato de la edición.
 */
const NO_CONTARON = {
  2020: ['bestesportgame'],
};

/** Una marca de «acertó» en la hoja: «X», «x» o «1». Un espacio suelto no cuenta. */
const marca = (s) => ['x', '1'].includes(String(s || '').trim().toLowerCase());

/** Filas de categoría: desde la cabecera hasta el total, y lo que haya debajo con título (la Adaptación de 2022). */
function filasDeCategoria(filas, col, finales) {
  const cabecera = filas.findIndex((f) => (f[col] || '').trim() === 'Categoría');
  return filas
    .slice(cabecera + 1)
    .filter((f) => {
      const t = (f[col] || '').trim();
      return t && !finales.includes(t) && !finales.includes((f[1] || '').trim());
    });
}

/** Cada año, a la forma común: título, voto de cada uno y lo que dice la hoja de ellos. */
const LECTORES = {
  2020: (filas) => ({
    categorias: filasDeCategoria(filas, 2, ['Total']).map((f) => ({
      titulo: f[2].trim(),
      votos: { [D]: f[3].trim(), [G]: f[4].trim() },
      // +1 acertó Diego y no Germán, −1 al revés, 0 los dos o ninguno. En blanco: sin marcar.
      duelo: f[5].trim() === '' ? null : Number(f[5]),
    })),
    totales: null,
  }),
  2021: (filas) => leerDeMarcas(filas),
  2022: (filas) => leerDeMarcas(filas),
  2023: (filas) => {
    const fin = filas.find((f) => (f[1] || '').trim() === 'Resultado Final');
    return {
      categorias: filasDeCategoria(filas, 1, ['Resultado Final']).map((f) => ({
        titulo: f[1].trim(),
        votos: { [D]: f[2].trim(), [G]: f[4].trim() },
        segunda: { [D]: (f[11] || '').trim(), [G]: (f[13] || '').trim() },
        doble: aNumero(f[6]) || 1,
        puntosHoja: { [D]: aNumero(f[7]), [G]: aNumero(f[8]) },
      })),
      totales: { [D]: aNumero(fin[7]), [G]: aNumero(fin[8]) },
    };
  },
};

function leerDeMarcas(filas) {
  const fin = filas.find((f) => (f[1] || '').trim() === 'Resultado Final');
  return {
    categorias: filasDeCategoria(filas, 1, ['Resultado Final']).map((f) => ({
      titulo: f[1].trim(),
      votos: { [D]: f[2].trim(), [G]: f[4].trim() },
      marcas: { [D]: marca(f[3]), [G]: marca(f[5]) },
      rotulo: (f[6] || '').trim(),
    })),
    totales: { [D]: aNumero(fin[3]), [G]: aNumero(fin[5]) },
  };
}

/** El peso de cada categoría. Solo 2023 dejó escrito uno distinto de 1 (ver la cabecera). */
function pesoDe(anio, categoria) {
  if (anio !== 2023) return 1;
  const k = clave(categoria.titulo);
  if (k === 'gameoftheyear') return 3;
  if (k === 'bestadaptation') return 0.5;
  return categoria.doble;
}

const avisos = [];
const ediciones = [];

for (const anio of [2020, 2021, 2022, 2023]) {
  if (SOLO && Number(SOLO) !== anio) continue;
  const filas = leerCsv(path.join(DIR, `Game Awards - ${anio}.csv`));
  const { categorias, totales } = LECTORES[anio](filas);
  const grafias = GRAFIAS[anio];
  /** El nombre con el que se archiva lo que escribió la hoja. */
  const canon = (texto) => grafias[clave(texto)] || texto;
  const acierta = (voto, ganador) => Boolean(voto) && clave(canon(voto)) === clave(ganador);

  console.log(`\n══════ ${anio} ══════`);
  const errores = [];
  const puntos = { [D]: 0, [G]: 0 };
  const cats = [];

  for (const categoria of categorias) {
    const k = clave(categoria.titulo);
    if ((NO_CONTARON[anio] || []).includes(k)) {
      avisos.push(`${anio} · ${categoria.titulo}: no contó aquel año; fuera del archivo.`);
      continue;
    }
    const ganador = GANADORES[anio][k];
    if (!ganador) {
      errores.push(`«${categoria.titulo}» no tiene ganador escrito en GANADORES[${anio}].`);
      continue;
    }
    const peso = pesoDe(anio, categoria);
    const aciertos = { [D]: acierta(categoria.votos[D], ganador), [G]: acierta(categoria.votos[G], ganador) };
    const suma = { [D]: aciertos[D] ? peso : 0, [G]: aciertos[G] ? peso : 0 };

    // 2023: medio punto por la segunda opción, cuando los dos eligieron lo mismo y fallaron.
    if (categoria.segunda && !aciertos[D] && !aciertos[G] && clave(categoria.votos[D]) === clave(categoria.votos[G])) {
      for (const quien of [D, G]) {
        if (acierta(categoria.segunda[quien], ganador)) suma[quien] = peso / 2;
      }
    }

    // ── Contra lo que dice la hoja ──
    if (categoria.marcas) {
      for (const quien of [D, G]) {
        if (categoria.marcas[quien] !== aciertos[quien]) {
          errores.push(
            `${categoria.titulo}: la hoja dice que ${quien} ${categoria.marcas[quien] ? 'acertó' : 'falló'} con «${categoria.votos[quien]}», y el ganador es «${ganador}».`,
          );
        }
      }
      const esperado =
        aciertos[D] && aciertos[G] ? 'Victoria' : aciertos[D] ? 'Diego' : aciertos[G] ? 'Germán' : 'Derrota';
      if (categoria.rotulo && categoria.rotulo !== esperado) {
        avisos.push(`${anio} · ${categoria.titulo}: la columna «Ganador» dice «${categoria.rotulo}», y por las marcas es «${esperado}».`);
      }
    }
    if (categoria.duelo !== undefined) {
      const duelo = Math.sign(suma[D] - suma[G]);
      if (categoria.duelo === null) {
        avisos.push(`${anio} · ${categoria.titulo}: en blanco en la hoja; por el ganador («${ganador}») cuenta ${duelo > 0 ? `para ${D}` : duelo < 0 ? `para ${G}` : 'para nadie'}.`);
      } else if (categoria.duelo !== duelo) {
        errores.push(`${categoria.titulo}: la hoja da ${categoria.duelo} y por el ganador «${ganador}» sale ${duelo}.`);
      }
    }
    if (categoria.puntosHoja) {
      for (const quien of [D, G]) {
        if (Math.abs(categoria.puntosHoja[quien] - suma[quien]) > 0.001) {
          errores.push(`${categoria.titulo}: la hoja da ${categoria.puntosHoja[quien]} a ${quien} y el recuento, ${suma[quien]}.`);
        }
      }
    }

    puntos[D] += suma[D];
    puntos[G] += suma[G];
    const marcaDe = (quien) => (suma[quien] ? `+${suma[quien]}` : '  ·');
    console.log(
      `  ${categoria.titulo.padEnd(28)} ${ganador.slice(0, 34).padEnd(34)} ${marcaDe(D).padStart(4)} ${marcaDe(G).padStart(4)}`,
    );
    cats.push({ categoria, ganador, peso, canon });
  }

  if (errores.length > 0) {
    console.error(`\n✖ ${anio}: ${errores.length} cosa(s) no cuadran; no se sigue.\n  - ${errores.join('\n  - ')}`);
    process.exit(1);
  }

  // Los puntos que se publican.
  let publicados = { ...puntos };
  if (anio === 2022) {
    publicados = { ...totales };
    avisos.push(`2022: se publican los totales de la hoja (${D} ${totales[D]}, ${G} ${totales[G]}); el recuento por marcas da ${puntos[D]} y ${puntos[G]}.`);
  } else if (totales) {
    for (const quien of [D, G]) {
      if (Math.abs(totales[quien] - puntos[quien]) > 0.001) {
        console.error(`\n✖ ${anio}: el recuento de ${quien} da ${puntos[quien]} y la hoja ${totales[quien]}; no se sigue.`);
        process.exit(1);
      }
    }
  }
  console.log(`  ${'Total'.padEnd(63)} ${String(publicados[D]).padStart(4)} ${String(publicados[G]).padStart(4)}`);
  ediciones.push({ anio, cats, puntos: publicados });
}

if (avisos.length > 0) console.log(`\nPara revisar:\n  · ${avisos.join('\n  · ')}`);
console.log('\nLas hojas cuadran con los ganadores.');

if (flag('offline')) {
  console.log('Modo --offline: no se ha consultado ni escrito nada.');
  process.exit(0);
}

// ─── Cruce con la app y archivo ───────────────────────────────────────────────────────────────────────────

const { db, FieldValue } = conectar();
const guardadas = (await db.collection('premiosCategories').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const buscar = buscadorDeCategorias(guardadas);
const perfiles = await resolverPerfiles(db, [D, G]);

for (const { anio, cats, puntos } of ediciones) {
  const seasonId = String(anio);
  const seasonName = `Game Awards ${anio}`;
  const winners = {};
  const votes = {};
  const snapshot = [];

  for (const { categoria, ganador, peso, canon } of cats) {
    const guardada = buscar(categoria.titulo);
    if (!guardada) {
      console.error(`✖ ${anio}: «${categoria.titulo}» no existe en la app; no se sigue.`);
      process.exit(1);
    }
    // El ganador primero y después lo votado: así un empate del voto popular se lee siempre igual.
    const nombres = [ganador, ...Object.values(categoria.votos).filter(Boolean).map(canon)];
    const unicos = [];
    for (const nombre of nombres) if (!unicos.some((u) => clave(u) === clave(nombre))) unicos.push(nombre);
    const options = unicos.map((name, i) => ({ id: `${guardada.id}_option_${i}`, name }));
    const idDe = (texto) => options.find((o) => clave(o.name) === clave(canon(texto)))?.id || null;

    winners[guardada.id] = options[0].id;
    const cuenta = {};
    for (const voto of Object.values(categoria.votos)) {
      const id = voto ? idDe(voto) : null;
      if (id) cuenta[id] = (cuenta[id] || 0) + 1;
    }
    if (Object.keys(cuenta).length > 0) votes[guardada.id] = cuenta;
    snapshot.push({ id: guardada.id, title: guardada.title, winner: options[0].id, weight: peso, options });
  }

  const leaderboard = puestosDensos(
    [D, G].map((nombre) => ({ nickname: nombre, points: puntos[nombre], ...perfiles.get(nombre) })),
  );
  const archivo = {
    season: anio,
    seasonId,
    name: seasonName,
    winners,
    categoriesSnapshot: snapshot,
    // El archivo es PÚBLICO: va el pseudónimo, nunca el uid.
    leaderboard: leaderboard.map(({ rank, profileId, nickname, points }) => ({ rank, profileId, nickname, points })),
    totalBallots: 2,
    votes,
  };

  console.log(`\n${seasonName}: ${snapshot.length} categorías · ${leaderboard.map((f) => `${f.rank}.º ${f.nickname} ${f.points}${f.profileId ? ' ·perfil' : ''}`).join(' · ')}`);
  const previo = await db.collection('premiosResults').doc(seasonId).get();
  if (previo.exists) console.warn(`  ⚠ premiosResults/${seasonId} ya existe: se sustituye.`);

  if (!flag('apply')) continue;
  await db.collection('premiosResults').doc(seasonId).set({ ...archivo, closedAt: FieldValue.serverTimestamp() });
  console.log(`  Archivo escrito en premiosResults/${seasonId}.`);
  const concedidos = await concederPalmares(db, {
    seasonId,
    seasonName,
    season: anio,
    recipients: leaderboard.map((f) => ({ uid: f.uid, rank: f.rank, nombre: f.nickname })),
  });
  console.log(`  ${concedidos} trofeo(s) concedidos.`);
}

if (!flag('apply')) console.log('\nSimulación: no se ha escrito nada. Añade --apply para guardar las ediciones.');
