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

  it('adopta el paso que llega de la nube', async () => {
    gridSizePreference.set('md');
    getPublicConfig.mockResolvedValueOnce({ gridSize: 'sm' });
    await hydratePreferencesFromCloud('uid-a');
    expect(gridSizePreference.get()).toBe('sm');
  });

  it('pero un valor con forma inesperada se IGNORA, no pisa lo que esta máquina tenía elegido', async () => {
    // `fromCloud` devuelve `null` para «ignóralo», que es distinto de devolver el valor por defecto: entre
    // «no me han dicho nada» y «me han dicho una tontería» la respuesta es la misma —quedarse como estaba— y
    // nunca reescribir la elección de quien está delante.
    gridSizePreference.set('lg');
    getPublicConfig.mockResolvedValueOnce({ gridSize: 'xl' });
    await hydratePreferencesFromCloud('uid-a');
    expect(gridSizePreference.get()).toBe('lg');
  });
});
