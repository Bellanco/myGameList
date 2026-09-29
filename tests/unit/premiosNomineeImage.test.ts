import { describe, expect, it } from 'vitest';
import { nomineeImageOf, nomineeImageUrls, posterUrl } from '../../src/core/premios/nomineeImage';
import { buildStableOptions } from '../../src/core/premios/options';
import type { PremiosNomineeImage } from '../../src/model/types/premios';

const RUTA = '/tNQWO6cNzQYCyvw36mUcAQQyf5F.jpg';
const imagen: PremiosNomineeImage = { source: 'tmdb', kind: 'tv', id: 100088, path: RUTA };

describe('nomineeImageUrls', () => {
  it('en las de juegos, la carátula de IGDB y solo lo ya resuelto', () => {
    const urls = nomineeImageUrls({ id: 'a', name: 'Hades II' }, 'Hades II', true);
    expect(urls?.src).toBe('/cover?n=Hades+II&c=1');
    expect(urls?.src2x).toBe('/cover?n=Hades+II&s=medio&c=1');
  });

  it('en las demás, la imagen elegida en TMDB, servida desde este dominio', () => {
    const urls = nomineeImageUrls({ id: 'a', name: 'The Last of Us', image: imagen }, 'The Last of Us', false);
    expect(urls).toEqual({ src: posterUrl(RUTA), src2x: posterUrl(RUTA, 'medio') });
    expect(urls?.src).toBe(`/poster?p=${encodeURIComponent(RUTA)}`);
  });

  // Nunca una adivinada: sin elegir, la portada de casa.
  it('sin imagen elegida, nada', () => {
    expect(nomineeImageUrls({ id: 'a', name: 'Arcane' }, 'Arcane', false)).toBeNull();
  });

  // Si la categoría vuelve a «Juegos», manda IGDB aunque el nominado conserve la imagen de antes.
  it('en una de juegos, la imagen de TMDB no cuenta', () => {
    expect(nomineeImageUrls({ id: 'a', name: 'Arcane', image: imagen }, 'Arcane', true)?.src).toContain('/cover?');
  });
});

describe('nomineeImageOf', () => {
  it('descarta lo que no tiene forma de imagen de TMDB', () => {
    expect(nomineeImageOf({ id: 'a', name: 'x', image: imagen })).toEqual(imagen);
    expect(nomineeImageOf({ id: 'a', name: 'x', image: { ...imagen, path: 'https://evil.example/x.jpg' } })).toBeNull();
    expect(nomineeImageOf('Nombre suelto')).toBeNull();
    expect(nomineeImageOf({ id: 'a', name: 'x' })).toBeNull();
  });
});

describe('buildStableOptions con imagen', () => {
  // Firestore rechaza los `undefined`: la imagen va solo en los nominados que la tienen.
  it('conserva la imagen elegida y no añade el campo a los que no la tienen', () => {
    const opciones = buildStableOptions(
      [
        { id: 'c_option_a', value: 'The Last of Us', image: imagen },
        { id: 'c_option_b', value: 'Arcane', image: null },
      ],
      'c',
    );
    expect(opciones[0]).toEqual({ id: 'c_option_a', name: 'The Last of Us', image: imagen });
    expect(opciones[1]).toEqual({ id: 'c_option_b', name: 'Arcane' });
    expect(opciones[1]).not.toHaveProperty('image');
  });
});
