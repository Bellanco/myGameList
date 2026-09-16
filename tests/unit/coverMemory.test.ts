// La memoria de «este juego no tiene carátula»: qué calla y qué vuelve a abrir la pregunta.
//
// Su razón de ser es que el 404 de una carátula que no existe no lo cachea NADIE —ni el navegador ni el service
// worker guardan lo que no es un 200, y es deliberado—, así que sin esta lista los mismos veinte juegos sin
// imagen volvían a preguntarse en cada visita. Por eso el «no» no caduca: reintentar por tiempo es una fuga
// pequeña pero constante, y de esas preguntas casi ninguna cambia de respuesta.
//
// LA VÍA DE VUELTA ES EL TÍTULO, que es además la causa real de la mayoría de los «no»: una errata. Esta memoria
// se guarda por la URL de la carátula y la URL lleva el nombre dentro, así que corregirlo da una URL que aquí no
// consta y el juego se pide otra vez. Eso es lo que más se comprueba en este fichero.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  olvidarQueNoTiene,
  recordarQueNoTiene,
  reiniciarMemoriaDeCaratulas,
  sabemosQueNoTiene,
} from '../../src/core/utils/coverMemory';
import { coverUrl } from '../../src/core/utils/coverUrl';

const CLAVE = 'mis-listas-covers-none';

beforeEach(() => {
  localStorage.clear();
  reiniciarMemoriaDeCaratulas();
});

afterEach(() => {
  localStorage.clear();
  reiniciarMemoriaDeCaratulas();
});

describe('memoria de los juegos sin carátula', () => {
  it('un «no tiene» calla la petición, y la sigue callando', () => {
    const url = coverUrl('Jotum', ['Steam']);
    recordarQueNoTiene(url);

    expect(sabemosQueNoTiene(url)).toBe(true);

    // Y en la siguiente sesión sigue igual: lo apuntado no envejece. Es lo que cierra la fuga de repetir en
    // cada visita los mismos 404 por los juegos que no van a tener imagen.
    reiniciarMemoriaDeCaratulas();
    expect(sabemosQueNoTiene(url)).toBe(true);
  });

  /* LA COMPROBACIÓN QUE IMPORTA: corregir el título reabre la pregunta. Es la única vía de vuelta que queda, así
     que si esto se rompiera, un juego mal escrito se quedaría sin carátula para siempre por mucho que se
     arreglara su nombre. */
  it('corregir el título vuelve a abrir la pregunta', () => {
    recordarQueNoTiene(coverUrl('Max Paine 3', ['Steam']));

    // El nombre bien escrito es otra URL, y de esa no consta nada: el listado la pedirá.
    expect(sabemosQueNoTiene(coverUrl('Max Payne 3', ['Steam']))).toBe(false);
    // Y el mal escrito sigue callado, por si el juego se queda como estaba.
    expect(sabemosQueNoTiene(coverUrl('Max Paine 3', ['Steam']))).toBe(true);
  });

  // Cambiar de plataforma también cambia la URL: es parte de la pregunta que se le hace al emparejador (el
  // «Hook» de Mega Drive no es el de móvil), así que un «no» de una estantería no habla por la otra.
  it('y cambiar la plataforma también', () => {
    recordarQueNoTiene(coverUrl('Hook', ['Steam']));

    expect(sabemosQueNoTiene(coverUrl('Hook', ['Mega Drive']))).toBe(false);
  });

  it('si aparece la carátula, se olvida del todo', () => {
    const url = coverUrl('Jotum', ['Steam']);
    recordarQueNoTiene(url);

    olvidarQueNoTiene(url);

    expect(sabemosQueNoTiene(url)).toBe(false);
  });

  /* Hubo una versión intermedia que fechaba cada «no» para reintentarlo a la semana, y se deshizo. Lo que
     escribió se sigue leyendo: nadie tiene que volver a recorrer su biblioteca por un formato que vivió dos
     días. */
  it('lee lo que escribió la versión que fechaba cada «no»', () => {
    const url = coverUrl('Jotum', ['Steam']);
    localStorage.setItem(CLAVE, JSON.stringify({ [url]: Date.now() - 999_999 }));
    reiniciarMemoriaDeCaratulas();

    expect(sabemosQueNoTiene(url)).toBe(true);
  });

  it('sin nada apuntado se pregunta por todo', () => {
    expect(sabemosQueNoTiene(coverUrl('Celeste', ['Steam']))).toBe(false);
  });
});
