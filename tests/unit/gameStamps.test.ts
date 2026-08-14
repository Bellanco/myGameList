// Sellos automáticos (`enteredAt` / `gradedAt`): los registra la app en cada transición y nadie los teclea.
// Lo que se protege aquí es que sean ESTABLES (un sello no se reescribe), que sobrevivan al round-trip del gist,
// que se auto-reparen frente a un cliente antiguo y que no salgan nunca por el canal social.
import { describe, expect, it } from 'vitest';
import { nextVersion, resolveGradedAt, stampEntry } from '../../src/core/utils/gameStamps';
import { normalizeData } from '../../src/model/repository/localRepository';
import { assertNoSocialPrivateFields, leanTabData, toPublicGame } from '../../src/model/repository/socialProjection';
import { assertValidGamesGist } from '../../src/model/schemas/gamesGistSchema';
import type { GameItem, TabData } from '../../src/model/types/game';

function game(extra: Partial<GameItem> & { id: number }): GameItem {
  return { _ts: 1000, name: `Game ${extra.id}`, platforms: ['Steam'], genres: ['RPG'], steamDeck: false, review: '', ...extra };
}

function tabData(lists: Partial<Record<'c' | 'v' | 'e' | 'p', GameItem[]>>): TabData {
  return { c: [], v: [], e: [], p: [], ...lists, deleted: [], updatedAt: 0 };
}

const NOW = 1_800_000_000_000;

describe('stampEntry', () => {
  it('sella la lista en la que entra', () => {
    expect(stampEntry(undefined, 'p', NOW)).toEqual({ p: NOW });
  });

  it('NO reescribe el sello de una lista ya visitada: el dato es la PRIMERA entrada', () => {
    const before = { p: 1_700_000_000_000 };
    expect(stampEntry(before, 'p', NOW)).toEqual(before);
  });

  it('acumula listas sin pisar las anteriores (próximos → en curso → completados)', () => {
    const wishlist = stampEntry(undefined, 'p', 1);
    const playing = stampEntry(wishlist, 'e', 2);
    const done = stampEntry(playing, 'c', 3);
    expect(done).toEqual({ p: 1, e: 2, c: 3 });
  });

  it('descarta sellos corruptos en vez de propagarlos', () => {
    const dirty = { p: 0, e: Number.NaN, c: -5 } as unknown as Partial<Record<'c' | 'v' | 'e' | 'p', number>>;
    expect(stampEntry(dirty, 'v', NOW)).toEqual({ v: NOW });
  });
});

describe('resolveGradedAt', () => {
  it('se estrena cuando la nota cambia', () => {
    expect(resolveGradedAt({ grade: 80, previousGrade: 60, previousGradedAt: 1, now: NOW })).toBe(NOW);
  });

  it('conserva el sello si la nota es la misma (reescribir la reseña no es cambiar de opinión)', () => {
    expect(resolveGradedAt({ grade: 80, previousGrade: 80, previousGradedAt: 1234, now: NOW })).toBe(1234);
  });

  it('sin nota no hay nada que fechar: "sin puntuar" es un estado, no una opinión', () => {
    expect(resolveGradedAt({ grade: 0, previousGrade: 0, now: NOW })).toBeUndefined();
  });

  it('un juego anterior al campo se queda sin sello en vez de inventarse uno', () => {
    expect(resolveGradedAt({ grade: 80, previousGrade: 80, previousGradedAt: undefined, now: NOW })).toBeUndefined();
  });
});

describe('normalizeData siembra y sanea los sellos', () => {
  it('siembra el sello de la lista actual desde listedAt (juego anterior al campo)', () => {
    const out = normalizeData(tabData({ c: [game({ id: 1, listedAt: 1_650_000_000_000 })] }));
    expect(out.c[0].enteredAt).toEqual({ c: 1_650_000_000_000 });
  });

  it('lo siembra en la lista donde está el juego, no siempre en completados', () => {
    const out = normalizeData(tabData({ p: [game({ id: 1, listedAt: 1_650_000_000_000 })] }));
    expect(out.p[0].enteredAt).toEqual({ p: 1_650_000_000_000 });
  });

  it('REPARA el historial que un cliente antiguo haya borrado, sin inventar las listas anteriores', () => {
    // Escenario real: un dispositivo sin actualizar gana el merge (LWW del objeto entero) y devuelve el juego sin
    // sellos. Al cargarlo aquí se recompone el de la lista actual —es la misma fecha que `listedAt`— y el paso por
    // próximos se da por perdido en vez de fabricarlo.
    const wiped = game({ id: 1, listedAt: 1_650_000_000_000 });
    const out = normalizeData(tabData({ c: [wiped] }));
    expect(out.c[0].enteredAt).toEqual({ c: 1_650_000_000_000 });
  });

  it('conserva el historial completo cuando ya existe', () => {
    const history = { p: 100, e: 200, c: 300 };
    const out = normalizeData(tabData({ c: [game({ id: 1, listedAt: 300, enteredAt: history })] }));
    expect(out.c[0].enteredAt).toEqual(history);
  });

  it('NO siembra desde una fecha sellada en bloque: una importación no es la llegada de nada', () => {
    // Una biblioteca importada llega con el mismo `_ts` en todos los juegos. Sembrar de ahí diría que las
    // doscientas partidas entraron en el mismo milisegundo, y el calendario y el "tiempo en cola" que se
    // construyan encima no estarían aproximando, estarían mintiendo.
    const bulk = 1_650_000_000_000;
    const imported = tabData({ c: Array.from({ length: 10 }, (_u, i) => game({ id: i + 1, _ts: bulk })) });
    const out = normalizeData(imported);
    expect(out.c.every((g) => g.enteredAt && !g.enteredAt.c)).toBe(true);
  });

  it('una fecha compartida por pocos juegos sí es una llegada real', () => {
    const shared = 1_650_000_000_000;
    const few = tabData({ c: [game({ id: 1, listedAt: shared }), game({ id: 2, listedAt: shared })] });
    const out = normalizeData(few);
    expect(out.c[0].enteredAt?.c).toBe(shared);
  });

  it('un sello ya escrito por la app sobrevive aunque su fecha coincida con un sellado en bloque', () => {
    // La exclusión solo frena la SIEMBRA. Lo que la app vio ocurrir no se descarta nunca.
    const bulk = 1_650_000_000_000;
    const games = Array.from({ length: 10 }, (_u, i) => game({ id: i + 1, _ts: bulk }));
    games[0] = { ...games[0], enteredAt: { c: bulk } };
    const out = normalizeData(tabData({ c: games }));
    expect(out.c[0].enteredAt?.c).toBe(bulk);
  });

  it('no cuenta como cambio de contenido: una importación no debe resellar toda la biblioteca', () => {
    // `bumpChangedAgainst` estampa `_ts` en lo que difiere de la referencia. Si el sello sembrado contara como
    // contenido, la primera carga tras actualizar marcaría TODOS los juegos como modificados.
    const stored = tabData({ c: [game({ id: 1, _ts: 500, listedAt: 400 })] });
    const out = normalizeData(stored, { bumpChangedAgainst: normalizeData(stored) });
    expect(out.c[0]._ts).toBe(500);
  });
});

