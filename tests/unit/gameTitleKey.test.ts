// Clave de título: reconocer el MISMO juego escrito por dos manos distintas.
//
// La mitad de este fichero comprueba lo que la clave NO debe fundir, y esa mitad es la que importa. Cada regla de
// las que casan más títulos abre la puerta a fusionar dos juegos distintos, y ahí es donde esto se rompe de
// verdad: un acierto que se pierde solo quita una tarjeta del bloque de relacionadas; un juego fundido con otro
// pone la opinión de alguien sobre un juego que no es.
import { describe, expect, it } from 'vitest';
import { gameTitleKey } from '../../src/core/utils/gameTitleKey';

/** ¿Estos dos títulos son, para el cruce, el mismo juego? */
function casan(a: string, b: string): boolean {
  const key = gameTitleKey(a);
  return Boolean(key) && key === gameTitleKey(b);
}

describe('gameTitleKey — lo que SÍ es el mismo juego', () => {
  it('mayúsculas y espacios sobrantes', () => {
    expect(casan('  ELDEN RING ', 'Elden Ring')).toBe(true);
  });

  it('puntuación, apóstrofes y guiones', () => {
    expect(casan("Marvel's Spider-Man", 'Marvels Spider Man')).toBe(true);
    expect(casan('Ori and the Blind Forest', 'Ori & the Blind Forest')).toBe(true);
    expect(casan('NieR: Automata', 'Nier Automata')).toBe(true);
  });

  it('acentos y símbolos de marca', () => {
    expect(casan('Pokémon Rojo', 'Pokemon Rojo')).toBe(true);
    expect(casan('Street Fighter™ 6', 'Street Fighter 6')).toBe(true);
  });

  it('el artículo inicial en inglés', () => {
    expect(casan('The Last of Us', 'Last of Us')).toBe(true);
  });

  it('sufijos de reedición, encadenados incluidos', () => {
    expect(casan('Dark Souls Remastered', 'Dark Souls')).toBe(true);
    expect(casan('The Witcher 3: Wild Hunt – Game of the Year Edition', 'The Witcher 3 Wild Hunt')).toBe(true);
    expect(casan('Okami HD', 'Okami')).toBe(true);
    expect(casan('Death Stranding Director’s Cut', 'Death Stranding')).toBe(true);
    expect(casan('Skyrim Special Edition HD', 'Skyrim')).toBe(true);
  });

  it('números romanos de dos o más cifras', () => {
    expect(casan('Final Fantasy VII', 'Final Fantasy 7')).toBe(true);
    expect(casan('Final Fantasy XIII', 'Final Fantasy 13')).toBe(true);
    expect(casan('Grand Theft Auto V', 'Grand Theft Auto 5')).toBe(true);
  });
});

describe('gameTitleKey — lo que NO debe fundir', () => {
  it('una secuela no es su original: los números nunca se borran', () => {
    expect(casan('Nioh', 'Nioh 2')).toBe(false);
    expect(casan('Portal', 'Portal 2')).toBe(false);
  });

  it('dos entregas romanas seguidas siguen siendo dos', () => {
    expect(casan('Final Fantasy VII', 'Final Fantasy VIII')).toBe(false);
    expect(casan('Final Fantasy VII', 'Final Fantasy 8')).toBe(false);
  });

  it('un REMAKE no es una reedición del original', () => {
    // El peor falso positivo posible: dos obras distintas, de dos épocas distintas, cuyas reseñas no hablan de lo
    // mismo. Por eso «remake» no está —ni puede estar— en la lista de sufijos.
    expect(casan('Final Fantasy VII Remake', 'Final Fantasy VII')).toBe(false);
    expect(casan('Resident Evil 2 Remake', 'Resident Evil 2')).toBe(false);
    expect(casan('Final Fantasy VII Rebirth', 'Final Fantasy VII Remake')).toBe(false);
  });

  it('la equis suelta es una letra, no un diez', () => {
    // «Mega Man X» y «Mega Man 10» son dos juegos y los dos existen: convertir la equis suelta fundiría dos
    // series enteras. El precio es que «Final Fantasy X» no casa con «Final Fantasy 10», y se paga a gusto.
    expect(casan('Mega Man X', 'Mega Man 10')).toBe(false);
    expect(casan('Final Fantasy X', 'Final Fantasy 10')).toBe(false);
  });

  it('la i suelta es una palabra inglesa, no un uno', () => {
    expect(gameTitleKey('I Am Setsuna')).toBe('i am setsuna');
  });

  it('títulos que solo comparten el género o una palabra', () => {
    expect(casan('Hollow Knight', 'Hollow Knight Silksong')).toBe(false);
    expect(casan('Dark Souls', 'Demon’s Souls')).toBe(false);
  });
});

describe('gameTitleKey — bordes', () => {
  it('un título que es SOLO un sufijo de reedición se conserva entero', () => {
    // Recortarlo dejaría la clave vacía, y una clave vacía no casa con nada: la reseña desaparecería del bloque.
    expect(gameTitleKey('Remastered')).toBe('remastered');
    expect(gameTitleKey('HD')).toBe('hd');
  });

  it('conserva los títulos que no se escriben en alfabeto latino', () => {
    // Con un filtro `[^a-z0-9]` estos quedaban en blanco y, con la clave vacía, todos habrían casado entre sí.
    expect(gameTitleKey('新・光神話 パルテナの鏡')).not.toBe('');
    expect(casan('Тетрис', 'Тетрис')).toBe(true);
  });

  it('un nombre vacío o solo puntuación no es un título', () => {
    expect(gameTitleKey('')).toBe('');
    expect(gameTitleKey('   ')).toBe('');
    expect(gameTitleKey('---')).toBe('');
  });

  it('el artículo español se queda: forma parte del nombre', () => {
    expect(gameTitleKey('La-Mulana')).toBe('la mulana');
    expect(gameTitleKey('El Shaddai')).toBe('el shaddai');
  });
});
