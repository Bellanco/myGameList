// Los sellos automáticos frente a la IMPORTACIÓN y al respaldo.
//
// Tres caminos distintos entran datos por aquí y ninguno debe llevarse por delante un historial que solo existe
// en este aparato: restaurar un respaldo, fusionar un juego que ya está en la biblioteca y dar de alta uno nuevo
// desde una integración externa.
import { describe, expect, it } from 'vitest';
import { carryStamps } from '../../src/core/utils/gameStamps';
import { normalizeData } from '../../src/model/repository/localRepository';
import { mergeImportedIntoGame } from '../../src/core/import/staging';
import type { GameItem, TabData } from '../../src/model/types/game';
import type { ImportedGame } from '../../src/model/types/import';

const STAMPS = { p: 1_700_000_000_000, e: 1_740_000_000_000, c: 1_780_000_000_000 };

function game(extra: Partial<GameItem> & { id: number }): GameItem {
  return {
    _ts: 1_780_000_000_000,
    name: `Game ${extra.id}`,
    platforms: ['Steam'],
    genres: ['RPG'],
    steamDeck: false,
    review: '',
    listedAt: STAMPS.c,
    ...extra,
  };
}

function tabData(lists: Partial<Record<'c' | 'v' | 'e' | 'p', GameItem[]>>): TabData {
  return { c: [], v: [], e: [], p: [], ...lists, deleted: [], updatedAt: 0 };
}

describe('restaurar un respaldo', () => {
  const current = tabData({ c: [game({ id: 1, enteredAt: STAMPS, gradedAt: STAMPS.c })] });

  it('un respaldo ANTERIOR a los sellos no se lleva por delante el historial', () => {
    // El fichero no puede aportar esos sellos —se guardaron después de exportarlo—, así que tampoco tiene por
    // qué borrarlos. Sin esto, restaurar una copia de seguridad perdía el paso por listas de toda la biblioteca.
    const backup = tabData({ c: [game({ id: 1, name: 'Nombre del respaldo' })] });
    const carried = carryStamps(backup, current);
    expect(carried.c[0].name).toBe('Nombre del respaldo');
    expect(carried.c[0].enteredAt).toEqual(STAMPS);
    expect(carried.c[0].gradedAt).toBe(STAMPS.c);
  });

  it('si el respaldo SÍ los trae, mandan los suyos: es lo que se está restaurando', () => {
    const older = { p: 1, e: 2, c: 3 };
    const backup = tabData({ c: [game({ id: 1, enteredAt: older, gradedAt: 3 })] });
    const carried = carryStamps(backup, current);
    expect(carried.c[0].enteredAt).toEqual(older);
    expect(carried.c[0].gradedAt).toBe(3);
  });

  it('un juego que el respaldo trae y aquí no existía se queda como viene', () => {
    const backup = tabData({ c: [game({ id: 99 })] });
    expect(carryStamps(backup, current).c[0].enteredAt).toBeUndefined();
  });

  it('sobre una biblioteca vacía no inventa nada', () => {
    const backup = tabData({ c: [game({ id: 1 })] });
    const empty = tabData({});
    expect(carryStamps(backup, empty)).toBe(backup);
  });

  it('el ciclo completo de importar deja el historial en pie y no resella la biblioteca', () => {
    // La referencia es la biblioteca YA normalizada, que es la que tiene la app en memoria.
    const inMemory = normalizeData(current);
    const backup = tabData({ c: [game({ id: 1, name: 'Nombre del respaldo' })] });
    const imported = normalizeData(carryStamps(backup, inMemory), { bumpChangedAgainst: inMemory });
    expect(imported.c[0].enteredAt).toEqual(STAMPS);

    // El nombre cambió, así que ESE juego sí estrena `_ts`. Lo que no puede pasar es que lo estrene un juego
    // idéntico por culpa de un sello que la propia carga acaba de sembrar (ver `CONTENT_KEY_IGNORED`).
    const same = tabData({ c: [game({ id: 1, enteredAt: STAMPS, gradedAt: STAMPS.c })] });
    const untouched = normalizeData(carryStamps(same, inMemory), { bumpChangedAgainst: inMemory });
    expect(untouched.c[0]._ts).toBe(inMemory.c[0]._ts);
  });
});

describe('fusionar con un juego que ya está en la biblioteca', () => {
  it('la importación externa solo aporta campos del juego, nunca toca los sellos', () => {
    // `mergeImportedIntoGame` devuelve un PARCHE: lo que no menciona, no se pisa. Esto lo fija por si algún día
    // ese parche pasara a construir el juego entero.
    const existing = game({ id: 1, enteredAt: STAMPS, gradedAt: STAMPS.c, hours: null });
    const incoming = { name: 'Game 1', genres: ['Metroidvania'], platforms: ['GOG'], hours: 12, grade: 80 } as ImportedGame;
    const patch = mergeImportedIntoGame(existing, incoming, { genres: true, platforms: true, hours: true, grade: true });

    expect('enteredAt' in patch).toBe(false);
    expect('gradedAt' in patch).toBe(false);
    // Y el juego resultante los conserva, porque el parche se aplica encima.
    const merged = { ...existing, ...patch };
    expect(merged.enteredAt).toEqual(STAMPS);
    expect(merged.hours).toBe(12);
  });
});
