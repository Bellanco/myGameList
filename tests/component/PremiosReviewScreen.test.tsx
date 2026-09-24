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

function pintar(
  votes: Record<string, { id: string; name: string }>,
  onSubmit = vi.fn(),
  readOnly = false,
) {
  render(
    <MemoryRouter>
      <PremiosReviewScreen
        categories={categories}
        votes={votes}
        defaultName="Ana"
        remainingOpportunities={readOnly ? 0 : 5}
        isEdit={false}
        submitting={false}
        error=""
        onSubmit={onSubmit}
        readOnly={readOnly}
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

  // SIN OPORTUNIDADES SE MIRA, NO SE ENVÍA: antes, a quien se le acababan se le enseñaba un cartel que se
  // guardaba para sí lo único que se venía a ver.
  describe('solo mirar', () => {
    it('enseña la papeleta sin el nombre ni el botón de enviar', () => {
      pintar(completa, vi.fn(), true);

      // Con el selector: el nombre sale también en la portada de casa de la carátula.
      expect(screen.getByText('Uno', { selector: '.premios-review__pick' })).toBeInTheDocument();
      expect(screen.queryByLabelText(L.nameLabel)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: L.submit })).not.toBeInTheDocument();
      // Y NO SE AFIRMA NADA sobre las oportunidades ni se promete poder cambiar: aquí se llega con el cupo
      // agotado y también con él intacto. El título lo dice y ya: son tus elecciones.
      expect(screen.getByRole('heading', { name: L.readTitle })).toBeInTheDocument();
      expect(screen.queryByText(L.subtitle)).not.toBeInTheDocument();
    });

    it('las categorías dejan de llevar a la votación: no hay nada que cambiar', () => {
      pintar(completa, vi.fn(), true);
      expect(screen.queryByRole('link', { name: L.goToCategory('Juego del año') })).not.toBeInTheDocument();
    });
  });
});