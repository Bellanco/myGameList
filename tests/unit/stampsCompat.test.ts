// CONVIVENCIA entre versiones alrededor de los sellos automáticos (`enteredAt`, `gradedAt`).
//
// El escenario real no es «una app» sino DOS a la vez: el móvil con la versión nueva y el portátil con la de
// antes, escribiendo en el mismo gist. Aquí se fija qué pasa en cada cruce, incluido lo que se pierde, para que
// una regresión futura no lo cambie en silencio.
//
// El cliente ANTIGUO se simula con lo único que lo define para este asunto: no conoce los campos, así que su
// normalizador los descarta y su serializador no los escribe.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { normalizeData } from '../../src/model/repository/localRepository';
import { leanTabData } from '../../src/model/repository/socialProjection';
import { assertValidGamesGist, inspectGamesGist } from '../../src/model/schemas/gamesGistSchema';
import { mergeCrdt } from '../../src/model/repository/syncRepository';
import { buildGamesMainFile } from '../../src/model/repository/socialProjection';
import { unwrapGamesFile } from '../../src/model/migration/legacyGamesFormat';
import {
  getGamesAsTabData,
  invalidateGamesMirrorIndex,
  mirrorTabDataToGames,
} from '../../src/model/repository/indexedDbRepository';
import type { GameItem, TabData } from '../../src/model/types/game';

const STAMPS = { p: 1_700_000_000_000, e: 1_740_000_000_000, c: 1_780_000_000_000 };

function game(extra: Partial<GameItem> & { id: number }): GameItem {
  return {
    _ts: 1_780_000_000_000,
    name: `Game ${extra.id}`,
    platforms: ['Steam'],
    genres: ['RPG'],
    steamDeck: false,
    review: '',
    ...extra,
  };
}

function tabData(c: GameItem[]): TabData {
  return { c, v: [], e: [], p: [], deleted: [], updatedAt: 1_780_000_000_000 };
}

/** Un juego tal y como lo dejaría una versión anterior a los sellos: sin ellos, y sin saber que existen. */
function asLegacy(item: GameItem): GameItem {
  const copy = { ...item } as Partial<GameItem>;
  delete copy.enteredAt;
  delete copy.gradedAt;
  return copy as GameItem;
}

describe('un cliente NUEVO con datos de uno antiguo', () => {
  it('lee un gist sin sellos y arranca sin romperse', () => {
    const legacy = tabData([asLegacy(game({ id: 1, listedAt: STAMPS.c }))]);
    const loaded = normalizeData(legacy);
    expect(loaded.c).toHaveLength(1);
    expect(loaded.c[0].name).toBe('Game 1');
  });

  it('siembra el sello de la lista actual desde `listedAt`, que es la misma fecha', () => {
    const loaded = normalizeData(tabData([asLegacy(game({ id: 1, listedAt: STAMPS.c }))]));
    expect(loaded.c[0].enteredAt).toEqual({ c: STAMPS.c });
  });

  it('no inventa el paso por listas anteriores', () => {
    const loaded = normalizeData(tabData([asLegacy(game({ id: 1, listedAt: STAMPS.c }))]));
    expect(loaded.c[0].enteredAt?.p).toBeUndefined();
    expect(loaded.c[0].enteredAt?.e).toBeUndefined();
  });

  it('tampoco inventa la fecha de la nota: sin dato, hueco', () => {
    const loaded = normalizeData(tabData([asLegacy(game({ id: 1, grade: 80, score: 4 }))]));
    expect(loaded.c[0].gradedAt).toBeUndefined();
  });
});

