import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ReviewParagraphs, splitReviewParagraphs } from '../../src/view/components/ReviewParagraphs';

describe('splitReviewParagraphs', () => {
  it('separa párrafos por línea en blanco y líneas por salto simple', () => {
    expect(splitReviewParagraphs('¿Fútbol?\nTe gustará.\n\n¿Motor?\nTe gustará.')).toEqual([
      ['¿Fútbol?', 'Te gustará.'],
      ['¿Motor?', 'Te gustará.'],
    ]);
  });

  it('varias líneas en blanco (con espacios o \\r\\n) cuentan como un solo párrafo', () => {
    expect(splitReviewParagraphs('Uno\r\n\r\n  \n\t\nDos')).toEqual([['Uno'], ['Dos']]);
  });

  it('recorta los saltos de los extremos y conserva la sangría de la línea', () => {
    expect(splitReviewParagraphs('\n\nUno\n  dos\n\n')).toEqual([['Uno', '  dos']]);
  });

  it('texto vacío: sin párrafos', () => {
    expect(splitReviewParagraphs('  \n ')).toEqual([]);
  });
});

describe('ReviewParagraphs', () => {
  it('sin saltos pinta el texto tal cual, sin envoltorios', () => {
    const { container } = render(<p><ReviewParagraphs text="Una sola línea" /></p>);
    expect(container.querySelector('p')?.innerHTML).toBe('Una sola línea');
  });

  it('con saltos pinta un bloque por párrafo y otro por línea', () => {
    const { container } = render(<p><ReviewParagraphs text={'Gran inicio.\nLa historia...\n\nEn resumen.'} /></p>);
    const pars = container.querySelectorAll('.review-par');
    expect(pars).toHaveLength(2);
    expect([...pars[0].querySelectorAll('.review-line')].map((l) => l.textContent)).toEqual(['Gran inicio.', 'La historia...']);
    expect(pars[1].textContent).toBe('En resumen.');
  });
});
