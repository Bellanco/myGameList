import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getGamesAsTabData,
  getLocalMeta,
  invalidateGamesMirrorIndex,
  mirrorTabDataToGames,
  putGameRecord,
  replaceGamesStoreFromTabData,
} from '../../src/model/repository/indexedDbRepository';
import { DELETED_STORE, GAMES_STORE, META_STORE, openSharedDatabase } from '../../src/model/repository/idbConnectionRepository';
import type { GameItem, TabData } from '../../src/model/types/game';

/**
 * ESPEJO INCREMENTAL del store `games`.
 *
 * El espejo corre en cada guardado del usuario y antes reemplazaba el store completo: editar un juego costaba un
 * `put` por CADA juego de la biblioteca. Estos tests fijan las dos mitades del arreglo, y la segunda importa más
 * que la primera:
 *   1) que solo se escriba lo que cambia (la ganancia), y
 *   2) que el store acabe EXACTAMENTE igual que con un reemplazo completo (la corrección), incluido lo que pasa
 *      cuando otro escritor toca el store por su cuenta y el índice en memoria ya no es de fiar.
 * Escribir de menos aquí dejaría `games` divergiendo de `appState` en silencio, y con `gamesUpdatedAt` diciendo
 * que está al día: es la forma que tendría este cambio de perder datos.
 */

function makeGame(id: number, ts = 1000): GameItem {
  return { id, _ts: ts, name: `Juego ${id}`, platforms: ['PC'], genres: ['Acción'], steamDeck: false, review: '' };
}

function tabData(partial: Partial<TabData>): TabData {
  return { c: [], v: [], e: [], p: [], deleted: [], updatedAt: 1, ...partial };
}

