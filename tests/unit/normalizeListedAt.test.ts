import { describe, expect, it } from 'vitest';
import { normalizeData } from '../../src/model/repository/localRepository';
import { leanTabData } from '../../src/model/repository/socialProjection';
import type { GameItem, TabData } from '../../src/model/types/game';

function game(extra: Partial<GameItem> & { id: number }): GameItem {
  return { _ts: 1000, name: `Game ${extra.id}`, platforms: ['Steam'], genres: ['RPG'], steamDeck: false, review: '', ...extra };
}

function tabData(c: GameItem[]): TabData {
  return { c, v: [], e: [], p: [], deleted: [], updatedAt: 0 };
}

describe('normalizeData preserva listedAt', () => {
  it('conserva el listedAt existente en el round-trip', () => {
    const out = normalizeData(tabData([game({ id: 1, listedAt: 1700000000000 })]));
    expect(out.c[0].listedAt).toBe(1700000000000);
  });

  it('en datos legacy (sin listedAt) cae al _ts del propio juego', () => {
    const out = normalizeData(tabData([game({ id: 1, _ts: 1650000000000 })]));
    expect(out.c[0].listedAt).toBe(1650000000000);
  });

  it('ignora valores no válidos y aplica el fallback', () => {
    const out = normalizeData(tabData([game({ id: 1, _ts: 1650000000000, listedAt: 0 })]));
    expect(out.c[0].listedAt).toBe(1650000000000);
  });
});

describe('leanTabData (serialización del gist) preserva listedAt', () => {
  // Regresión: si el gist NO guarda listedAt, la lectura lo re-deriva del _ts (que sube al editar) y el juego
  // salta de posición en Completados tras sincronizar, aunque no haya cambiado de lista.
  it('persiste listedAt distinto del _ts en la forma magra', () => {
    const lean = leanTabData(tabData([game({ id: 1, _ts: 1_700_000_009_999, listedAt: 1_650_000_000_000 })]));
    expect(lean.c[0].listedAt).toBe(1_650_000_000_000);
  });

  it('sobrevive un round-trip write(lean) → read(normalize) sin arrastrar el _ts editado', () => {
    const edited = game({ id: 1, _ts: 1_700_000_009_999, listedAt: 1_650_000_000_000 });
    const roundTripped = normalizeData(leanTabData(tabData([edited])));
    expect(roundTripped.c[0].listedAt).toBe(1_650_000_000_000);
  });
});
