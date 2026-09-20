import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminPremiosHistorico } from '../../src/view/components/premios/AdminPremiosHistorico';
import { PREMIOS_UI } from '../../src/core/constants/premiosLabels';
import type { PalmaresRecord } from '../../src/model/repository/premios/premiosPalmaresRepository';

const L = PREMIOS_UI.admin.history;

/**
 * EL INTERRUPTOR DEL LOGRO, visto desde el panel: un icono al final de la fila que dice si los premiados de esa
 * edición lucen su medalla, y que se puede apagar y encender sin tocar el resultado.
 */
const registros: { valor: Record<string, PalmaresRecord> } = { valor: {} };
const setGrantedMock = vi.fn(async () => 2);
const deleteMock = vi.fn(async () => ({
  seasonId: 'test',
  lastPublishedId: '',
  wasPublished: false,
  revoked: 3,
}));

vi.mock('../../src/model/repository/premios/premiosPalmaresRepository', () => ({
  fetchPalmaresRecords: async () => registros.valor,
  setSeasonPalmaresGranted: (...args: unknown[]) => setGrantedMock(...(args as [])),
}));

vi.mock('../../src/model/repository/premios/premiosSeasonRepository', () => ({
  listSeasonResults: async () => [
    { id: 'game-awards-2025', season: 2025, name: 'Game Awards 2025', totalBallots: 14 },
  ],
  renameSeasonResult: async () => {},
  deleteSeasonResult: (...args: unknown[]) => deleteMock(...(args as [])),
}));

/** El panel pasa este envoltorio; aquí solo interesa la acción y lo que devuelve. */
const avisos: string[] = [];
const ejecutar = async (accion: () => Promise<string>) => {
  avisos.push(await accion().catch((fallo) => `error: ${(fallo as Error).message}`));
};

async function pintar() {
  render(
    <MemoryRouter>
      <AdminPremiosHistorico busy={false} ejecutar={ejecutar} />
    </MemoryRouter>,
  );
  await screen.findByText('Game Awards 2025');
}

const interruptor = () => screen.getByRole('button', { name: /logro de «Game Awards 2025»/ });

beforeEach(() => {
  registros.valor = {};
  avisos.length = 0;
  setGrantedMock.mockClear();
  deleteMock.mockClear();
});

describe('AdminPremiosHistorico', () => {
  // Las ediciones publicadas antes de que esto existiera concedieron el trofeo siempre: enseñarlas apagadas
  // sería mentir sobre lo que hay en los perfiles.
  it('una edición sin registro se enseña con el logro puesto', async () => {
    await pintar();
    expect(interruptor()).toHaveAttribute('aria-pressed', 'true');
    expect(interruptor()).toHaveAccessibleName(L.awardOn('Game Awards 2025'));
  });

  it('una edición con el logro retirado se enseña apagada', async () => {
    registros.valor = { 'game-awards-2025': { seasonId: 'game-awards-2025', granted: false, recipients: [] } };
    await pintar();

    expect(interruptor()).toHaveAttribute('aria-pressed', 'false');
    expect(interruptor()).toHaveAccessibleName(L.awardOff('Game Awards 2025'));
  });

  it('pulsarlo quita el logro, sin preguntar: se devuelve con la misma pulsada', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await pintar();

    await userEvent.click(interruptor());

    expect(confirmar).not.toHaveBeenCalled();
    expect(setGrantedMock).toHaveBeenCalledWith('game-awards-2025', 'Game Awards 2025', false);
    await waitFor(() => expect(avisos).toContain(L.awardRevoked(2)));
    confirmar.mockRestore();
  });

  it('pulsarlo apagado lo devuelve a sus premiados', async () => {
    registros.valor = { 'game-awards-2025': { seasonId: 'game-awards-2025', granted: false, recipients: [] } };
    await pintar();

    await userEvent.click(interruptor());

    expect(setGrantedMock).toHaveBeenCalledWith('game-awards-2025', 'Game Awards 2025', true);
    await waitFor(() => expect(avisos).toContain(L.awardGranted(2)));
  });

  // Va al final de la fila, después de borrar: es lo que pidió el panel y lo que lo separa de las acciones con
  // rótulo.
  it('el interruptor es el último de la fila', async () => {
    await pintar();
    const acciones = [...document.querySelectorAll('.premios-admin__cat-actions > *')];
    expect(acciones.at(-1)).toBe(interruptor());
  });

  // Borrar una edición se lleva su logro de los perfiles: el aviso lo dice, porque es un cambio que se ve en
  // perfiles de otra gente.
  it('al borrar avisa de cuántos perfiles pierden el logro', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await pintar();

    await userEvent.click(screen.getByRole('button', { name: L.remove }));

    expect(deleteMock).toHaveBeenCalledWith('game-awards-2025');
    await waitFor(() => expect(avisos.join(' ')).toContain(L.removedAwards(3)));
  });
});