async function clearStores(): Promise<void> {
  const db = await openSharedDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([GAMES_STORE, DELETED_STORE, META_STORE], 'readwrite');
    tx.objectStore(GAMES_STORE).clear();
    tx.objectStore(DELETED_STORE).clear();
    tx.objectStore(META_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  // Vaciar los stores por fuera es, para el espejo, otro escritor: si no se le avisa, su índice afirmaría que
  // dentro sigue habiendo lo de antes.
  invalidateGamesMirrorIndex();
}

describe('espejo incremental del store `games`', () => {
  beforeEach(async () => { await clearStores(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('el primer espejo de la sesión reemplaza; el segundo solo escribe lo que ha cambiado', async () => {
    const biblioteca = Array.from({ length: 50 }, (_, i) => makeGame(i + 1));

    // Primera pasada: no se sabe qué hay en el store → reemplazo completo.
    const primera = spyOps();
    await mirrorTabDataToGames(tabData({ c: biblioteca }), 4242);
    expect(primera.clears).toBeGreaterThan(0);
    expect(primera.puts).toBe(50);
    primera.restore();

    // Segunda pasada con UN juego editado (su `_ts` avanza, que es lo que marca el cambio).
    const editada = biblioteca.map((g) => (g.id === 7 ? { ...g, name: 'Editado', _ts: 2000 } : g));
    const segunda = spyOps();
    await mirrorTabDataToGames(tabData({ c: editada }), 4243);
    expect(segunda.puts).toBe(1); // ← antes eran 50
    expect(segunda.clears).toBe(0);
    expect(segunda.deletes).toBe(0);
    segunda.restore();

    const out = await getGamesAsTabData();
    expect(out.c).toHaveLength(50);
    expect(out.c.find((g) => g.id === 7)?.name).toBe('Editado');
    expect((await getLocalMeta())?.gamesUpdatedAt).toBe(4243);
  });

  it('un guardado que no cambia nada no escribe en los stores', async () => {
    const biblioteca = [makeGame(1), makeGame(2)];
    await mirrorTabDataToGames(tabData({ c: biblioteca }), 10);

    const ops = spyOps();
    await mirrorTabDataToGames(tabData({ c: biblioteca }), 11);
    expect(ops.puts).toBe(0);
    expect(ops.deletes).toBe(0);
    ops.restore();

    // Pero el sello de frescura SÍ se actualiza (es lo que dice "este store refleja este appState").
    expect((await getLocalMeta())?.gamesUpdatedAt).toBe(11);
  });

  // La equivalencia es el corazón del cambio: el resultado incremental tiene que ser indistinguible del
  // reemplazo completo, pase lo que pase entre pasadas.
  it('el resultado incremental es idéntico al del reemplazo completo (añadir, editar, mover, borrar)', async () => {
    await mirrorTabDataToGames(tabData({ c: [makeGame(1), makeGame(2), makeGame(3)], v: [makeGame(4)] }), 1);

    const siguiente = tabData({
      c: [makeGame(1), { ...makeGame(3), name: 'Renombrado', _ts: 9000 }], // 2 borrado, 3 editado
      v: [],
      e: [{ ...makeGame(4), _ts: 9001 }], // 4 se mueve de 'v' a 'e'
      p: [makeGame(5)], // 5 es nuevo
      deleted: [{ id: 2, _ts: 9002, deletedAt: 9002 }],
      updatedAt: 2,
    });
    await mirrorTabDataToGames(siguiente, 2);
    const incremental = await getGamesAsTabData();

    // Mismo destino, pero por la vía del reemplazo completo.
    await replaceGamesStoreFromTabData(siguiente);
    const completo = await getGamesAsTabData();

    const canonico = (d: TabData) => ({
      c: d.c.map((g) => `${g.id}:${g.name}:${g._ts}`).sort(),
      v: d.v.map((g) => g.id).sort(),
      e: d.e.map((g) => `${g.id}:${g._ts}`).sort(),
      p: d.p.map((g) => g.id).sort(),
      deleted: d.deleted.map((t) => `${t.id}:${t._ts}`).sort(),
    });
    expect(canonico(incremental)).toEqual(canonico(completo));
    expect(canonico(incremental)).toEqual({
      c: ['1:Juego 1:1000', '3:Renombrado:9000'], v: [], e: ['4:9001'], p: [5], deleted: ['2:9002'],
    });
  });

  // EL CASO QUE PUEDE PERDER DATOS: otro escritor (el runner de migración del arranque, que corre en idle y
  // puede solaparse con un guardado) mete mano en el store. El índice en memoria deja de reflejar la realidad, y
  // si el espejo se lo creyera, se saltaría escrituras y `games` divergiría de `appState` sin que nada lo note.
  it('si otro escritor toca el store, el siguiente espejo reemplaza en vez de fiarse del índice', async () => {
    await mirrorTabDataToGames(tabData({ c: [makeGame(1), makeGame(2)] }), 1);

    // Escritor ajeno: añade un registro que el espejo no conoce y que YA NO debería estar tras el próximo espejo.
    await putGameRecord(makeGame(99), 'p');
    expect((await getGamesAsTabData()).p.map((g) => g.id)).toEqual([99]);

    // Mismo contenido que la última vez: si el espejo confiara en su índice, no escribiría nada y el 99 se
    // quedaría dentro para siempre.
    const ops = spyOps();
    await mirrorTabDataToGames(tabData({ c: [makeGame(1), makeGame(2)] }), 2);
    expect(ops.clears).toBeGreaterThan(0); // ha reemplazado, no confiado
    ops.restore();

    const out = await getGamesAsTabData();
    expect(out.p).toEqual([]);
    expect(out.c.map((g) => g.id).sort()).toEqual([1, 2]);
  });

  // Un espejo que falla no puede dejar el sello de frescura puesto (diría que `games` refleja un `appState` que
  // no refleja) ni el índice dado por bueno (la siguiente pasada se saltaría escrituras). Se fuerza un fallo
  // SÍNCRONO al encolar, que es el caso que se cuela por debajo de `tx.onerror`.
  it('un espejo fallido no deja sello de frescura ni índice en el que confiar', async () => {
    await mirrorTabDataToGames(tabData({ c: [makeGame(1)] }), 100);
    expect((await getLocalMeta())?.gamesUpdatedAt).toBe(100);

    const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new Error('fallo simulado de IndexedDB');
    });
    await expect(mirrorTabDataToGames(tabData({ c: [makeGame(1), makeGame(2, 5000)] }), 200)).rejects.toThrow();
    putSpy.mockRestore();

    // El sello se queda como estaba: nunca miente sobre la frescura del store.
    expect((await getLocalMeta())?.gamesUpdatedAt).toBe(100);

    // Y el índice quedó invalidado, así que la siguiente pasada reemplaza en vez de fiarse.
    const ops = spyOps();
    await mirrorTabDataToGames(tabData({ c: [makeGame(1), makeGame(2, 5000)] }), 300);
    expect(ops.clears).toBeGreaterThan(0);
    ops.restore();

    const out = await getGamesAsTabData();
    expect(out.c.map((g) => g.id).sort()).toEqual([1, 2]);
    expect((await getLocalMeta())?.gamesUpdatedAt).toBe(300);
  });
});

/** Espía las operaciones sobre `games`/`deleted` conservando el comportamiento real. */
function spyOps() {
  const target = (name: string) => name === GAMES_STORE || name === DELETED_STORE;
  const originalPut = IDBObjectStore.prototype.put;
  const originalDelete = IDBObjectStore.prototype.delete;
  const originalClear = IDBObjectStore.prototype.clear;
  const state = { puts: 0, deletes: 0, clears: 0 };

  IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: unknown[]) {
    if (target(this.name)) state.puts += 1;
    return (originalPut as (...a: unknown[]) => IDBRequest).apply(this, args);
  } as IDBObjectStore['put'];
  IDBObjectStore.prototype.delete = function (this: IDBObjectStore, ...args: unknown[]) {
    if (target(this.name)) state.deletes += 1;
    return (originalDelete as (...a: unknown[]) => IDBRequest).apply(this, args);
  } as IDBObjectStore['delete'];
  IDBObjectStore.prototype.clear = function (this: IDBObjectStore) {
    if (target(this.name)) state.clears += 1;
    return originalClear.call(this);
  } as IDBObjectStore['clear'];

  return {
    get puts() { return state.puts; },
    get deletes() { return state.deletes; },
    get clears() { return state.clears; },
    restore() {
      IDBObjectStore.prototype.put = originalPut;
      IDBObjectStore.prototype.delete = originalDelete;
      IDBObjectStore.prototype.clear = originalClear;
    },
  };
}
