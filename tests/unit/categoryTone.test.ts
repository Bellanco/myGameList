import { describe, expect, it } from 'vitest';

import { CATEGORY_TONES, categoryTone, categoryToneStyle } from '../../src/core/constants/categoryTone';

/**
 * El reparto de la rampa categórica. Lo que se protege aquí no es "qué número sale" —ese puede cambiar el día
 * que se añada un tono— sino las tres promesas que sí importan: que el color de un género NO baile entre
 * sesiones, que no dependa de cómo se escriba, y que siempre caiga dentro de la rampa declarada en CSS.
 */
describe('categoryTone', () => {
  it('devuelve siempre un tono dentro de la rampa declarada en `_base.scss`', () => {
    const nombres = ['Metroidvania', 'RPG', 'ARPG', 'JRPG', 'FPS', 'Aventura', 'Puzles', 'Cartas', 'Terror',
      'Estrategia en tiempo real', 'Simulador de gestión', 'Coleccionista de criaturas', 'Hack & Slash', ''];
    for (const nombre of nombres) {
      const tono = categoryTone(nombre);
      expect(tono, nombre).toBeGreaterThanOrEqual(1);
      expect(tono, nombre).toBeLessThanOrEqual(CATEGORY_TONES);
      expect(Number.isInteger(tono), nombre).toBe(true);
    }
  });

  it('es estable: el mismo nombre da el mismo tono siempre', () => {
    expect(categoryTone('Metroidvania')).toBe(categoryTone('Metroidvania'));
    expect(categoryTone('RPG')).toBe(categoryTone('RPG'));
  });

  it('no distingue mayúsculas, espacios sobrantes ni acentos', () => {
    expect(categoryTone('Acción')).toBe(categoryTone('accion'));
    expect(categoryTone('  RPG  ')).toBe(categoryTone('rpg'));
    expect(categoryTone('Simulador de Gestión')).toBe(categoryTone('simulador de gestion'));
  });

  it('reparte: géneros parecidos no caen todos en el mismo tono', () => {
    // Con los siete géneros más usados de una biblioteca real, al menos cuatro tonos distintos. Si el hash
    // degenerara y los mandara a todos al mismo color, la rampa no serviría de nada y este test lo dice.
    const reales = ['ARPG', 'FPS', 'Plataformas', 'Aventura', 'Cartas', 'Estrategia en tiempo real', 'Hack & Slash'];
    const distintos = new Set(reales.map(categoryTone));
    expect(distintos.size).toBeGreaterThanOrEqual(4);
  });

  it('entrega las dos fichas juntas, relleno y texto', () => {
    const style = categoryToneStyle('RPG');
    const tono = categoryTone('RPG');
    expect(style).toEqual({ '--cat': `var(--cat-${tono})`, '--cat-fg': `var(--cat-${tono}-fg)` });
  });
});
