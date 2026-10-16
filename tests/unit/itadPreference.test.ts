// El interruptor de ISTHEREANYDEAL viene apagado, y este fichero existe para que siga siendo así (P0.1 del plan de la
// ficha y los precios).
//
// Como las carátulas, no es una preferencia de gusto: encenderlo es lo que autoriza a que nuestro servidor pregunte a
// IsThereAnyDeal por los títulos de la lista de deseos de su dueño. Un cambio que lo dejara encendido por omisión —o que
// leyera un valor raro como un sí— convertiría en automático algo que se decidió que fuera explícito.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/model/repository/firebaseRepository', () => ({
  getPublicConfig: vi.fn(),
  setPublicConfig: vi.fn(async () => {}),
}));

import { ITAD_KEY } from '../../src/core/constants/storageKeys';
import { itadPreference } from '../../src/view/hooks/preferences';

describe('preferencia de IsThereAnyDeal', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('SIN nada guardado está apagada', () => {
    expect(itadPreference.get()).toBe(false);
  });

  it('solo un "on" explícito la enciende', () => {
    localStorage.setItem(ITAD_KEY, 'on');
    expect(itadPreference.get()).toBe(true);
  });

  it('cualquier otro valor se lee como apagada, nunca como un sí por omisión', () => {
    for (const raro of ['', 'off', 'true', '1', 'sí', 'ON ', 'null']) {
      localStorage.setItem(ITAD_KEY, raro);
      expect(itadPreference.get()).toBe(false);
    }
  });

  it('se apaga y se enciende, y lo guardado se puede volver a leer', () => {
    itadPreference.set(true);
    expect(itadPreference.get()).toBe(true);
    itadPreference.set(false);
    expect(itadPreference.get()).toBe(false);
  });
});
