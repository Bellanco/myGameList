// LA FORMA DEL LISTADO (F5): renglones o mosaico, y de ESTE APARATO.
//
// Se sincronizaba por cuenta con el resto de la apariencia hasta el 20-09-2026. Era la única preferencia a la
// que seguirte le sentaba mal: en un teléfono caben dos cuadros y en un monitor ocho, así que elegir mosaico en
// el sofá le cambiaba el listado a la misma persona en el escritorio. Lo que se protege aquí no es que falte el
// código de nube —eso se vuelve a añadir sin querer en cualquier refactor— sino el efecto: un documento de
// cuenta con el campo NO cambia lo que hay elegido en esta máquina.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getPublicConfig = vi.fn();
// Con los argumentos declarados: el doble se llama con `(uid, patch)` desde el almacén, y sin ellos en la firma
// `tsc` rechaza el reenvío (TS2556).
const setPublicConfig = vi.fn(async (..._args: unknown[]) => {});
vi.mock('../../src/model/repository/firebaseRepository', () => ({
  getPublicConfig: (...args: unknown[]) => getPublicConfig(...args),
  setPublicConfig: (...args: unknown[]) => setPublicConfig(...args),
}));

import { LIST_SHAPE_KEY } from '../../src/core/constants/storageKeys';
import { hydratePreferencesFromCloud } from '../../src/model/repository/preferenceStore';
import { listShapePreference } from '../../src/view/hooks/preferences';

describe('preferencia de la forma del listado', () => {
  beforeEach(() => {
    localStorage.clear();
    getPublicConfig.mockReset();
    setPublicConfig.mockClear();
  });
  afterEach(() => localStorage.clear());

  it('sin nada guardado son renglones', () => {
    expect(listShapePreference.get()).toBe('list');
  });

  it('guarda la elección en este navegador', () => {
    listShapePreference.set('grid');
    expect(listShapePreference.get()).toBe('grid');
    expect(localStorage.getItem(LIST_SHAPE_KEY)).toBe('grid');
  });

  it('cualquier otra cosa se lee como renglones', () => {
    for (const raro of ['', 'cards', 'GRID', 'mosaico', 'null']) {
      localStorage.setItem(LIST_SHAPE_KEY, raro);
      expect(listShapePreference.get()).toBe('list');
    }
  });

  // NO VIAJA: ni se sube al elegirla…
  it('elegirla no escribe nada en la cuenta', async () => {
    getPublicConfig.mockResolvedValueOnce({});
    await hydratePreferencesFromCloud('uid-a');
    setPublicConfig.mockClear();

    listShapePreference.set('grid');

    const campos = setPublicConfig.mock.calls.flatMap((call) => Object.keys((call as unknown[])[1] || {}));
    expect(campos).not.toContain('listShape');
  });

  // …ni la pisa lo que traiga la cuenta, que es lo que hace posible «mosaico en el móvil, lista en el monitor».
  it('lo que llegue de la nube no cambia lo elegido aquí', async () => {
    listShapePreference.set('list');
    getPublicConfig.mockResolvedValueOnce({ listShape: 'grid' });
    await hydratePreferencesFromCloud('uid-a');
    expect(listShapePreference.get()).toBe('list');
  });
});
