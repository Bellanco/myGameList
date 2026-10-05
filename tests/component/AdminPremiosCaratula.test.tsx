import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminPremiosCaratula } from '../../src/view/components/premios/AdminPremiosCaratula';
import { PREMIOS_UI } from '../../src/core/constants/premiosLabels';
import type { BusquedaIgdb } from '../../src/model/repository/premios/premiosIgdbRepository';

const L = PREMIOS_UI.admin.categories.cover;
const OCARINA = 'The Legend of Zelda: Ocarina of Time';

const buscarMock = vi.fn(async (_consulta: string): Promise<BusquedaIgdb> => ({
  candidatos: [
    { id: 1029, name: OCARINA, coverId: 'co3nnx', year: '1998', platforms: ['N64', 'Wii'], gameType: 0 },
    { id: 9999, name: OCARINA, coverId: 'cocv5r', year: '2026', platforms: ['Switch 2'], gameType: 8 },
  ],
  automatica: 'co3nnx',
}));

vi.mock('../../src/model/repository/premios/premiosIgdbRepository', () => ({
  buscarCaratulasIgdb: (consulta: string) => buscarMock(consulta),
}));

beforeEach(() => buscarMock.mockClear());

describe('AdminPremiosCaratula', () => {
  /* El caso que lo motivó: dos fichas con el mismo nombre, y la automática es la de N64 porque tiene los votos.
     Se ven las dos con su tipo, año y plataformas, la automática marcada, y se elige el remake. */
  it('busca con el nombre, marca la automática y guarda la elegida', async () => {
    const onChange = vi.fn();
    render(<AdminPremiosCaratula nombre={OCARINA} numero={1} cover={null} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: L.chooseAria(1) }));
    expect(buscarMock).toHaveBeenCalledWith(OCARINA);

    const original = await screen.findByRole('button', { name: L.pickAria(OCARINA, 'Juego · 1998 · N64, Wii') });
    expect(original).toHaveTextContent(L.automaticBadge);
    const remake = screen.getByRole('button', { name: L.pickAria(OCARINA, 'Remake · 2026 · Switch 2') });
    expect(remake).not.toHaveTextContent(L.automaticBadge);
    expect(remake.querySelector('img')?.getAttribute('src')).toBe('/cover?i=cocv5r');

    await userEvent.click(remake);
    expect(onChange).toHaveBeenCalledWith({ source: 'igdb', imageId: 'cocv5r', gameId: 9999, name: OCARINA });
  });

  it('la elegida se ve al lado del campo, servida por su id', () => {
    const { container } = render(
      <AdminPremiosCaratula
        nombre={OCARINA}
        numero={1}
        cover={{ source: 'igdb', imageId: 'cocv5r', gameId: 9999, name: OCARINA }}
        onChange={vi.fn()}
      />,
    );
    expect(container.querySelector('.premios-admin__nominee-thumb img')?.getAttribute('src')).toBe('/cover?i=cocv5r');
    expect(screen.getByRole('button', { name: L.changeAria(1) })).toBeInTheDocument();
  });

  it('se puede volver a la automática', async () => {
    const onChange = vi.fn();
    render(
      <AdminPremiosCaratula
        nombre={OCARINA}
        numero={1}
        cover={{ source: 'igdb', imageId: 'cocv5r', gameId: 9999, name: OCARINA }}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: L.changeAria(1) }));
    await userEvent.click(await screen.findByRole('button', { name: L.automatic }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('sin nombre escrito no hay nada que buscar', () => {
    render(<AdminPremiosCaratula nombre="  " numero={3} cover={null} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: L.chooseAria(3) })).toBeDisabled();
  });

  it('si IGDB no responde, lo dice', async () => {
    buscarMock.mockRejectedValueOnce(new Error('No se ha podido consultar IGDB; inténtalo más tarde'));
    render(<AdminPremiosCaratula nombre={OCARINA} numero={1} cover={null} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: L.chooseAria(1) }));
    await waitFor(() => expect(screen.getByText(/No se ha podido consultar IGDB/)).toBeInTheDocument());
  });
});
