import { describe, expect, it } from 'vitest';
import { computeWishKin, WISH_KIN_MAX_PAIRS } from '../../src/core/stats/wishKin';
import type { GameItem, TabData } from '../../src/model/types/game';

/**
 * «Ya lo tienes en casa»: cada deseo frente a lo que espera en Próximos (docs/plan-estadisticas-deseos.md). Lo que
 * estas pruebas fijan son las reglas del parentesco: qué emparenta, qué no y en qué orden.
 */

let nextId = 1;
const juego = (name: string, extra: Partial<GameItem> = {}): GameItem =>
  ({ id: nextId++, _ts: 1, name, platforms: [], genres: [], steamDeck: false, review: '', ...extra }) as GameItem;

const listas = (d: GameItem[], p: GameItem[], resto: Partial<TabData> = {}): TabData => ({
  c: [],
  v: [],
  e: [],
  p,
  d,
  deleted: [],
  updatedAt: 0,
  ...resto,
});

describe('parentesco por saga', () => {
  it('misma saga con números, romanos y subtítulos', () => {
    const kin = computeWishKin(listas(
      [juego('Dark Souls III'), juego('Dishonored: Death of the Outsider')],
      [juego('Dark Souls Remastered'), juego('Dishonored 2')],
    ));

    expect(kin.pairs.map((pair) => [pair.wish.name, pair.kin.name, pair.reason.kind])).toEqual([
      ['Dark Souls III', 'Dark Souls Remastered', 'saga'],
      ['Dishonored: Death of the Outsider', 'Dishonored 2', 'saga'],
    ]);
  });

  it('por prefijo, si la base corta da para ello', () => {
    const kin = computeWishKin(listas([juego('Elden Ring Nightreign')], [juego('Elden Ring')]));

    expect(kin.pairs[0]?.reason).toEqual({ kind: 'saga' });
  });

  it('una base corta no emparenta por prefijo: «Doom» no se lleva todo lo que empiece por Doom', () => {
    const kin = computeWishKin(listas([juego('Doom Eternal')], [juego('Doom')]));

    expect(kin.pairs).toEqual([]);
  });

  it('el año al final es la entrega, no parte del nombre', () => {
    const kin = computeWishKin(listas([juego('Football Manager 2026')], [juego('Football Manager 2018')]));

    expect(kin.pairs[0]?.reason).toEqual({ kind: 'saga' });
  });
});

describe('parentesco por géneros', () => {
  it('hacen falta dos géneros en común, sin distinguir tildes ni mayúsculas', () => {
    const kin = computeWishKin(listas(
      [juego('Silksong', { genres: ['Metroidvania', 'Acción'] })],
      [juego('Ori', { genres: ['metroidvania', 'ACCION', 'Plataformas'] }), juego('Otro', { genres: ['Metroidvania', 'Puzles'] })],
    ));

    expect(kin.pairs).toHaveLength(1);
    expect(kin.pairs[0].kin.name).toBe('Ori');
    // Con la grafía del deseo, que es lo que se está mirando.
    expect(kin.pairs[0].reason).toEqual({ kind: 'genres', shared: ['Metroidvania', 'Acción'] });
  });

  it('con un juego de un solo género, basta ese', () => {
    const kin = computeWishKin(listas([juego('Hades II', { genres: ['RogueLike'] })], [juego('Dead Cells', { genres: ['Roguelike', 'Metroidvania'] })]));

    expect(kin.pairs[0]?.reason).toEqual({ kind: 'genres', shared: ['RogueLike'] });
  });

  it('un solo género en común entre juegos de varios no basta', () => {
    const kin = computeWishKin(listas(
      [juego('A', { genres: ['RPG', 'Mundo abierto'] })],
      [juego('B', { genres: ['RPG', 'Táctico'] })],
    ));

    expect(kin.pairs).toEqual([]);
  });

  it('la plataforma no emparenta, solo desempata', () => {
    expect(computeWishKin(listas([juego('A', { platforms: ['Switch'] })], [juego('B', { platforms: ['Switch'] })])).pairs).toEqual([]);

    const kin = computeWishKin(listas(
      [juego('Deseo', { genres: ['JRPG'], platforms: ['Switch'] })],
      [juego('En PC', { genres: ['JRPG'], platforms: ['PC'] }), juego('En Switch', { genres: ['JRPG'], platforms: ['switch'] })],
    ));
    expect(kin.pairs[0].kin.name).toBe('En Switch');
  });
});

