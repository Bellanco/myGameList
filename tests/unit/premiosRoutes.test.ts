import { describe, expect, it } from 'vitest';
import {
  matchPremiosRoute,
  panelNeedsSession,
  resultsPath,
  votePath,
} from '../../src/viewmodel/premios/premiosRoutes';

describe('matchPremiosRoute', () => {
  it('la raíz es la portada', () => {
    expect(matchPremiosRoute('/premios')).toMatchObject({ panel: 'portada', paso: 0 });
  });

  // EL PASO VIVE EN LA DIRECCIÓN: es lo que permite enlazar una categoría y que recargar no devuelva al principio.
  it('lee el paso de votación', () => {
    expect(matchPremiosRoute('/premios/votar/3')).toMatchObject({ panel: 'votar', paso: 3 });
  });

  it('un paso escrito a mano que no es un número lleva al primero', () => {
    expect(matchPremiosRoute('/premios/votar/abc').paso).toBe(1);
    expect(matchPremiosRoute('/premios/votar/0').paso).toBe(1);
    expect(matchPremiosRoute('/premios/votar/-2').paso).toBe(1);
  });

  it('distingue la revisión y los resultados', () => {
    expect(matchPremiosRoute('/premios/revisar').panel).toBe('revisar');
    expect(matchPremiosRoute('/premios/resultados')).toMatchObject({ panel: 'resultados', seasonId: '' });
  });

  it('lee la edición pedida, que es la dirección que se comparte', () => {
    expect(matchPremiosRoute('/premios/resultados/porra-2026')).toMatchObject({
      panel: 'resultados',
      seasonId: 'porra-2026',
    });
  });

  it('descodifica el id y tolera una dirección manipulada', () => {
    expect(matchPremiosRoute('/premios/resultados/reto%20invierno').seasonId).toBe('reto invierno');
    expect(matchPremiosRoute('/premios/resultados/%zz').seasonId).toBe('%zz');
  });

  it('cualquier otra sub-ruta cae en la portada', () => {
    expect(matchPremiosRoute('/premios/lo-que-sea').panel).toBe('portada');
  });
});

describe('constructores de dirección', () => {
  it('construyen lo que el matcher entiende', () => {
    expect(matchPremiosRoute(votePath(4)).paso).toBe(4);
    expect(votePath(0)).toBe('/premios/votar/1');
    expect(matchPremiosRoute(resultsPath('porra-2026')).seasonId).toBe('porra-2026');
    expect(resultsPath()).toBe('/premios/resultados');
  });
});

// REGRESIÓN: la primera versión exigía sesión en todo lo que no fuera la portada, y eso dejaba los RESULTADOS
// —la pantalla que se comparte por enlace— pidiendo una cuenta que el visitante no tiene por qué tener.
describe('qué exige sesión', () => {
  it('votar y revisar sí', () => {
    expect(panelNeedsSession('votar')).toBe(true);
    expect(panelNeedsSession('revisar')).toBe(true);
  });

  it('la portada y los resultados NO', () => {
    expect(panelNeedsSession('portada')).toBe(false);
    expect(panelNeedsSession('resultados')).toBe(false);
  });

  it('la confirmación de envío tampoco: quien acaba de votar ya la tenía', () => {
    expect(panelNeedsSession('enviada')).toBe(false);
  });
});
