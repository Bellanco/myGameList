import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  BACKLOG_HISTORY_LIMIT,
  countLists,
  loadBacklogHistory,
  mergeSnapshot,
  monthKey,
  recordBacklogSnapshot,
  resetBacklogSnapshotCache,
} from '../../src/model/repository/statsSnapshotRepository';
import { META_STORE, openSharedDatabase } from '../../src/model/repository/idbConnectionRepository';
import type { GameItem, TabData } from '../../src/model/types/game';
import type { BacklogSnapshot } from '../../src/model/types/local';

// El histórico del backlog solo puede construirse hacia delante (`listedAt` se reescribe al mover de lista), así
// que lo que se protege aquí es que ningún punto se pierda ni se falsee: un punto por mes, el del mes en curso
// siempre al día, y nada escrito antes de que el estado local esté hidratado.

function game(id: number, name = `Juego ${id}`): GameItem {
  return { id, _ts: 0, name, platforms: [], genres: [], steamDeck: false, review: '' };
}

function tabData(overrides: Partial<TabData> = {}): TabData {
  return { c: [], v: [], e: [], p: [], deleted: [], updatedAt: 0, ...overrides };
}

function point(m: string, c: number, v = 0, e = 0, p = 0): BacklogSnapshot {
  return { m, c, v, e, p };
}

async function clearMeta(): Promise<void> {
  const db = await openSharedDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

beforeEach(async () => {
  resetBacklogSnapshotCache();
  await clearMeta();
});

describe('monthKey', () => {
  it('usa el calendario local, no UTC', () => {
    // 31 de enero a las 23:30 locales sigue siendo enero, aunque en UTC ya sea febrero.
    expect(monthKey(new Date(2026, 0, 31, 23, 30).getTime())).toBe('2026-01');
    expect(monthKey(new Date(2026, 11, 1, 0, 0).getTime())).toBe('2026-12');
  });
});

describe('countLists', () => {
  it('cuenta cada lista y descarta las filas sin nombre', () => {
    const counts = countLists(tabData({
      c: [game(1), game(2, '  ')],
      v: [game(3)],
      p: [game(4), game(5)],
    }));

    expect(counts).toEqual({ c: 1, v: 1, e: 0, p: 2 });
  });
});

describe('mergeSnapshot', () => {
  it('añade un punto cuando el mes es nuevo', () => {
    expect(mergeSnapshot([point('2026-01', 3)], point('2026-02', 4))).toEqual([
      point('2026-01', 3),
      point('2026-02', 4),
    ]);
  });

  it('reemplaza el punto del mes en curso en vez de duplicarlo', () => {
    const merged = mergeSnapshot([point('2026-01', 3), point('2026-02', 4)], point('2026-02', 6));

    expect(merged).toEqual([point('2026-01', 3), point('2026-02', 6)]);
  });

  it('no devuelve nada si el mes ya está registrado con las mismas cuentas', () => {
    expect(mergeSnapshot([point('2026-02', 4)], point('2026-02', 4))).toBeNull();
  });

  it('conserva solo los últimos meses del límite', () => {
    const history = Array.from({ length: BACKLOG_HISTORY_LIMIT }, (_unused, index) => point(`hist-${index}`, index));
    const merged = mergeSnapshot(history, point('2026-03', 99));

    expect(merged).toHaveLength(BACKLOG_HISTORY_LIMIT);
    expect(merged?.[0]).toEqual(point('hist-1', 1));
    expect(merged?.[BACKLOG_HISTORY_LIMIT - 1]).toEqual(point('2026-03', 99));
  });
});

describe('recordBacklogSnapshot', () => {
  const enero = new Date(2026, 0, 15).getTime();
  const febrero = new Date(2026, 1, 15).getTime();

  it('registra el mes en curso con el tamaño de las listas', async () => {
    await recordBacklogSnapshot(tabData({ c: [game(1), game(2)], p: [game(3)] }), enero);

    expect(await loadBacklogHistory()).toEqual([point('2026-01', 2, 0, 0, 1)]);
  });

  it('no estampa un mes a cero: la biblioteca vacía puede ser el estado aún sin hidratar', async () => {
    await recordBacklogSnapshot(tabData(), enero);

    expect(await loadBacklogHistory()).toEqual([]);
  });

  it('actualiza el punto del mes cuando cambian las listas y abre uno nuevo al cambiar de mes', async () => {
    await recordBacklogSnapshot(tabData({ c: [game(1)] }), enero);
    await recordBacklogSnapshot(tabData({ c: [game(1), game(2)] }), enero);
    await recordBacklogSnapshot(tabData({ c: [game(1), game(2)] }), febrero);

    expect(await loadBacklogHistory()).toEqual([point('2026-01', 2), point('2026-02', 2)]);
  });

  it('no reescribe nada si se le llama con el mismo estado', async () => {
    await recordBacklogSnapshot(tabData({ c: [game(1)] }), enero);
    await recordBacklogSnapshot(tabData({ c: [game(1)] }), enero);

    expect(await loadBacklogHistory()).toEqual([point('2026-01', 1)]);
  });

  it('respeta el resto del meta local', async () => {
    const { getLocalMeta, patchLocalMeta } = await import('../../src/model/repository/indexedDbRepository');
    await patchLocalMeta({ profileId: 'pid-1' });

    await recordBacklogSnapshot(tabData({ c: [game(1)] }), enero);

    expect((await getLocalMeta())?.profileId).toBe('pid-1');
  });
});
