import { describe, it, expect } from 'vitest';
import { parseCsvRows, parsePlayniteCsv } from '../../src/core/import/playniteCsv';

describe('parseCsvRows', () => {
  it('respeta comillas, comas internas y saltos de línea', () => {
    const rows = parseCsvRows('a,"b,c",d\n"multi\nline",x,y\n');
    expect(rows).toEqual([
      ['a', 'b,c', 'd'],
      ['multi\nline', 'x', 'y'],
    ]);
  });

  it('comillas escapadas ("")', () => {
    expect(parseCsvRows('"a""b",c')).toEqual([['a"b', 'c']]);
  });
});

describe('parsePlayniteCsv (Library Exporter)', () => {
  it('cabeceras en español, listas por ", " y PC→tienda', () => {
    const csv =
      'Nombre,Géneros,Plataformas,Fuente,Estado de finalización,Tiempo Jugado,Puntuación del usuario\n' +
      '"The Witcher 3","RPG, Aventura","PC (Windows)",Steam,Completado,360000,95\n';
    const [g] = parsePlayniteCsv(csv);
    expect(g.name).toBe('The Witcher 3');
    expect(g.genres).toEqual(['RPG', 'Aventura']);
    expect(g.platforms).toEqual(['Steam']); // PC → tienda
    expect(g.source).toBe('steam');
    expect(g.suggestedTab).toBe('c'); // "Completado"
    expect(g.hours).toBe(100); // 360000 s
    expect(g.grade).toBe(95);
  });

  it('cabeceras en inglés y plataforma de consola conservada', () => {
    const csv =
      'Name,Genres,Platforms,Source,Completion Status,Time Played,User Score\n' +
      'Bloodborne,Action,Sony PlayStation 4,PlayStation,Abandoned,3600,88\n';
    const [g] = parsePlayniteCsv(csv);
    expect(g.name).toBe('Bloodborne');
    expect(g.platforms).toEqual(['Sony PlayStation 4']);
    expect(g.source).toBe('psn');
    expect(g.suggestedTab).toBe('v');
    expect(g.hours).toBe(1);
  });

  it('descarta filas sin nombre y columnas ausentes no rompen', () => {
    const csv = 'Nombre,Plataformas\n,PC (Windows)\nHades,PC (Windows)\n';
    const out = parsePlayniteCsv(csv);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Hades');
    expect(out[0].genres).toEqual([]); // no había columna de géneros
  });

  it('CSV vacío o solo cabecera → []', () => {
    expect(parsePlayniteCsv('')).toEqual([]);
    expect(parsePlayniteCsv('Nombre,Géneros')).toEqual([]);
  });
});
