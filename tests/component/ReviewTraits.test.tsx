import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReviewTraits } from '../../src/view/components/stats/ReviewTraits';
import { STATS_UI } from '../../src/core/constants/statsLabels';

const L = STATS_UI.reviews;

const tag = (name: string, games: number) => ({ tag: name, games, hours: 0 });

describe('ReviewTraits · qué destacas y qué te chirría', () => {
  it('enfrenta las dos caras sobre la MISMA escala', () => {
    render(<ReviewTraits strengths={[tag('Historia', 20), tag('Combate', 5)]} weaknesses={[tag('Bugs', 10)]} />);

    const barra = (name: string) => screen.getByTitle(name).closest('.traits-side')?.querySelector('.traits-bar i');
    // El máximo de los dos lados es 20: el resto se mide contra él, no contra el máximo de su columna.
    expect(barra('Historia')).toHaveStyle({ '--pct': '100%' });
    expect(barra('Bugs')).toHaveStyle({ '--pct': '50%' });
    expect(barra('Combate')).toHaveStyle({ '--pct': '25%' });
  });

  it('sobrevive a que un lado esté vacío', () => {
    render(<ReviewTraits strengths={[tag('Historia', 3)]} weaknesses={[]} />);

    expect(screen.getByTitle('Historia')).toBeInTheDocument();
    expect(screen.getByText(L.strengths)).toBeInTheDocument();
  });

  it('sin etiquetas anotadas lo dice, en vez de dejar el hueco mudo', () => {
    render(<ReviewTraits strengths={[]} weaknesses={[]} />);

    expect(screen.getByText(L.traitsEmpty)).toBeInTheDocument();
  });
});
