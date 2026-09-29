import { describe, expect, it } from 'vitest';
import { hasGameCovers, nomineeKindOf } from '../../src/core/premios/nomineeKind';
import type { PremiosNomineeKind } from '../../src/model/types/premios';

describe('nomineeKindOf', () => {
  // Todas las categorías anteriores al campo eran de juegos, y así se tienen que seguir viendo.
  it('sin tipo, o con uno desconocido, cuenta como juego', () => {
    expect(nomineeKindOf({})).toBe('game');
    expect(nomineeKindOf(null)).toBe('game');
    expect(nomineeKindOf({ nomineeKind: 'film' as PremiosNomineeKind })).toBe('game');
  });

  it('respeta el tipo marcado', () => {
    expect(nomineeKindOf({ nomineeKind: 'person' })).toBe('person');
    expect(nomineeKindOf({ nomineeKind: 'screen' })).toBe('screen');
  });
});

describe('hasGameCovers', () => {
  // Una serie o un actor buscados en IGDB casan con otro juego: «The Last of Us» sacaría la carátula del juego.
  it('solo los juegos se buscan en IGDB', () => {
    expect(hasGameCovers({})).toBe(true);
    expect(hasGameCovers({ nomineeKind: 'game' })).toBe(true);
    expect(hasGameCovers({ nomineeKind: 'person' })).toBe(false);
    expect(hasGameCovers({ nomineeKind: 'screen' })).toBe(false);
  });
});
