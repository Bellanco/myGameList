// Saga compartida entre dos títulos: lo que hace que «Persona 5 Royal» y «Persona 3 Reloaded» sean parientes.
//
// Estas pruebas son el contrato de la función, y están escritas con títulos REALES a propósito: la regla no se
// puede validar en abstracto («dos palabras compartidas»), porque lo que decide si acierta o falla es cómo se
// llaman los juegos de verdad. Cada bloque de abajo es una de las decisiones de la cabecera del módulo, y los
// falsos positivos —parejas que empiezan igual sin tener nada que ver— pesan más que los aciertos: emparentar
// «Dead Space» con «Dead Cells» estropea el bloque de relacionadas, perder «Nier Automata» ~ «Nier Replicant»
// solo lo deja como estaba.
import { describe, expect, it } from 'vitest';
import { sharedSagaName } from '../../src/core/utils/gameSaga';
import { gameTitleKey } from '../../src/core/utils/gameTitleKey';

/** ¿Comparten saga? Es como lo lee quien la usa: el nombre existe o no existe. */
function shares(a: string, b: string): boolean {
  return Boolean(sharedSagaName(a, b));
}

describe('sharedSagaName — el caso del encargo', () => {
  it('relaciona dos entregas numeradas de la misma saga', () => {
    expect(sharedSagaName('Persona 5 Royal', 'Persona 3 Reloaded')).toBe('persona');
  });

  it('no confunde la entrega con la saga: el número no forma parte del nombre', () => {
    expect(sharedSagaName('Persona 5 Royal', 'Persona 5 Strikers')).toBe('persona');
  });
});

describe('sharedSagaName — con dos palabras que nombren algo ya basta', () => {
  it.each([
    ['Assassins Creed Odyssey', "Assassin's Creed Valhalla", 'assassins creed'],
    ['God of War', 'God of War Ragnarok', 'god of war'],
    ['Silent Hill 2', 'Silent Hill f', 'silent hill'],
    ['Mass Effect 2', 'Mass Effect Andromeda', 'mass effect'],
    ['Resident Evil 4', 'Resident Evil Village', 'resident evil'],
    ['Hollow Knight', 'Hollow Knight: Silksong', 'hollow knight'],
    ['A Plague Tale: Innocence', 'A Plague Tale: Requiem', 'a plague tale'],
  ])('%s ~ %s', (a, b, expected) => {
    expect(sharedSagaName(a, b)).toBe(expected);
  });

  it('el artículo inicial no estorba, porque la clave del título ya lo ha quitado', () => {
    expect(sharedSagaName('The Witcher 3: Wild Hunt', 'The Witcher II: Assassins of Kings')).toBe('witcher');
  });

  it('«Final Fantasy VII Remake» no es «Final Fantasy VII», pero sí es la misma saga', () => {
    expect(sharedSagaName('Final Fantasy VII', 'Final Fantasy VII Remake')).toBe('final fantasy');
  });
});

describe('sharedSagaName — una sola palabra necesita marca de serie', () => {
  it.each([
    ['Halo 3', 'Halo Infinite', 'halo'],
    ['Doom', 'Doom Eternal', 'doom'],
    ['Nioh', 'Nioh 2', 'nioh'],
    ['Portal', 'Portal 2', 'portal'],
    ['Yakuza 0', 'Yakuza Kiwami', 'yakuza'],
  ])('%s ~ %s', (a, b, expected) => {
    expect(sharedSagaName(a, b)).toBe(expected);
  });

  it('sin número ni título entero, una palabra compartida no es una saga', () => {
    // El precio asumido: sagas cuyas entregas solo se distinguen por subtítulo. Se pierden para no emparentar
    // todo lo que empieza por la misma palabra.
    expect(shares('Nier Automata', 'Nier Replicant')).toBe(false);
    expect(shares('Pokémon Rojo', 'Pokémon Escarlata')).toBe(false);
  });
});

describe('sharedSagaName — lo que NO hace saga', () => {
  it.each([
    // Empiezan igual y no tienen nada que ver: el falso positivo que hay que evitar.
    ['Dark Souls', 'Dark Sector'],
    ['Star Wars Jedi: Fallen Order', 'Star Ocean'],
    ['Dead Space', 'Dead Cells'],
    ['Metal Gear Solid', 'Metal Slug'],
    ['Super Mario Odyssey', 'Super Meat Boy'],
    ['Kingdom Hearts 3', 'Kingdom Come: Deliverance'],
    // Coincidir en preposiciones y artículos no dice nada.
    ['Call of Duty', 'Call of Cthulhu'],
    ['Shadow of the Colossus', 'Shadow of Mordor'],
    ['The Last of Us', 'The Last Guardian'],
    // Un título corto que resulta ser el comienzo de otro más largo.
    ['Journey', 'Journey to the Savage Planet'],
    // Números y pronombres sueltos por delante: no nombran ninguna saga.
    ['2 Fast', '2 Furious'],
    ['It Takes Two', 'It Follows'],
    ['El Shaddai', 'El Dorado'],
    // Nada en común.
    ['Elden Ring', 'Celeste'],
  ])('%s no comparte saga con %s', (a, b) => {
    expect(shares(a, b)).toBe(false);
  });
});

describe('sharedSagaName — bordes', () => {
  // Es como la llama `rankRelatedReviews`, que ya tiene las claves calculadas para cruzar los nombres. Si
  // `gameTitleKey` dejase de ser idempotente, el bloque de relacionadas perdería la saga sin decir nada.
  it('da el mismo resultado con el título o con su clave ya calculada', () => {
    const pairs: Array<[string, string]> = [
      ['The Witcher 3: Wild Hunt', 'The Witcher II: Assassins of Kings'],
      ['Final Fantasy VII', 'Final Fantasy VII Remake'],
      ['Persona 5 Royal', 'Persona 3 Reloaded'],
      ['The Last of Us', 'The Last Guardian'],
    ];

    for (const [a, b] of pairs) {
      expect(sharedSagaName(gameTitleKey(a), gameTitleKey(b))).toBe(sharedSagaName(a, b));
    }
  });

  it('un título consigo mismo comparte su propia saga', () => {
    expect(sharedSagaName('Elden Ring', 'ELDEN RING')).toBe('elden ring');
  });

  it('sin título no hay saga', () => {
    expect(sharedSagaName('', 'Persona 5')).toBe('');
    expect(sharedSagaName('Persona 5', '')).toBe('');
    expect(sharedSagaName('  ', '  ')).toBe('');
  });

  it('un título que solo lleva palabras de función no nombra ninguna saga', () => {
    expect(shares('The It', 'The It Crowd')).toBe(false);
  });
});