describe('el gist de juegos conserva los sellos', () => {
  it('los persiste en la forma magra', () => {
    const lean = leanTabData(tabData({ c: [game({ id: 1, enteredAt: { p: 100, c: 300 }, gradedAt: 250 })] }));
    expect(lean.c[0].enteredAt).toEqual({ p: 100, c: 300 });
    expect(lean.c[0].gradedAt).toBe(250);
  });

  it('sobrevive un round-trip write(lean) → read(normalize) con el historial intacto', () => {
    const source = game({ id: 1, _ts: 999, listedAt: 300, enteredAt: { p: 100, e: 200, c: 300 }, gradedAt: 250 });
    const roundTripped = normalizeData(leanTabData(tabData({ c: [source] })));
    expect(roundTripped.c[0].enteredAt).toEqual({ p: 100, e: 200, c: 300 });
    expect(roundTripped.c[0].gradedAt).toBe(250);
  });

  it('no escribe un objeto vacío cuando no hay sellos', () => {
    const lean = leanTabData(tabData({ c: [{ ...game({ id: 1 }), enteredAt: {} }] }));
    expect('enteredAt' in lean.c[0]).toBe(false);
  });

  it('valida contra el schema del gist', () => {
    expect(() => assertValidGamesGist(leanTabData(tabData({ c: [game({ id: 1, enteredAt: { c: 300 }, gradedAt: 250 })] })))).not.toThrow();
  });

  it('un gist SIN los campos sigue siendo válido (cliente antiguo escribiendo)', () => {
    const legacy = tabData({ c: [game({ id: 1 })] });
    delete (legacy.c[0] as Partial<GameItem>).enteredAt;
    expect(() => assertValidGamesGist(leanTabData(legacy))).not.toThrow();
  });
});

describe('los sellos NO salen por el canal social', () => {
  it('la proyección pública no los copia', () => {
    const publicGame = toPublicGame(game({ id: 1, enteredAt: { p: 100, c: 300 }, gradedAt: 250 }), 'c');
    expect('enteredAt' in publicGame).toBe(false);
    expect('gradedAt' in publicGame).toBe(false);
  });

  it('la guarda de privacidad los rechaza si alguien los cuela', () => {
    expect(() => assertNoSocialPrivateFields({ games: [{ id: 1, enteredAt: { c: 1 } }] })).toThrow(/enteredAt/);
    expect(() => assertNoSocialPrivateFields({ games: [{ id: 1, gradedAt: 1 }] })).toThrow(/gradedAt/);
  });
});

// `_ts` es a la vez el reloj del merge y la huella con la que se decide si un guardado cambió algo: dos versiones
// del mismo juego no pueden compartirla o la segunda edición se descarta en silencio.
describe('nextVersion', () => {
  it('usa el reloj cuando ya ha avanzado', () => {
    expect(nextVersion(NOW - 5, NOW)).toBe(NOW);
  });

  it('avanza sobre la anterior cuando el reloj no se ha movido', () => {
    expect(nextVersion(NOW, NOW)).toBe(NOW + 1);
  });

  it('nunca retrocede aunque el reloj sí lo haga (cambio de hora, ajuste del sistema)', () => {
    expect(nextVersion(NOW + 60_000, NOW)).toBe(NOW + 60_001);
  });

  it('un juego sin marca previa estrena la del reloj', () => {
    expect(nextVersion(undefined, NOW)).toBe(NOW);
    expect(nextVersion(Number.NaN, NOW)).toBe(NOW);
  });
});