describe('la mejor pareja y el orden', () => {
  it('la saga gana a los géneros', () => {
    const kin = computeWishKin(listas(
      [juego('Hades II', { genres: ['RogueLike', 'Acción'] })],
      [juego('Dead Cells', { genres: ['RogueLike', 'Acción'] }), juego('Hades', { genres: ['Mitología'] })],
    ));

    expect(kin.pairs[0].kin.name).toBe('Hades');
  });

  it('a igual parecido, el que lleva más tiempo esperando', () => {
    const kin = computeWishKin(listas(
      [juego('Deseo', { genres: ['Puzles'] })],
      [juego('Reciente', { genres: ['Puzles'], enteredAt: { p: 2000 } }), juego('Antiguo', { genres: ['Puzles'], enteredAt: { p: 1000 } })],
    ));

    expect(kin.pairs[0].kin.name).toBe('Antiguo');
  });

  it('primero los deseos con más interés, y la cifra cuenta todos aunque solo se enseñen cinco', () => {
    const deseos = Array.from({ length: 7 }, (_, index) => juego(`Deseo ${index}`, { genres: ['Cartas'], grade: index * 10 }));
    const kin = computeWishKin(listas([...deseos, juego('Sin pariente', { genres: ['Carreras'] })], [juego('Balatro', { genres: ['Cartas'] })]));

    expect(kin.wishes).toBe(8);
    expect(kin.withKin).toBe(7);
    expect(kin.pairs).toHaveLength(WISH_KIN_MAX_PAIRS);
    expect(kin.pairs.map((pair) => pair.wish.grade)).toEqual([60, 50, 40, 30, 20]);
  });

  it('el mismo juego en las dos listas no es su propio pariente', () => {
    expect(computeWishKin(listas([juego('Hades', { genres: ['RogueLike'] })], [juego('hades', { genres: ['RogueLike'] })])).pairs).toEqual([]);
  });
});

describe('géneros: lo que deseas frente a lo que esperas', () => {
  it('cuenta las dos listas y señala los géneros deseados sin nada esperando', () => {
    const kin = computeWishKin(listas(
      [
        juego('A', { genres: ['Roguelike'] }),
        juego('B', { genres: ['Roguelike', 'Carreras'] }),
        juego('C', { genres: ['RPG'] }),
      ],
      [juego('D', { genres: ['RPG'] }), juego('E', { genres: ['rpg'] }), juego('F', { genres: ['Estrategia'] })],
    ));

    // Por lo que más pesa en cualquiera de las dos listas; a empate, lo más deseado primero.
    expect(kin.genres).toEqual([
      { tag: 'Roguelike', wished: 2, waiting: 0 },
      { tag: 'RPG', wished: 1, waiting: 2 },
      { tag: 'Carreras', wished: 1, waiting: 0 },
      { tag: 'Estrategia', wished: 0, waiting: 1 },
    ]);
    expect(kin.gaps).toEqual(['Roguelike', 'Carreras']);
  });
});

describe('listas vacías', () => {
  it('sin deseos no hay nada que contar', () => {
    expect(computeWishKin(listas([], [juego('Ori', { genres: ['Metroidvania'] })]))).toMatchObject({ wishes: 0, withKin: 0, pairs: [], gaps: [] });
  });

  it('sin Próximos, ningún deseo tiene pariente y todos sus géneros son hueco', () => {
    const kin = computeWishKin(listas([juego('Silksong', { genres: ['Metroidvania'] })], []));

    expect(kin).toMatchObject({ wishes: 1, withKin: 0, pairs: [], gaps: ['Metroidvania'] });
  });

  it('solo mira Próximos: lo terminado no es «el próximo listo»', () => {
    const kin = computeWishKin(listas([juego('Hades II')], [], { c: [juego('Hades')] }));

    expect(kin.pairs).toEqual([]);
  });
});
