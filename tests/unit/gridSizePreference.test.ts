// El TAMAÑO DE LOS CUADROS del mosaico (F5), la preferencia que mueve el deslizador de la cabecera del listado.
//
// Lo que se protege aquí es que un valor raro NUNCA saque a nadie de la app: de esta preferencia cuelga el ancho
// mínimo con el que `GameTable` reparte las columnas del mosaico, y ese número entra en una división. Un
// `undefined` ahí no da un mosaico feo, da `NaN` columnas y una lista en blanco. Por eso `parse` cae siempre en
// el paso de en medio, y por eso se comprueba con basura de verdad y no solo con los tres valores buenos.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getPublicConfig = vi.fn();
vi.mock('../../src/model/repository/firebaseRepository', () => ({
  getPublicConfig: (...args: unknown[]) => getPublicConfig(...args),
  setPublicConfig: vi.fn(async () => {}),
}));

import { GRID_SIZE_KEY } from '../../src/core/constants/storageKeys';
import { hydratePreferencesFromCloud } from '../../src/model/repository/preferenceStore';
import { gridSizePreference } from '../../src/view/hooks/preferences';

describe('preferencia del tamaño de los cuadros', () => {
  beforeEach(() => { localStorage.clear(); getPublicConfig.mockReset(); });
  afterEach(() => localStorage.clear());

  it('SIN nada guardado es la de en medio', () => {
    expect(gridSizePreference.get()).toBe('md');
  });

  it('guarda y devuelve los tres pasos', () => {
    for (const paso of ['sm', 'md', 'lg'] as const) {
      gridSizePreference.set(paso);
      expect(gridSizePreference.get()).toBe(paso);
    }
  });

  it('cualquier otro valor cae en el paso de en medio, nunca en algo que no se pueda dividir', () => {
    for (const raro of ['', 'xl', 'grande', '2', 'MD', 'null', 'undefined']) {
      localStorage.setItem(GRID_SIZE_KEY, raro);
      expect(gridSizePreference.get()).toBe('md');
    }
  });

  /**
   * ES DE ESTE APARATO, y eso es lo que estas dos pruebas protegen (20-09-2026).
   *
   * Se sincronizaba con el resto de la apariencia, y era la única preferencia a la que seguirte le sentaba mal:
   * en un teléfono caben dos cuadros y en un monitor ocho, así que elegir en uno reordenaba el otro. Lo que se
   * comprueba no es que no haya código de nube —eso se borra sin querer— sino que un documento de cuenta con
   * estos campos NO cambia lo que hay elegido en esta máquina.
   */
  it('lo que llegue de la nube NO pisa lo elegido aquí', async () => {
    gridSizePreference.set('md');
    getPublicConfig.mockResolvedValueOnce({ gridSize: 'sm' });
    await hydratePreferencesFromCloud('uid-a');
    expect(gridSizePreference.get()).toBe('md');
  });

  it('ni siquiera cuando esta máquina no tiene nada elegido', async () => {
    // Un documento con el campo de antes de la decisión: se ignora igual, y aquí manda el paso de en medio.
    getPublicConfig.mockResolvedValueOnce({ gridSize: 'lg' });
    await hydratePreferencesFromCloud('uid-a');
    expect(gridSizePreference.get()).toBe('md');
  });
});
