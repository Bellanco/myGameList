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
  peticionDeCaratula,
  plataformasYaPedidas,
  reabrirLaPregunta,
  reiniciarIndiceDeCaratulas,
} from '../../src/core/utils/coverDone';
import { reiniciarMemoriaDeCaratulas, sabemosQueNoTiene } from '../../src/core/utils/coverMemory';
import { coverUrl } from '../../src/core/utils/coverUrl';

function apunta(nombre: string, plataformas: string[], ampliado = false): void {
  const hechos = leerHechos();
  hechos.add(claveDeJuego(nombre, plataformas, ampliado));
  guardarHechos(hechos);
}

beforeEach(() => {
  localStorage.clear();
  reiniciarIndiceDeCaratulas();
  reiniciarMemoriaDeCaratulas();
});

afterEach(() => {
  localStorage.clear();
  reiniciarIndiceDeCaratulas();
  reiniciarMemoriaDeCaratulas();
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

/* CÓMO SE PIDE LA CARÁTULA DE UN JUEGO AJENO. Sin la marca `c=1` el servidor resuelve lo que no tiene, y eso es
   una consulta a IGDB y una escritura de KV; por eso la marca solo se quita cuando la URL es EXACTAMENTE una que
   ya resolvió tu recorrido, nombre incluido. */
describe('la petición de una carátula ajena', () => {
  const ajena = { preferirConocidas: true, soloCache: true };

  it('un título que no consta se pide con lo suyo y solo de lo ya resuelto', () => {
    expect(peticionDeCaratula('Celeste', ['Switch'], false, ajena)).toEqual({
      nombre: 'Celeste',
      plataformas: ['Switch'],
      soloCache: true,
    });
  });

  it('uno que ya resolviste se pide como lo pediste tú, y entonces sin la marca', () => {
    apunta('Hollow Knight', ['Steam']);

    expect(peticionDeCaratula('Hollow Knight', ['Switch'], false, ajena)).toEqual({
      nombre: 'Hollow Knight',
      plataformas: ['Steam'],
      soloCache: false,
    });
  });

  /* `gameTitleKey` borra el apóstrofe; la clave del servidor lo pasa a espacio. Con el nombre ajeno y sin la
     marca, «Marvel's» era una clave que el servidor no tenía y la resolvía: el gasto que `c=1` evita. */
  it('con el título escrito de otra manera, la URL lleva TU nombre, que es el que el servidor tiene', () => {
    apunta('Marvels Spider-Man', ['PC']);

    expect(peticionDeCaratula("Marvel's Spider-Man", ['PS4'], false, ajena)).toEqual({
      nombre: 'Marvels Spider-Man',
      plataformas: ['PC'],
      soloCache: false,
    });
  });

  it('en modo ampliado conserva la marca: ese espacio de claves no lo ha recorrido nadie aquí', () => {
    apunta('Hollow Knight', ['Steam']);

    expect(peticionDeCaratula('Hollow Knight', ['Switch'], true, ajena).soloCache).toBe(true);
  });

  it('sin `preferirConocidas` no se mira el índice', () => {
    apunta('Hollow Knight', ['Steam']);

    expect(peticionDeCaratula('Hollow Knight', ['Switch'], false, { preferirConocidas: false, soloCache: true }))
      .toEqual({ nombre: 'Hollow Knight', plataformas: ['Switch'], soloCache: true });
  });
});

/* GUARDAR UN JUEGO SIN PORTADA ES PEDIR QUE SE LE BUSQUE OTRA VEZ: quien edita está mirando ese juego y se ha
   fijado en el hueco. Es el atajo al plazo de noventa días, con un mínimo de un día para que ordenar la
   biblioteca una tarde no se convierta en una ráfaga de peticiones. */
describe('reabrir la pregunta al editar un juego', () => {
  const DIA = 24 * 60 * 60 * 1000;
  const CLAVE_NONE = 'mis-listas-covers-none';

  /** Un juego sin carátula, dado por recorrido, con el «no» apuntado hace lo que se diga. */
  function sinPortadaDesdeHace(ms: number): void {
    const url = coverUrl('Jotum', ['Steam']);
    localStorage.setItem(CLAVE_NONE, JSON.stringify({ [url]: Date.now() - ms }));
    guardarHechos(new Set([claveDeJuego('Jotum', ['Steam'], false)]));
    reiniciarMemoriaDeCaratulas();
    reiniciarIndiceDeCaratulas();
  }

  it('pasado un día, borra el «no» y lo devuelve a la cola del recorrido', () => {
    sinPortadaDesdeHace(2 * DIA);

    expect(reabrirLaPregunta('Jotum', ['Steam'])).toBe(true);

    // Las DOS memorias: sin la primera el listado no pide la imagen, y sin la segunda el recorrido —que es el
    // único que aprende de la respuesta— no vuelve a preguntar por ella.
    expect(sabemosQueNoTiene(coverUrl('Jotum', ['Steam']))).toBe(false);
    expect(leerHechos().has(claveDeJuego('Jotum', ['Steam'], false))).toBe(false);
  });

  it('pero el mismo día no toca nada', () => {
    sinPortadaDesdeHace(60 * 60 * 1000); // una hora

    expect(reabrirLaPregunta('Jotum', ['Steam'])).toBe(false);

    expect(sabemosQueNoTiene(coverUrl('Jotum', ['Steam']))).toBe(true);
    expect(leerHechos().has(claveDeJuego('Jotum', ['Steam'], false))).toBe(true);
  });

  it('y a un juego que ya tiene carátula, editarlo no le cuesta nada', () => {
    guardarHechos(new Set([claveDeJuego('Celeste', ['Steam'], false)]));

    expect(reabrirLaPregunta('Celeste', ['Steam'])).toBe(false);

    // Lo ya recorrido sigue intacto: no se ha reabierto ninguna petición por guardar una reseña.
    expect(leerHechos().has(claveDeJuego('Celeste', ['Steam'], false))).toBe(true);
  });

  it('no se lía con un juego sin nombre', () => {
    expect(reabrirLaPregunta('', ['Steam'])).toBe(false);
  });

  /* El modo ampliado tiene su propio espacio de claves, y quien edita no tiene por qué saber en cuál está
     mirando: se reabren los dos o no se reabre ninguno. */
  it('reabre también el espacio del modo ampliado', () => {
    const url = coverUrl('Jotum', ['Steam'], true);
    localStorage.setItem(CLAVE_NONE, JSON.stringify({ [url]: Date.now() - 2 * DIA }));
    guardarHechos(new Set([claveDeJuego('Jotum', ['Steam'], true)]));
    reiniciarMemoriaDeCaratulas();

    expect(reabrirLaPregunta('Jotum', ['Steam'])).toBe(true);

    expect(sabemosQueNoTiene(url)).toBe(false);
    expect(leerHechos().has(claveDeJuego('Jotum', ['Steam'], true))).toBe(false);
  });
});
