// CAMBIOS DEL PERFIL SIN GUARDAR (09-10-2026): contra lo último guardado, con la foto EFECTIVA.
import { describe, expect, it } from 'vitest';
import { hasUnsavedProfileChanges } from '../../src/viewmodel/social/useSocialProfileForm';

const VIS = { hiddenTabs: ['v', 'd'] as const, hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true };
const perfil = (over: Record<string, unknown> = {}) => ({
  name: 'Ada',
  visibility: { ...VIS, hiddenTabs: [...VIS.hiddenTabs], ...over } as never,
});

describe('cambios del perfil sin guardar', () => {
  it('igual que lo guardado: no hay cambios (ni por el orden de las listas, ni por espacios en el nombre)', () => {
    expect(hasUnsavedProfileChanges({ ...perfil({ hiddenTabs: ['d', 'v'] }), name: 'Ada ' }, perfil(), true)).toBe(false);
  });

  it('cambiar el nombre, una lista o un dato SÍ es un cambio', () => {
    expect(hasUnsavedProfileChanges({ ...perfil(), name: 'Adela' }, perfil(), true)).toBe(true);
    expect(hasUnsavedProfileChanges(perfil({ hiddenTabs: ['v'] }), perfil(), true)).toBe(true);
    expect(hasUnsavedProfileChanges(perfil({ hideGameTime: true }), perfil(), true)).toBe(true);
  });

  it('sin foto real en la cuenta, el interruptor de la foto apagado solo NO cuenta como cambio', () => {
    expect(hasUnsavedProfileChanges(perfil({ showPhoto: false }), perfil({ showPhoto: true }), false)).toBe(false);
    // Con foto real, apagarla sí lo es.
    expect(hasUnsavedProfileChanges(perfil({ showPhoto: false }), perfil({ showPhoto: true }), true)).toBe(true);
  });
});
