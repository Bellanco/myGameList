import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PremiosReviewScreen } from '../../src/view/components/premios/PremiosReviewScreen';
import { PREMIOS_UI } from '../../src/core/constants/premiosLabels';
import type { PremiosCategory } from '../../src/model/types/premios';

const L = PREMIOS_UI.revisar;

const categoria = (id: string, titulo: string): PremiosCategory => ({
  id,
  title: { es: titulo },
  weight: 1,
  options: [
    { id: `${id}_option_0`, name: 'Uno' },
    { id: `${id}_option_1`, name: 'Otro' },
  ],
});

const categories = [categoria('goty', 'Juego del año'), categoria('arte', 'Mejor dirección de arte')];

const completa = {
  goty: { id: 'goty_option_0', name: 'Uno' },
  arte: { id: 'arte_option_1', name: 'Otro' },
};

function pintar(votes: Record<string, { id: string; name: string }>, onSubmit = vi.fn()) {
  render(
    <MemoryRouter>
      <PremiosReviewScreen
        categories={categories}
        votes={votes}
        defaultName="Ana"
        remainingOpportunities={5}
        isEdit={false}
        submitting={false}
        error=""
        onSubmit={onSubmit}
      />
    </MemoryRouter>,
  );
  return onSubmit;
}

describe('PremiosReviewScreen', () => {
  // LA PAPELETA SE ENVÍA COMPLETA: una a medias compite en la misma clasificación que las enteras.
  it('no deja enviar mientras falte alguna categoría', () => {
    pintar({ goty: completa.goty });

    expect(screen.getByRole('button', { name: L.submit })).toBeDisabled();
    expect(screen.getByText(new RegExp(L.mustComplete))).toBeInTheDocument();
  });

  it('con todas votadas se envía con el nombre escrito', async () => {
    const onSubmit = pintar(completa);

    const boton = screen.getByRole('button', { name: L.submit });
    expect(boton).toBeEnabled();
    await userEvent.click(boton);
    expect(onSubmit).toHaveBeenCalledWith('Ana');
  });

  it('sin nombre tampoco se envía: es lo que sale en la clasificación', async () => {
    pintar(completa);

    await userEvent.clear(screen.getByLabelText(L.nameLabel));
    expect(screen.getByRole('button', { name: L.submit })).toBeDisabled();
  });

  // La rejilla es un índice: cada tarjeta lleva a su categoría, votada o no.
  it('cada categoría lleva a su paso de la votación', () => {
    pintar({ goty: completa.goty });

    expect(screen.getByRole('link', { name: L.goToCategory('Juego del año') })).toHaveAttribute(
      'href',
      '/premios/votar/1',
    );
    expect(screen.getByRole('link', { name: L.goToCategory('Mejor dirección de arte') })).toHaveAttribute(
      'href',
      '/premios/votar/2',
    );
  });

  it('el atajo de lo que falta lleva a la primera sin votar', () => {
    pintar({ goty: completa.goty });
    expect(screen.getByRole('link', { name: L.firstPending })).toHaveAttribute('href', '/premios/votar/2');
  });
});
