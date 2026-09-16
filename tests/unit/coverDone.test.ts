// La memoria de qué juegos tienen ya carátula resuelta en este navegador, y el índice que se deriva de ella.
//
// Lo que se protege aquí es lo que ahorra peticiones: que el mismo juego con OTRA estantería detrás —el caso de
// una biblioteca ajena— se pida con las plataformas que ya funcionaron, de modo que la URL sea la que el
// navegador tiene guardada y no salga nada a la red.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  claveDeJuego,
  guardarHechos,
  leerHechos,
  plataformasYaPedidas,
  reiniciarIndiceDeCaratulas,
} from '../../src/core/utils/coverDone';

function apunta(nombre: string, plataformas: string[], ampliado = false): void {
  const hechos = leerHechos();
  hechos.add(claveDeJuego(nombre, plataformas, ampliado));
  guardarHechos(hechos);
}

beforeEach(() => {
  localStorage.clear();
  reiniciarIndiceDeCaratulas();
});

afterEach(() => {
  localStorage.clear();
  reiniciarIndiceDeCaratulas();
});

describe('carátulas ya resueltas', () => {
  it('recuerda con qué plataformas se pidió cada título', () => {
    apunta('Hollow Knight', ['Steam']);

    expect(plataformasYaPedidas('Hollow Knight')).toEqual(['Steam']);
  });

  /* ES LO QUE AHORRA LA DESCARGA. La URL de la carátula lleva las plataformas dentro, así que el mismo juego en
     dos estanterías distintas eran dos URL, dos descargas y dos sitios en la caché — y, si normalizaban
     distinto, dos emparejamientos en el servidor. */
  it('el mismo juego en otra estantería se pide con las plataformas que ya funcionaron', () => {
    apunta('Hollow Knight', ['Steam']);

    // Así llega en la biblioteca de otra persona.
    expect(plataformasYaPedidas('hollow knight')).toEqual(['Steam']);
  });

  // El título se compara con la misma regla que usa el resto de la aplicación (`gameTitleKey`): acentos,
  // mayúsculas y puntuación no hacen de dos juegos dos.
  it('reconoce el título escrito de otra manera', () => {
    apunta('Pokémon Rojo', ['Game Boy']);

    expect(plataformasYaPedidas('Pokemon Rojo')).toEqual(['Game Boy']);
  });

  it('de un título que no consta no dice nada, y entonces se piden sus propias plataformas', () => {
    apunta('Hollow Knight', ['Steam']);

    expect(plataformasYaPedidas('Celeste')).toBeNull();
    expect(plataformasYaPedidas('')).toBeNull();
  });

  /* El modo ampliado vive en otro espacio de claves y da PEORES emparejamientos (admite DLC y packs): lo que se
     resolvió con él no puede servirle de alias a nadie. */
  it('lo resuelto en modo ampliado no sirve de alias', () => {
    apunta('Hollow Knight', ['Steam'], true);

    expect(plataformasYaPedidas('Hollow Knight')).toBeNull();
  });

  // El índice se guarda en memoria para no recorrer tres mil apuntes por cada caja del mosaico, así que tiene
  // que enterarse de lo que se apunte después: si no, el recorrido de fondo llenaría la lista y nadie lo vería.
  it('se entera de lo que se apunta después de haberlo consultado', () => {
    expect(plataformasYaPedidas('Celeste')).toBeNull();

    apunta('Celeste', ['Switch']);

    expect(plataformasYaPedidas('Celeste')).toEqual(['Switch']);
  });

  it('sobrevive a una recarga, que es de lo que sirve guardarlo', () => {
    apunta('Hollow Knight', ['Steam']);
    reiniciarIndiceDeCaratulas(); // como volver a abrir la aplicación: solo queda lo escrito

    expect(plataformasYaPedidas('Hollow Knight')).toEqual(['Steam']);
  });
});
