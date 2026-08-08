import { describe, expect, it } from 'vitest';
import { DEFAULT_SOCIAL_VISIBILITY, getOrderedUniqueTabs, normalizeVisibility } from '../../src/viewmodel/social/useSocialProfileForm';

// La visibilidad del perfil llega de un JSON que el usuario puede editar a mano (su propio gist), y decide QUÉ SE
// COMPARTE. Antes se normalizaba campo a campo en seis sitios, con las mismas expresiones copiadas; al unificarla
// conviene fijar por escrito qué hace con lo inesperado, porque un fallo aquí publica de más.

describe('visibilidad del perfil social', () => {
  it('sin datos, cae al perfil por defecto (nada oculto, foto visible)', () => {
    expect(normalizeVisibility(undefined)).toEqual(DEFAULT_SOCIAL_VISIBILITY);
    expect(normalizeVisibility(null)).toEqual(DEFAULT_SOCIAL_VISIBILITY);
    expect(normalizeVisibility({})).toEqual(DEFAULT_SOCIAL_VISIBILITY);
  });

  it('`showPhoto` solo se apaga con un false explícito', () => {
    // Su ausencia significa "no lo he tocado", no "ocúltala".
    expect(normalizeVisibility({ showPhoto: undefined }).showPhoto).toBe(true);
    expect(normalizeVisibility({ showPhoto: false }).showPhoto).toBe(false);
  });

  it('los interruptores de ocultar se fuerzan a booleano', () => {
    // Un valor "casi verdadero" del JSON no debe colarse tal cual en el objeto que se escribe en el gist.
    const raw = { hideReplayable: 1, hideRetry: '', hideGameTime: 'sí' } as never;
    const result = normalizeVisibility(raw);

    expect(result.hideReplayable).toBe(true);
    expect(result.hideRetry).toBe(false);
    expect(result.hideGameTime).toBe(true);
  });

  it('las pestañas ocultas se deduplican conservando el orden de marcado', () => {
    expect(getOrderedUniqueTabs(['v', 'c', 'v', 'p', 'c'])).toEqual(['v', 'c', 'p']);
    expect(normalizeVisibility({ hiddenTabs: ['c', 'c'] }).hiddenTabs).toEqual(['c']);
  });

  it('unas pestañas que no son lista no ocultan nada', () => {
    // Peor fallo posible al revés: interpretar basura como "ocultar todo" dejaría el perfil en blanco; y tomarla
    // como "no ocultar nada" es lo que ya hacía el código anterior (`|| []`).
    expect(normalizeVisibility({ hiddenTabs: 'c' as never }).hiddenTabs).toEqual([]);
  });
});
