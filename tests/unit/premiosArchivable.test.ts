import { describe, expect, it } from 'vitest';
import {
  archivableCategories,
  categoriesMissingWinner,
  getValidWinnerId,
  isArchivableCategory,
  resolveWinnerId,
} from '../../src/core/premios/archivable';
import type { PremiosCategory } from '../../src/model/types/premios';

/**
 * EL CRITERIO ES UNO SOLO, y esto es lo que lo fija: lo que el panel exige marcar tiene que ser exactamente lo
 * que `readLiveEdition` archiva. Cuando eran dos listas parecidas escritas en cuatro sitios, una categoría sin
 * título con nominados pedía ganador para publicar y luego no entraba en el archivo.
 */
const goty: PremiosCategory = {
  id: 'goty',
  title: { es: 'Juego del año' },
  options: [
    { id: 'goty_option_0', name: 'Elden Ring' },
    { id: 'goty_option_1', name: 'Hades II' },
  ],
};

describe('isArchivableCategory', () => {
  it('descarta las que no llegan al archivo: sin título, sin nominados y los placeholders', () => {
    expect(isArchivableCategory(goty)).toBe(true);
    expect(isArchivableCategory({ ...goty, title: { es: '' } })).toBe(false);
    expect(isArchivableCategory({ ...goty, options: [] })).toBe(false);
    expect(isArchivableCategory({ ...goty, isPlaceholder: true })).toBe(false);
    expect(isArchivableCategory(null)).toBe(false);
  });

  it('archivableCategories conserva el orden de lo que se le da', () => {
    const arte: PremiosCategory = { id: 'arte', title: { es: 'Arte' }, options: [{ id: 'a0', name: 'A' }] };
    expect(archivableCategories([goty, { ...arte, options: [] }, arte]).map((c) => c.id)).toEqual([
      'goty',
      'arte',
    ]);
  });
});

describe('getValidWinnerId', () => {
  it('acepta el id guardado y también el nombre de las papeletas antiguas', () => {
    expect(getValidWinnerId(goty, { goty: 'goty_option_1' })).toBe('goty_option_1');
    expect(getValidWinnerId(goty, { goty: 'Hades II' })).toBe('goty_option_1');
  });

  // EL GANADOR HUÉRFANO: se marcó y después se le quitó ese nominado a la categoría. La clave seguía en el mapa,
  // así que la categoría pasaba por marcada aunque en el recuento no puntuara a nadie.
  it('no vale un ganador cuyo nominado ya no existe', () => {
    expect(getValidWinnerId(goty, { goty: 'goty_option_9' })).toBe('');
    expect(getValidWinnerId({ ...goty, options: [] }, { goty: 'goty_option_1' })).toBe('');
  });

  it('usa el ganador embebido de los datos sin migrar como respaldo', () => {
    expect(getValidWinnerId({ ...goty, winner: 'goty_option_0' }, {})).toBe('goty_option_0');
    // Y `resolveWinnerId` mira solo lo que se le pasa: es lo que usa el guardado para no resucitar un ganador
    // que se acaba de desmarcar.
    expect(resolveWinnerId({ ...goty, winner: 'goty_option_0' }, undefined)).toBe('');
  });
});

describe('categoriesMissingWinner', () => {
  it('cuenta las del archivo que se quedan sin ganador válido', () => {
    const arte: PremiosCategory = { id: 'arte', title: { es: 'Arte' }, options: [{ id: 'a0', name: 'A' }] };
    const vacia: PremiosCategory = { id: 'vacia', title: { es: 'Vacía' }, options: [] };

    const faltan = categoriesMissingWinner([goty, arte, vacia], { goty: 'goty_option_1', arte: 'a9' });
    expect(faltan.map((c) => c.id)).toEqual(['arte']);

    expect(categoriesMissingWinner([goty, arte], { goty: 'goty_option_1', arte: 'a0' })).toHaveLength(0);
  });
});
