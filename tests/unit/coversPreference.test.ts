// La preferencia de CARÁTULAS viene apagada, y este fichero existe para que siga siendo así.
//
// No es una preferencia de gusto como el tema o la caja del texto: encenderla es lo que autoriza a que la app
// pida imágenes y, con ellas, a que nuestro servidor le pregunte a IGDB por los títulos de la biblioteca de su
// dueño. Un cambio que la dejara encendida por omisión —o que interpretara un valor raro como un sí— convertiría
// en automático algo que se decidió que fuera explícito, y no saltaría nada más.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/model/repository/firebaseRepository', () => ({
  getPublicConfig: vi.fn(),
  setPublicConfig: vi.fn(async () => {}),
}));

import { COVERS_KEY } from '../../src/core/constants/storageKeys';
import { coversPreference } from '../../src/view/hooks/preferences';

describe('preferencia de carátulas', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('SIN nada guardado está apagada', () => {
    expect(coversPreference.get()).toBe(false);
  });

  it('solo un "on" explícito la enciende', () => {
    localStorage.setItem(COVERS_KEY, 'on');
    expect(coversPreference.get()).toBe(true);
  });

  it('cualquier otro valor se lee como apagada, nunca como un sí por omisión', () => {
    for (const raro of ['', 'off', 'true', '1', 'sí', 'ON ', 'null']) {
      localStorage.setItem(COVERS_KEY, raro);
      expect(coversPreference.get()).toBe(false);
    }
  });

  it('se apaga y se enciende, y lo guardado se puede volver a leer', () => {
    coversPreference.set(true);
    expect(coversPreference.get()).toBe(true);
    coversPreference.set(false);
    expect(coversPreference.get()).toBe(false);
  });
});
