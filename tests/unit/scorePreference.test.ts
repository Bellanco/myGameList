import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock del repo de Firebase: el store no debe tocar red en tests.
const getPublicConfig = vi.fn();
const setPublicConfig = vi.fn(async (_uid: string, _cfg: unknown) => {});
vi.mock('../../src/model/repository/firebaseRepository', () => ({
  getPublicConfig: (uid: string) => getPublicConfig(uid),
  setPublicConfig: (uid: string, cfg: unknown) => setPublicConfig(uid, cfg),
}));

import {
  getScoreScale,
  hydrateScoreScale,
  persistScoreScale,
  resetScoreScale,
  subscribeScoreScale,
} from '../../src/model/repository/scorePreferenceRepository';

describe('scorePreferenceRepository — store de la escala de puntuación', () => {
  beforeEach(() => {
    getPublicConfig.mockReset();
    setPublicConfig.mockReset().mockResolvedValue(undefined);
    resetScoreScale();
    localStorage.clear();
  });
  afterEach(() => {
    resetScoreScale();
  });

  it('por defecto es estrellas', () => {
    expect(getScoreScale()).toBe('stars');
  });

  it('hidrata a grade desde Firestore y notifica a los suscriptores', async () => {
    getPublicConfig.mockResolvedValue({ scoreScale: 'grade' });
    const cb = vi.fn();
    const unsub = subscribeScoreScale(cb);
    await hydrateScoreScale('uid-1');
    expect(getScoreScale()).toBe('grade');
    expect(cb).toHaveBeenCalled();
    unsub();
  });

  it('hidratar sin doc / con error deja estrellas (no rompe)', async () => {
    getPublicConfig.mockRejectedValue(new Error('permission-denied'));
    await hydrateScoreScale('uid-1');
    expect(getScoreScale()).toBe('stars');
  });

  it('persistScoreScale actualiza el local de inmediato y escribe en Firestore', async () => {
    await persistScoreScale('uid-1', 'grade');
    expect(getScoreScale()).toBe('grade');
    expect(setPublicConfig).toHaveBeenCalledWith('uid-1', { scoreScale: 'grade' });
  });

  it('resetScoreScale (logout) vuelve a estrellas', async () => {
    await persistScoreScale('uid-1', 'grade');
    resetScoreScale();
    expect(getScoreScale()).toBe('stars');
  });

  // docs/plan-degradacion-servicios.md, fase 5: con Firestore sin cuota, quien usa la nota 0–100 volvía a ver
  // estrellas en sus listas. La copia de este navegador lo evita.
  it('si Firestore no responde, se queda con la última escala conocida en este navegador', async () => {
    getPublicConfig.mockResolvedValueOnce({ scoreScale: 'grade' });
    await hydrateScoreScale('uid-1');
    resetScoreScale(); // nueva carga de la página
    getPublicConfig.mockRejectedValueOnce(Object.assign(new Error('Quota exceeded.'), { code: 'resource-exhausted' }));

    await hydrateScoreScale('uid-1');

    expect(getScoreScale()).toBe('grade');
  });

  it('cambiarla con Firestore sin cuota no rompe y la deja puesta', async () => {
    setPublicConfig.mockRejectedValueOnce(new Error('Quota exceeded.'));

    await expect(persistScoreScale('uid-1', 'grade')).resolves.toBeUndefined();
    expect(getScoreScale()).toBe('grade');

    resetScoreScale();
    getPublicConfig.mockRejectedValueOnce(new Error('Quota exceeded.'));
    await hydrateScoreScale('uid-1');
    expect(getScoreScale()).toBe('grade');
  });

  it('la copia es de cada usuario', async () => {
    await persistScoreScale('uid-1', 'grade');
    resetScoreScale();
    getPublicConfig.mockRejectedValueOnce(new Error('Quota exceeded.'));
    await hydrateScoreScale('uid-2');
    expect(getScoreScale()).toBe('stars');
  });
});
