import { describe, expect, it } from 'vitest';
import {
  MAX_SEASON_ID_LENGTH,
  getSeasonId,
  getSeasonLabel,
  toSeasonId,
} from '../../src/core/premios/seasonId';

describe('toSeasonId', () => {
  it('normaliza acentos, mayúsculas y espacios', () => {
    expect(toSeasonId('Edición de Verano 2026')).toBe('edicion-de-verano-2026');
  });

  it('quita lo que Firestore no admite en un id', () => {
    // Una barra partiría la ruta del documento.
    expect(toSeasonId('2026/invierno')).toBe('2026-invierno');
    expect(toSeasonId('  ¡Porra!  ')).toBe('porra');
  });

  it('no deja guiones sueltos en los extremos', () => {
    expect(toSeasonId('--2026--')).toBe('2026');
    expect(toSeasonId('%%%')).toBe('');
  });

  it('recorta a la longitud máxima sin dejar un guión al final', () => {
    const largo = toSeasonId('a'.repeat(60));
    expect(largo.length).toBeLessThanOrEqual(MAX_SEASON_ID_LENGTH);
    expect(largo.endsWith('-')).toBe(false);
  });

  it('tolera valores vacíos', () => {
    expect(toSeasonId(null)).toBe('');
    expect(toSeasonId(undefined)).toBe('');
  });
});

describe('getSeasonId', () => {
  it('usa el identificador de la configuración cuando existe', () => {
    expect(getSeasonId({ seasonId: '2026-verano', season: 2026 })).toBe('2026-verano');
  });

  it('cae al año en una edición sin identificador', () => {
    // Es el caso de las ediciones anteriores: su archivo vive bajo el año y hay que seguir encontrándolo.
    expect(getSeasonId({ season: 2025 })).toBe('2025');
  });

  it('normaliza un identificador escrito a mano', () => {
    expect(getSeasonId({ seasonId: 'Verano 2026', season: 2026 })).toBe('verano-2026');
  });
});

describe('getSeasonLabel', () => {
  it('prefiere el nombre de la edición', () => {
    expect(getSeasonLabel({ name: 'El reto del jugador 2026', season: 2026 })).toBe('El reto del jugador 2026');
    expect(getSeasonLabel({ seasonName: 'Porra de verano', season: 2026 })).toBe('Porra de verano');
  });

  it('cae al año si no hay nombre', () => {
    expect(getSeasonLabel({ season: 2025 })).toBe('2025');
    expect(getSeasonLabel({ name: '   ', season: 2025 })).toBe('2025');
  });
});
