import { describe, it, expect } from 'vitest';
import { canonicalTag, hasTag, mergeTags, splitTagInput, tagKey } from '../../src/core/utils/tags';
import { uniqueCaseInsensitive } from '../../src/core/utils/compare';

describe('tagKey — dos escrituras de la misma etiqueta son la misma etiqueta', () => {
  it('ignora mayúsculas, tildes y espacios de más', () => {
    expect(tagKey('Acción')).toBe(tagKey('accion'));
    expect(tagKey('ACCIÓN')).toBe(tagKey('  acción  '));
    expect(tagKey('Rol   por turnos')).toBe(tagKey('rol por turnos'));
    expect(tagKey('Súper Difícil')).toBe(tagKey('super dificil'));
  });

  it('respeta la eñe y la cedilla: no son variantes de escritura, son letras distintas', () => {
    expect(tagKey('años')).not.toBe(tagKey('anos'));
    expect(tagKey('Français')).not.toBe(tagKey('Francais'));
    // …pero la eñe sigue siendo insensible a mayúsculas.
    expect(tagKey('AÑOS')).toBe(tagKey('años'));
  });

  it('no confunde etiquetas realmente distintas', () => {
    expect(tagKey('RPG')).not.toBe(tagKey('RTS'));
  });
});

describe('splitTagInput — separación por comas', () => {
  it('trocea por coma, punto y coma, tabulador y salto de línea', () => {
    expect(splitTagInput('Acción, RPG; Aventura\nIndie\tRetro')).toEqual(['Acción', 'RPG', 'Aventura', 'Indie', 'Retro']);
  });

  it('descarta huecos vacíos y espacios sobrantes', () => {
    expect(splitTagInput('  Acción ,, ; , RPG  ')).toEqual(['Acción', 'RPG']);
    expect(splitTagInput('   ')).toEqual([]);
  });

  it('NO trocea por barra: hay etiquetas que la usan', () => {
    expect(splitTagInput('Acción/Aventura')).toEqual(['Acción/Aventura']);
  });
});

describe('canonicalTag / hasTag / mergeTags', () => {
  it('adopta la grafía ya guardada en las listas', () => {
    expect(canonicalTag('accion', ['Acción', 'RPG'])).toBe('Acción');
    expect(canonicalTag('Metroidvania', ['Acción', 'RPG'])).toBe('Metroidvania');
  });

  it('reconoce una etiqueta ya presente aunque se escriba de otra forma', () => {
    expect(hasTag(['Acción'], 'ACCION')).toBe(true);
    expect(hasTag(['Acción'], 'Aventura')).toBe(false);
  });

  it('añade sin duplicar equivalentes y respetando el orden de llegada', () => {
    expect(mergeTags(['Acción'], ['accion', 'RPG', 'rpg'], [])).toEqual(['Acción', 'RPG']);
  });

  it('al añadir usa la grafía de la biblioteca, no la tecleada', () => {
    expect(mergeTags([], ['accion'], ['Acción'])).toEqual(['Acción']);
  });

  it('ignora lo que quede vacío tras normalizar', () => {
    expect(mergeTags(['RPG'], ['   ', ''], [])).toEqual(['RPG']);
  });
});

describe('uniqueCaseInsensitive — la deduplicación del guardado usa la misma clave', () => {
  it('colapsa variantes con y sin tilde conservando la primera', () => {
    expect(uniqueCaseInsensitive(['Acción', 'accion', 'ACCIÓN', 'RPG'])).toEqual(['Acción', 'RPG']);
  });
});
