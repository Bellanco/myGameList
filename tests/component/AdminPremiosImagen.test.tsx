import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminPremiosImagen } from '../../src/view/components/premios/AdminPremiosImagen';
import { PREMIOS_UI } from '../../src/core/constants/premiosLabels';
import type { PremiosTmdbCandidate } from '../../src/model/types/premios';

const L = PREMIOS_UI.admin.categories.image;
const RUTA = '/tNQWO6cNzQYCyvw36mUcAQQyf5F.jpg';

const buscarMock = vi.fn(async (_consulta: string, _tipo: string): Promise<PremiosTmdbCandidate[]> => [
  { kind: 'tv', id: 100088, title: 'The Last of Us', year: '2023', path: RUTA },
  { kind: 'movie', id: 7, title: 'Así se hizo The Last of Us', originalTitle: 'Making of The Last of Us', year: '2023', path: RUTA },
]);

vi.mock('../../src/model/repository/premios/premiosTmdbRepository', () => ({
  buscarImagenesTmdb: (consulta: string, tipo: string) => buscarMock(consulta, tipo),
}));

beforeEach(() => buscarMock.mockClear());

describe('AdminPremiosImagen', () => {
  // SE ELIGE A MANO: se busca con el nombre escrito, se ven los candidatos y se pulsa el bueno.
  it('busca con el nombre del nominado y guarda el candidato elegido', async () => {
    const onChange = vi.fn();
    render(<AdminPremiosImagen kind="screen" nombre="The Last of Us" numero={1} image={null} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: L.searchAria(1) }));
    expect(buscarMock).toHaveBeenCalledWith('The Last of Us', 'screen');

    // La serie y el documental con el mismo título: por eso no se elige solo.
    const serie = await screen.findByRole('button', { name: L.pickAria('The Last of Us', `${L.kindTv} · 2023`) });
    expect(screen.getByRole('button', { name: /Así se hizo/ })).toBeInTheDocument();
    expect(serie.querySelector('img')?.getAttribute('src')).toBe(`/poster?p=${encodeURIComponent(RUTA)}`);

    await userEvent.click(serie);
    expect(onChange).toHaveBeenCalledWith({ source: 'tmdb', kind: 'tv', id: 100088, path: RUTA });
  });

  it('las interpretaciones buscan personas', async () => {
    render(<AdminPremiosImagen kind="person" nombre="Troy Baker" numero={2} image={null} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: L.searchAria(2) }));
    expect(buscarMock).toHaveBeenCalledWith('Troy Baker', 'person');
  });

  // El nominado se escribe «Actor - Juego»; TMDB solo encuentra al actor sin el juego.
  it('en una interpretación busca al actor sin el juego, y deja la consulta a la vista', async () => {
    render(<AdminPremiosImagen kind="person" nombre="Troy Baker - The Last of Us" numero={1} image={null} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: L.searchAria(1) }));
    expect(buscarMock).toHaveBeenCalledWith('Troy Baker', 'person');
    expect(screen.getByRole('searchbox', { name: L.queryAria(1) })).toHaveValue('Troy Baker');
  });

  // En cine o serie el guion es parte del título: «Misión: Imposible - Fallout».
  it('en cine o serie busca el título entero', async () => {
    render(<AdminPremiosImagen kind="screen" nombre="Misión: Imposible - Fallout" numero={1} image={null} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: L.searchAria(1) }));
    expect(buscarMock).toHaveBeenCalledWith('Misión: Imposible - Fallout', 'screen');
  });

  it('se puede quitar la imagen elegida', async () => {
    const onChange = vi.fn();
    render(
      <AdminPremiosImagen
        kind="screen"
        nombre="Arcane"
        numero={1}
        image={{ source: 'tmdb', kind: 'tv', id: 1, path: RUTA }}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: L.changeAria(1) }));
    await userEvent.click(await screen.findByRole('button', { name: L.remove }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('si TMDB no responde, lo dice', async () => {
    buscarMock.mockRejectedValueOnce(new Error('No se ha podido consultar TMDB; inténtalo más tarde'));
    render(<AdminPremiosImagen kind="screen" nombre="Arcane" numero={1} image={null} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: L.searchAria(1) }));
    await waitFor(() => expect(screen.getByText(/No se ha podido consultar TMDB/)).toBeInTheDocument());
  });
});
