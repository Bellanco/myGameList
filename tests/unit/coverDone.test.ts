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

function apunta(nombre: string, plataformas: string[]): void {
  const hechos = leerHechos();
  hechos.add(claveDeJuego(nombre, plataformas));
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

  /* Lo que resolvió el modo ampliado (retirado; admitía DLC y packs, que dan PEORES emparejamientos) no puede
     servirle de alias a nadie. */
  it('lo resuelto en el modo ampliado no sirve de alias', () => {
    localStorage.setItem('mis-listas-covers-done-v2', `Hollow Knight\u0001Steam\u0001x`);

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
    expect(peticionDeCaratula('Celeste', ['Switch'], ajena)).toEqual({
      nombre: 'Celeste',
      plataformas: ['Switch'],
      soloCache: true,
    });
  });

  it('uno que ya resolviste se pide como lo pediste tú, y entonces sin la marca', () => {
    apunta('Hollow Knight', ['Steam']);

    expect(peticionDeCaratula('Hollow Knight', ['Switch'], ajena)).toEqual({
      nombre: 'Hollow Knight',
      plataformas: ['Steam'],
      soloCache: false,
    });
  });

  /* `gameTitleKey` borra el apóstrofe; la clave del servidor lo pasa a espacio. Con el nombre ajeno y sin la
     marca, «Marvel's» era una clave que el servidor no tenía y la resolvía: el gasto que `c=1` evita. */
  it('con el título escrito de otra manera, la URL lleva TU nombre, que es el que el servidor tiene', () => {
    apunta('Marvels Spider-Man', ['PC']);

    expect(peticionDeCaratula("Marvel's Spider-Man", ['PS4'], ajena)).toEqual({
      nombre: 'Marvels Spider-Man',
      plataformas: ['PC'],
      soloCache: false,
    });
  });

  it('sin `preferirConocidas` no se mira el índice', () => {
    apunta('Hollow Knight', ['Steam']);

    expect(peticionDeCaratula('Hollow Knight', ['Switch'], { preferirConocidas: false, soloCache: true }))
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
    guardarHechos(new Set([claveDeJuego('Jotum', ['Steam'])]));
    reiniciarMemoriaDeCaratulas();
    reiniciarIndiceDeCaratulas();
  }

  it('pasado un día, borra el «no» y lo devuelve a la cola del recorrido', () => {
    sinPortadaDesdeHace(2 * DIA);

    expect(reabrirLaPregunta('Jotum', ['Steam'])).toBe(true);

    // Las DOS memorias: sin la primera el listado no pide la imagen, y sin la segunda el recorrido —que es el
    // único que aprende de la respuesta— no vuelve a preguntar por ella.
    expect(sabemosQueNoTiene(coverUrl('Jotum', ['Steam']))).toBe(false);
    expect(leerHechos().has(claveDeJuego('Jotum', ['Steam']))).toBe(false);
  });

  it('pero el mismo día no toca nada', () => {
    sinPortadaDesdeHace(60 * 60 * 1000); // una hora

    expect(reabrirLaPregunta('Jotum', ['Steam'])).toBe(false);

    expect(sabemosQueNoTiene(coverUrl('Jotum', ['Steam']))).toBe(true);
    expect(leerHechos().has(claveDeJuego('Jotum', ['Steam']))).toBe(true);
  });

  it('y a un juego que ya tiene carátula, editarlo no le cuesta nada', () => {
    guardarHechos(new Set([claveDeJuego('Celeste', ['Steam'])]));

    expect(reabrirLaPregunta('Celeste', ['Steam'])).toBe(false);

    // Lo ya recorrido sigue intacto: no se ha reabierto ninguna petición por guardar una reseña.
    expect(leerHechos().has(claveDeJuego('Celeste', ['Steam']))).toBe(true);
  });

  it('no se lía con un juego sin nombre', () => {
    expect(reabrirLaPregunta('', ['Steam'])).toBe(false);
  });

});

/* EL MODO AMPLIADO (`x=1`) SE RETIRÓ el 08-10-2026: doblaba consultas a IGDB y escrituras de KV, y al llegar el
   claim de la administración cambiaba la URL de cada carátula pintada. Lo que dejó apuntado en el navegador de
   quien lo usó no debe volver a contar como trabajo hecho ni como «no tiene». */
describe('lo que dejó el modo ampliado', () => {
  const SEP = '\u0001';

  it('sus apuntes de «hecho» se tiran al leer, y los normales se quedan', () => {
    localStorage.setItem('mis-listas-covers-done-v2', [`Celeste${SEP}Steam${SEP}x`, `Celeste${SEP}Steam`].join('\n'));

    expect([...leerHechos()]).toEqual([claveDeJuego('Celeste', ['Steam'])]);
  });

  it('de la lista del formato anterior no se traducen sus URL', () => {
    localStorage.setItem(
      'mis-listas-covers-done',
      JSON.stringify(['/cover?n=Celeste&p=Steam&x=1', coverUrl('Portal', ['Steam'])]),
    );

    expect([...leerHechos()]).toEqual([claveDeJuego('Portal', ['Steam'])]);
  });

  it('sus «no tiene» no se cargan: el juego se vuelve a pedir en modo normal', () => {
    localStorage.setItem(
      'mis-listas-covers-none',
      JSON.stringify({ '/cover?n=Jotum&p=Steam&x=1': Date.now(), [coverUrl('Max Paine 3', ['Steam'])]: Date.now() }),
    );

    expect(sabemosQueNoTiene('/cover?n=Jotum&p=Steam&x=1')).toBe(false);
    expect(sabemosQueNoTiene(coverUrl('Max Paine 3', ['Steam']))).toBe(true);
  });
});
