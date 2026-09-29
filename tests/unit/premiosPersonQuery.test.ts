import { describe, expect, it } from 'vitest';
import { nombreDeInterprete } from '../../src/core/premios/personQuery';

describe('nombreDeInterprete', () => {
  // Con el juego detrás, la búsqueda de personas de TMDB no devuelve nada: se busca solo el actor.
  it('quita el juego de «Actor - Juego»', () => {
    expect(nombreDeInterprete('Troy Baker - The Last of Us')).toBe('Troy Baker');
    expect(nombreDeInterprete('Cameron Monaghan - Star Wars Jedi: Survivor')).toBe('Cameron Monaghan');
    expect(nombreDeInterprete('  Christopher   Judge  -  God of War Ragnarök ')).toBe('Christopher Judge');
  });

  it('acepta los separadores que se escriben a mano', () => {
    expect(nombreDeInterprete('Troy Baker – The Last of Us')).toBe('Troy Baker');
    expect(nombreDeInterprete('Troy Baker—The Last of Us')).toBe('Troy Baker');
    expect(nombreDeInterprete('Troy Baker -The Last of Us')).toBe('Troy Baker');
    expect(nombreDeInterprete('Troy Baker- The Last of Us')).toBe('Troy Baker');
    expect(nombreDeInterprete('Troy Baker: The Last of Us')).toBe('Troy Baker');
    expect(nombreDeInterprete('Troy Baker (The Last of Us)')).toBe('Troy Baker');
    expect(nombreDeInterprete('Troy Baker | The Last of Us')).toBe('Troy Baker');
  });

  // El guion pegado es parte del nombre, no un separador.
  it('respeta los nombres compuestos con guion', () => {
    expect(nombreDeInterprete('Jean-Claude Van Damme - Mortal Kombat 1')).toBe('Jean-Claude Van Damme');
    expect(nombreDeInterprete('Ruiz-Esparza')).toBe('Ruiz-Esparza');
  });

  it('sin separador, o sin nada delante, busca el nombre entero', () => {
    expect(nombreDeInterprete('Troy Baker')).toBe('Troy Baker');
    expect(nombreDeInterprete('- Troy Baker')).toBe('- Troy Baker');
    expect(nombreDeInterprete('   ')).toBe('');
  });
});
