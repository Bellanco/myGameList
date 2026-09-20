import { describe, expect, it } from 'vitest';
import { buildLibraryIndex, findInLibrary } from '../../src/core/premios/library';
import type { GameItem, TabData } from '../../src/model/types/game';

const juego = (name: string, extra: Partial<GameItem> = {}): GameItem =>
  ({ id: 1, _ts: 0, name, platforms: [], genres: [], steamDeck: false, review: '', ...extra }) as GameItem;

const biblioteca = (parcial: Partial<TabData>): TabData =>
  ({ c: [], v: [], e: [], p: [], deleted: [], updatedAt: 0, ...parcial }) as unknown as TabData;

describe('buildLibraryIndex / findInLibrary', () => {
  it('encuentra un juego en la lista donde está, con su nota', () => {
    const index = buildLibraryIndex(biblioteca({ c: [juego('Elden Ring', { grade: 92 })] }));
    expect(findInLibrary(index, 'Elden Ring')).toEqual({ tab: 'c', grade: 92 });
  });

  // El nombre es lo ÚNICO comparable: los ids de la biblioteca son locales y los del nominado los escribe el
  // administrador a mano.
  it('cruza sin distinguir mayúsculas ni espacios de más', () => {
    const index = buildLibraryIndex(biblioteca({ e: [juego('Hades II')] }));
    expect(findInLibrary(index, '  hades ii ')?.tab).toBe('e');
  });

  it('devuelve null cuando el nominado no está en la biblioteca', () => {
    const index = buildLibraryIndex(biblioteca({ c: [juego('Elden Ring')] }));
    expect(findInLibrary(index, 'Otro juego')).toBeNull();
  });

  // Un juego de la lista de la vergüenza puede estar sin puntuar: no hay nota que enseñar.
  it('no inventa nota para un juego sin puntuar', () => {
    const index = buildLibraryIndex(biblioteca({ v: [juego('Abandonado', { grade: 40, scored: false })] }));
    expect(findInLibrary(index, 'Abandonado')).toEqual({ tab: 'v', grade: null });
  });

  it('si el mismo juego está en dos listas, gana el orden canónico', () => {
    const index = buildLibraryIndex(biblioteca({ c: [juego('Repetido')], p: [juego('Repetido')] }));
    expect(findInLibrary(index, 'Repetido')?.tab).toBe('c');
  });

  it('aguanta una biblioteca vacía o ausente', () => {
    expect(buildLibraryIndex(null).size).toBe(0);
    expect(findInLibrary(buildLibraryIndex(biblioteca({})), 'Lo que sea')).toBeNull();
  });
});