describe('un cliente ANTIGUO con datos de uno nuevo', () => {
  const modern = tabData([game({ id: 1, listedAt: STAMPS.c, enteredAt: STAMPS, gradedAt: STAMPS.c })]);

  it('el gist que escribe el nuevo pasa el ESQUEMA, que tolera campos que no conoce', () => {
    // El esquema del gist de juegos no es `strictObject` justo por esto: un campo aditivo no puede dejar a nadie
    // sin sincronizar. El del cliente antiguo se comporta igual con los campos que no conoce.
    const written = leanTabData(modern);
    expect(() => assertValidGamesGist(written)).not.toThrow();
    expect(inspectGamesGist(written).valid).toBe(true);
  });

  it('el merge NO borra los sellos al copiar un juego que no ha tocado', () => {
    // `asValidData` clona el juego entero (`{ ...g }`), así que lo que el cliente antiguo no entiende viaja
    // igualmente mientras no reescriba ese juego.
    const remote = leanTabData(modern);
    const local: TabData = { c: [], v: [], e: [], p: [], deleted: [], updatedAt: 0 };
    const { merged } = mergeCrdt(local, 0, remote, remote.updatedAt);
    expect(merged.c[0].enteredAt).toEqual(STAMPS);
    expect(merged.c[0].gradedAt).toBe(STAMPS.c);
  });

  it('el formato v4 los transporta y los devuelve intactos', () => {
    const anchor = buildGamesMainFile(leanTabData(modern));
    const back = unwrapGamesFile(JSON.parse(JSON.stringify(anchor))) as TabData;
    expect(back.c[0].enteredAt).toEqual(STAMPS);
    expect(back.c[0].gradedAt).toBe(STAMPS.c);
  });

  it('si el antiguo REESCRIBE el juego, los pierde — y el nuevo los recompone en la carga siguiente', () => {
    // Este es el límite conocido: el merge es LWW del objeto entero, así que la copia del cliente antiguo gana
    // por `_ts` y llega sin sellos. Lo que se recupera es el de la lista actual (misma fecha que `listedAt`); el
    // paso por listas anteriores se da por perdido en vez de fabricarlo.
    const edited = asLegacy(game({ id: 1, listedAt: STAMPS.c, _ts: STAMPS.c + 1000, name: 'Editado en el viejo' }));
    const { merged } = mergeCrdt(tabData([edited]), 0, leanTabData(modern), modern.updatedAt);
    expect(merged.c[0].enteredAt).toBeUndefined();

    const repaired = normalizeData(merged);
    expect(repaired.c[0].enteredAt).toEqual({ c: STAMPS.c });
  });
});

describe('ida y vuelta entre las dos versiones', () => {
  it('el historial completo sobrevive mientras solo escriba el cliente nuevo', () => {
    const modern = tabData([game({ id: 1, listedAt: STAMPS.c, enteredAt: STAMPS, gradedAt: STAMPS.c })]);
    // Escribir → leer → volver a escribir, tres veces: es lo que hace un ciclo de sincronización normal.
    let carried: TabData = modern;
    for (let round = 0; round < 3; round += 1) carried = normalizeData(leanTabData(carried));
    expect(carried.c[0].enteredAt).toEqual(STAMPS);
    expect(carried.c[0].gradedAt).toBe(STAMPS.c);
  });

  it('una biblioteca importada no estrena sellos falsos al pasar por el ciclo', () => {
    // Ocho juegos con el mismo milisegundo: el sello en bloque de una importación. Ni la primera carga ni las
    // siguientes deben convertirlo en «todas las partidas llegaron el mismo día».
    const bulk = 1_650_000_000_000;
    const imported = tabData(Array.from({ length: 8 }, (_unused, index) => asLegacy(game({ id: index + 1, _ts: bulk }))));
    const once = normalizeData(imported);
    const twice = normalizeData(leanTabData(once));
    expect(once.c.every((item) => !item.enteredAt?.c)).toBe(true);
    expect(twice.c.every((item) => !item.enteredAt?.c)).toBe(true);
  });
});

describe('el almacén local', () => {
  it('guarda y devuelve los sellos sin recortarlos', async () => {
    // El espejo de IndexedDB es el otro camino por el que pasan los datos, y va aparte del gist: si ahí se
    // filtraran campos, los sellos se perderían al recargar la app aunque el gist los conserve.
    invalidateGamesMirrorIndex();

    const stamped = tabData([game({ id: 991, listedAt: STAMPS.c, enteredAt: STAMPS, gradedAt: STAMPS.c })]);
    await mirrorTabDataToGames(stamped, stamped.updatedAt);
    const back = await getGamesAsTabData();
    const found = back.c.find((item) => item.id === 991);

    expect(found?.enteredAt).toEqual(STAMPS);
    expect(found?.gradedAt).toBe(STAMPS.c);
  });
});
