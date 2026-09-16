// La memoria de «este juego no tiene carátula», que ahora CADUCA.
//
// Empezó siendo una lista sin fecha, o sea un «no» definitivo: un juego que no tenía carátula el día que se
// preguntó no la volvía a pedir nunca en ese navegador. Y eso convertía en permanente algo que no lo es —IGDB
// añade fichas— además de anular la caché negativa del servidor, que sí caduca a la semana. Lo que se protege
// aquí es el plazo y, sobre todo, que el olvido no cueste peticiones de más mientras no toca.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  hayQueReintentarAlgo,
  olvidarQueNoTiene,
  recordarQueNoTiene,
  reiniciarMemoriaDeCaratulas,
  sabemosQueNoTiene,
  tocaReintentar,
} from '../../src/core/utils/coverMemory';

const CLAVE = 'mis-listas-covers-none';
const SEMANA = 7 * 24 * 60 * 60 * 1000;
const URL = '/cover?n=Jotum&p=Steam';

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

  it('y cumplida la semana vuelve a preguntarse', () => {
    marcaDeHace(SEMANA + 1000);

    expect(sabemosQueNoTiene(URL)).toBe(false);
    expect(tocaReintentar(URL)).toBe(true);
    expect(hayQueReintentarAlgo()).toBe(true);
  });

  it('justo antes de cumplirla, todavía no', () => {
    marcaDeHace(SEMANA - 60_000);

    expect(sabemosQueNoTiene(URL)).toBe(true); // sigue vigente: no se pide la imagen
    expect(tocaReintentar(URL)).toBe(false);
  });

  /* Volver a apuntarlo es volver a preguntarlo y recibir el mismo no: se calla otra semana en vez de repetir la
     pregunta en cada visita, que es justo lo que esta memoria existe para evitar. */
  it('si se vuelve a preguntar y sigue sin tenerla, se calla otra semana', () => {
    marcaDeHace(SEMANA + 1000);
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

  /* Del formato anterior —una lista de URL sin fecha— no se sabe cuándo se apuntó cada una. Se les da la fecha
     de AHORA y no una del pasado: darlas por caducadas de golpe haría que el primer arranque tras actualizar
     saliera preguntando a la vez por todos los juegos sin carátula de la biblioteca. */
  it('lo apuntado con el formato anterior no provoca una ráfaga al actualizar', () => {
    localStorage.setItem(CLAVE, JSON.stringify([URL, '/cover?n=Otro&p=Steam']));
    reiniciarMemoriaDeCaratulas();

    expect(sabemosQueNoTiene(URL)).toBe(true);
    expect(hayQueReintentarAlgo()).toBe(false);
  });

  it('sin nada apuntado no hay nada que reintentar, y se pregunta por todo', () => {
    expect(sabemosQueNoTiene(URL)).toBe(false);
    expect(hayQueReintentarAlgo()).toBe(false);
  });
});
