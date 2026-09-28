import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PalmaresStrip } from '../../src/view/components/premios/PalmaresStrip';

// Quien tiene palmarés y NINGÚN logro no monta la vitrina de logros, que era la única que traía el sprite de las
// medallas: el disco salía vacío. La vitrina del palmarés tiene que bastarse sola.
describe('PalmaresStrip', () => {
  it('trae los símbolos de sus medallas aunque no haya vitrina de logros', async () => {
    const { container, findByRole } = render(
      <MemoryRouter>
        <PalmaresStrip
          entries={[
            { seasonId: '2025', seasonName: 'Game Awards 2025', rank: 3, awardedAt: 1 },
            { seasonId: '2025b', seasonName: 'Game Awards 2025', rank: 0, awardedAt: 1 },
          ]}
        />
      </MemoryRouter>,
    );
    await findByRole('region', { name: 'Palmarés' });
    expect(container.ownerDocument.getElementById('ach-palmares')).not.toBeNull();
    expect(container.ownerDocument.getElementById('ach-participacion')).not.toBeNull();
  });
});
