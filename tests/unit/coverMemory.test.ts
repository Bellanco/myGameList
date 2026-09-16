// La memoria de «este juego no tiene carátula»: qué calla, cuánto y qué vuelve a abrir la pregunta.
//
// Su razón de ser es que el 404 de una carátula que no existe no lo cachea NADIE —ni el navegador ni el service
// worker guardan lo que no es un 200, y es deliberado—, así que sin esta lista los mismos juegos sin imagen se
// preguntaban en cada visita.
//
// Y tiene TRES vías de vuelta, que es lo que más se comprueba aquí, porque entre las tres sostienen que nada se
// quede clavado sin convertirse en una fuga de peticiones:
//   · el plazo largo (noventa días), para el juego que estrena ficha en IGDB después;
//   · editar el juego, que es quien mira diciendo «vuelve a intentarlo» (con un mínimo de un día);
//   · corregir el título, que cambia la URL entera y por tanto la pregunta.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MINIMO_TRAS_EDICION,
  hayQueReintentarAlgo,
  olvidarQueNoTiene,
  recordarQueNoTiene,
  reiniciarMemoriaDeCaratulas,
  sabemosQueNoTiene,
  tocaReintentar,
} from '../../src/core/utils/coverMemory';
import { coverUrl } from '../../src/core/utils/coverUrl';

const CLAVE = 'mis-listas-covers-none';
const DIA = 24 * 60 * 60 * 1000;
const URL = coverUrl('Jotum', ['Steam']);

/** Deja una marca escrita con la antigüedad que se quiera, como si la hubiera puesto otra sesión. */
function marcaDeHace(ms: number, url = URL): void {
  localStorage.setItem(CLAVE, JSON.stringify({ [url]: Date.now() - ms }));
  reiniciarMemoriaDeCaratulas();
}

beforeEach(() => {
  localStorage.clear();
  reiniciarMemoriaDeCaratulas();
});

afterEach(() => {
  localStorage.clear();
  reiniciarMemoriaDeCaratulas();
});

describe('memoria de los juegos sin carátula', () => {
  it('un «no tiene» reciente calla la petición', () => {
    recordarQueNoTiene(URL);

    expect(sabemosQueNoTiene(URL)).toBe(true);
    expect(tocaReintentar(URL)).toBe(false);
    expect(hayQueReintentarAlgo()).toBe(false);
  });

  // Un mes y medio después sigue callado: el plazo es largo a propósito, para que revisar cueste cuatro
  // preguntas al año por juego y no cincuenta.
  it('y lo sigue callando durante meses', () => {
    marcaDeHace(45 * DIA);

    expect(sabemosQueNoTiene(URL)).toBe(true);
    expect(hayQueReintentarAlgo()).toBe(false);
  });

  it('a los noventa días vuelve a preguntarse', () => {
    marcaDeHace(91 * DIA);

    expect(sabemosQueNoTiene(URL)).toBe(false);
    expect(tocaReintentar(URL)).toBe(true);
    expect(hayQueReintentarAlgo()).toBe(true);
  });

  /* EL ATAJO DE LA EDICIÓN. Quien guarda la ficha de un juego sin portada está mirando ese juego, así que se le
     escucha antes que al plazo general — pero no antes de un día, o editar tres campos seguidos de diez juegos
     serían treinta peticiones en un minuto. */
  it('editar el juego reabre la pregunta pasado un día, no antes', () => {
    marcaDeHace(2 * DIA);
    expect(tocaReintentar(URL, MINIMO_TRAS_EDICION)).toBe(true);
    // Y el plazo general sigue sin cumplirse: son dos relojes distintos sobre la misma marca.
    expect(tocaReintentar(URL)).toBe(false);

    marcaDeHace(60 * 60 * 1000); // una hora
    expect(tocaReintentar(URL, MINIMO_TRAS_EDICION)).toBe(false);
  });

  /* Volver a apuntarlo es volver a preguntarlo y recibir el mismo no: se calla otro plazo entero en vez de
     repetir la pregunta en cada visita, que es lo que esta memoria existe para evitar. */
  it('si se vuelve a preguntar y sigue sin tenerla, se calla otros noventa días', () => {
    marcaDeHace(91 * DIA);
    expect(tocaReintentar(URL)).toBe(true);

    recordarQueNoTiene(URL);

    expect(tocaReintentar(URL)).toBe(false);
    expect(sabemosQueNoTiene(URL)).toBe(true);
  });

  it('y si aparece la carátula, se olvida del todo', () => {
    recordarQueNoTiene(URL);

    olvidarQueNoTiene(URL);

    expect(sabemosQueNoTiene(URL)).toBe(false);
    expect(tocaReintentar(URL)).toBe(false); // no consta: no hay nada que reintentar
  });

  /* LA TERCERA VÍA, y la más inmediata: la memoria se guarda por la URL de la carátula y la URL lleva el nombre
     dentro, así que un título corregido —la causa real de la mayoría de los «no»— no hereda nada. */
  it('corregir el título vuelve a abrir la pregunta al instante', () => {
    recordarQueNoTiene(coverUrl('Max Paine 3', ['Steam']));

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

  /* Del formato anterior —una lista de URL sin fecha— no se sabe cuándo se apuntó cada una. Se les da la fecha
     de AHORA y no una del pasado: darlas por cumplidas de golpe haría que el primer arranque tras actualizar
     saliera preguntando a la vez por todos los juegos sin carátula de la biblioteca. */
  it('lo apuntado con el formato anterior no provoca una ráfaga al actualizar', () => {
    localStorage.setItem(CLAVE, JSON.stringify([URL, coverUrl('Otro', ['Steam'])]));
    reiniciarMemoriaDeCaratulas();

    expect(sabemosQueNoTiene(URL)).toBe(true);
    expect(hayQueReintentarAlgo()).toBe(false);
  });

  it('sin nada apuntado no hay nada que reintentar, y se pregunta por todo', () => {
    expect(sabemosQueNoTiene(URL)).toBe(false);
    expect(hayQueReintentarAlgo()).toBe(false);
  });
});
