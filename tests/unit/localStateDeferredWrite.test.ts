import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flushLocalState, loadLocalState, saveLocalState } from '../../src/model/repository/localRepository';
import { STORAGE_KEY } from '../../src/core/constants/storageKeys';
import type { GameItem, StoragePayload } from '../../src/model/types/game';

function makeGame(id: number, name: string): GameItem {
  return { id, _ts: id, name, platforms: [], genres: [], steamDeck: false, review: '' };
}

function payload(over: Partial<StoragePayload> = {}): StoragePayload {
  return { c: [], v: [], e: [], p: [], deleted: [], updatedAt: 1000, etag: null, lastRemoteUpdatedAt: 0, ...over };
}

function raw(): StoragePayload | null {
  const text = localStorage.getItem(STORAGE_KEY);
  return text ? (JSON.parse(text) as StoragePayload) : null;
}

beforeEach(() => {
  flushLocalState(); // no arrastrar pendientes de un test a otro
  localStorage.clear();
});

/**
 * La escritura a localStorage se aplaza a un hueco ocioso para sacar del hilo crítico el `JSON.stringify` de la
 * biblioteca entera. Estas pruebas fijan las dos condiciones que hacen que ese aplazamiento sea seguro.
 */
describe('estado local — escritura diferida', () => {
  it('does not write to localStorage synchronously on save', () => {
    saveLocalState(payload({ c: [makeGame(1, 'Hollow Knight')] }));
    expect(raw()).toBeNull();
  });

  // TRAMPA 1: quien lea NO puede ver el estado viejo solo porque el volcado aún no haya ocurrido.
  it('serves the pending state to readers before it reaches disk', () => {
    saveLocalState(payload({ c: [makeGame(1, 'Hollow Knight')], updatedAt: 5000 }));
    const leido = loadLocalState();
    expect(leido.c.map((g) => g.name)).toEqual(['Hollow Knight']);
    expect(leido.updatedAt).toBe(5000);
    expect(raw()).toBeNull(); // sigue sin tocar disco: lo anterior salió de memoria
  });

  it('reads back the last save when several pile up, and writes only once', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    saveLocalState(payload({ c: [makeGame(1, 'Uno')] }));
    saveLocalState(payload({ c: [makeGame(2, 'Dos')] }));
    saveLocalState(payload({ c: [makeGame(3, 'Tres')] }));
    expect(loadLocalState().c.map((g) => g.name)).toEqual(['Tres']);

    flushLocalState();
    expect(raw()?.c.map((g) => g.name)).toEqual(['Tres']);
    // Tres ediciones seguidas → UNA escritura. Es el ahorro que justifica el cambio.
    expect(setItem.mock.calls.filter(([key]) => key === STORAGE_KEY)).toHaveLength(1);
    setItem.mockRestore();
  });

  // TRAMPA 2: cerrar la pestaña antes del hueco ocioso no puede perder la última edición.
  it('flushes synchronously when the page is hidden', () => {
    saveLocalState(payload({ c: [makeGame(7, 'Celeste')] }));
    expect(raw()).toBeNull();

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(raw()?.c.map((g) => g.name)).toEqual(['Celeste']);
    vi.restoreAllMocks();
  });

  it('flushes synchronously on pagehide', () => {
    saveLocalState(payload({ c: [makeGame(8, 'Hades')] }));
    window.dispatchEvent(new Event('pagehide'));
    expect(raw()?.c.map((g) => g.name)).toEqual(['Hades']);
  });

  it('stamps the schema version so the auto-upgrade does not run again', () => {
    saveLocalState(payload({ c: [makeGame(1, 'Uno')] }));
    flushLocalState();
    expect(raw()?.schemaVersion).toBeGreaterThan(0);
  });

  // La cuota de localStorage es el techo que motivó todo esto: si peta, el estado NO se pierde porque
  // IndexedDB ya lo tiene, y el fallo no puede propagarse al usuario.
  it('survives a quota error without throwing', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    saveLocalState(payload({ c: [makeGame(1, 'Uno')] }));
    expect(() => flushLocalState()).not.toThrow();
    setItem.mockRestore();
  });
});
