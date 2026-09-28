import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../src/model/repository/firebaseGateway', () => ({ reportHandledError: vi.fn(async () => {}) }));

const { SilentBoundary } = await import('../../src/view/components/SilentBoundary');
const { reportHandledError } = await import('../../src/model/repository/firebaseGateway');

function Rota(): never {
  throw new Error('Failed to fetch dynamically imported module');
}

// Un chunk prescindible que no llega (el resto del sprite, los efectos) no puede tumbar la app entera.
describe('SilentBoundary', () => {
  it('si lo de dentro falla no pinta nada, deja en pie lo de fuera y lo reporta como no fatal', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <div>
        <p>La app sigue</p>
        <SilentBoundary source="icon-sprite-rest">
          <Rota />
        </SilentBoundary>
      </div>,
    );
    expect(screen.getByText('La app sigue')).toBeInTheDocument();
    expect(reportHandledError).toHaveBeenCalledWith(expect.any(Error), false, 'icon-sprite-rest');
  });

  it('sin fallo pinta lo de dentro', () => {
    render(
      <SilentBoundary source="x">
        <p>Dentro</p>
      </SilentBoundary>,
    );
    expect(screen.getByText('Dentro')).toBeInTheDocument();
  });
});
