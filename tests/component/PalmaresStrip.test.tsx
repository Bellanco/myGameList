import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PalmaresStrip } from '../../src/view/components/premios/PalmaresStrip';

// La vitrina del palmarés en la ficha de un perfil: banderines con puesto, competición y año, que se distinguen de
// la tira de logros por la forma.
describe('PalmaresStrip', () => {
  it('sin el rótulo a la vista: cada edición, su puesto, su competición y su año; también el de quien participó', async () => {
    const { container, findByRole, queryByText, getAllByText, getByRole } = render(
      <MemoryRouter>
        <PalmaresStrip
          entries={[
            { seasonId: 'ga-2025', seasonName: 'Game Awards 2025', season: 2025, rank: 1, awardedAt: 1 },
            { seasonId: 'ga-2024', seasonName: 'Game Awards 2024', season: 2024, rank: 0, place: 7, awardedAt: 1 },
            { seasonId: 'ga-2023', seasonName: 'Game Awards 2023', season: 2023, rank: 0, awardedAt: 1 },
          ]}
        />
      </MemoryRouter>,
    );
    await findByRole('region', { name: 'Palmarés' });
    expect(queryByText('Palmarés')).toBeNull();
    const cintas = [...container.querySelectorAll('.premios-palmares__band')].map((cinta) => cinta.textContent);
    expect(cintas).toEqual(['1.ºGame Awards2025’25', '7.ºGame Awards2024’24', 'ParticipóGame Awards2023’23']);
    expect(getAllByText('Game Awards')).toHaveLength(3);
    expect(getByRole('link', { name: '7.º en Game Awards 2024: ver los resultados' })).toHaveAttribute('title', '7.º en Game Awards 2024');
    // El metal de cada cinta: oro el primero y azul la participación, tenga o no puesto.
    expect([...container.querySelectorAll('.premios-palmares__item')].map((li) => li.getAttribute('data-metal'))).toEqual(['oro', 'azul', 'azul']);
  });
});
