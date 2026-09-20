import { describe, expect, it } from 'vitest';
import { layoutAwardName, wrapText } from '../../src/core/premios/awardCanvas';

/**
 * La medición se inyecta a propósito: en jsdom `measureText` devuelve siempre 0, así que un cálculo sobre un
 * canvas real daría verdes falsos. Aquí se simula una fuente de ancho fijo —0,55 px por carácter y por px de
 * cuerpo—, que basta para comprobar lo que se prueba, que es el ENCAJE y no la tipografía.
 */
const measureAt = (text: string, fontSize: number) => text.length * fontSize * 0.55;

describe('wrapText', () => {
  const measure = (text: string) => measureAt(text, 10); // 5,5 px por carácter

  it('deja en una línea lo que cabe', () => {
    expect(wrapText(measure, 'Ana Pérez', 1000)).toEqual(['Ana Pérez']);
  });

  it('parte por palabras cuando no cabe', () => {
    // 60 px = 10 caracteres por línea.
    expect(wrapText(measure, 'Ana Pérez', 60)).toEqual(['Ana Pérez']);
    expect(wrapText(measure, 'Ana Pérez Ruiz', 60)).toEqual(['Ana Pérez', 'Ruiz']);
  });

  // Un nombre largo sin espacios es legítimo, y sin esto se saldría de la lámina en vez de partirse.
  it('trocea una palabra que no cabe ni sola', () => {
    expect(wrapText(measure, 'Supercalifragilistico', 60)).toEqual(['Supercalif', 'ragilistic', 'o']);
  });

  it('no devuelve líneas vacías con espacios de más', () => {
    expect(wrapText(measure, '   Ana    Pérez  ', 1000)).toEqual(['Ana Pérez']);
    expect(wrapText(measure, '', 1000)).toEqual([]);
  });
});

describe('layoutAwardName', () => {
  const box = { width: 1000, height: 200 };

  it('agranda el nombre corto hasta llenar la caja', () => {
    const { fontSize, lines } = layoutAwardName(measureAt, 'Ana', box);
    expect(lines).toEqual(['Ana']);
    // Una sola línea: el cuerpo lo limita el alto de la caja.
    expect(fontSize).toBeGreaterThan(150);
    expect(fontSize * 1.18).toBeLessThanOrEqual(box.height);
  });

  it('encoge el nombre largo hasta que cabe, sin salirse', () => {
    const name = 'Maximiliano Rodríguez de la Fuente';
    const { fontSize, lines } = layoutAwardName(measureAt, name, box);
    expect(lines.length).toBeLessThanOrEqual(2);
    lines.forEach((line) => {
      expect(measureAt(line, fontSize)).toBeLessThanOrEqual(box.width);
    });
    expect(lines.length * fontSize * 1.18).toBeLessThanOrEqual(box.height);
  });

  it('nunca pasa de dos líneas: un título no es un párrafo', () => {
    expect(layoutAwardName(measureAt, 'A'.repeat(50), box).lines.length).toBeLessThanOrEqual(2);
  });

  it('el nombre corto sale más grande que el largo', () => {
    const corto = layoutAwardName(measureAt, 'Kiko', box);
    const largo = layoutAwardName(measureAt, 'Maximiliano Rodríguez de la Fuente', box);
    expect(corto.fontSize).toBeGreaterThan(largo.fontSize);
  });

  it('aguanta un nombre vacío sin romperse', () => {
    expect(layoutAwardName(measureAt, '', box).lines).toEqual([]);
    expect(layoutAwardName(measureAt, null as unknown as string, box).lines).toEqual([]);
  });
});
