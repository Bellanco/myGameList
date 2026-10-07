import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PremiosEnviada } from '../../src/view/components/premios/PremiosEstado';
import { PREMIOS_UI } from '../../src/core/constants/premiosLabels';

const L = PREMIOS_UI.enviada;

const pintar = (props: Partial<Parameters<typeof PremiosEnviada>[0]> = {}) =>
  render(
    <MemoryRouter>
      <PremiosEnviada displayName="Ana" remainingOpportunities={3} {...props} />
    </MemoryRouter>,
  );

describe('PremiosEnviada — la confirmación del voto', () => {
  /**
   * UNA SOLA SALIDA, Y ES LA PUERTA. Aquí hubo cuatro botones —corregir, ver los votos, los resultados y
   * volver—, los mismos que la portada ofrece según lo que se pueda hacer: dos sitios con las mismas reglas, y
   * el de aquí se quedaba atrás (ofrecía corregir sin mirar si quedaban oportunidades).
   */
  it('solo ofrece volver a Premios', () => {
    pintar();

    const enlaces = screen.getAllByRole('link');
    expect(enlaces).toHaveLength(1);
    expect(enlaces[0]).toHaveAccessibleName(PREMIOS_UI.cerrada.toHome);
  });

  it('da las gracias por su nombre y dice lo que le queda', () => {
    pintar({ remainingOpportunities: 0 });
    expect(screen.getByText(L.thanks('Ana'))).toBeInTheDocument();
    expect(screen.getByText(L.editHint(0))).toBeInTheDocument();
  });

  // Reenviar una papeleta idéntica no escribe nada: lo primero que hay que decir es que no ha costado.
  it('avisa cuando no se había cambiado nada', () => {
    pintar({ unchanged: true });
    expect(screen.getByText(L.unchanged)).toBeInTheDocument();
  });
});

/**
 * LA INVITACIÓN A QUEDARSE, a quien no tiene nada más de la aplicación. Quién la ve lo decide el hub; aquí, que se
 * pinte bien y que su botón sea EL camino: la puerta de la sección pasa a secundaria para no tener dos principales.
 */
describe('PremiosEnviada — la invitación al resto de la aplicación', () => {
  it('sin invitación no hay nada de ella', () => {
    pintar();
    expect(screen.queryByRole('region', { name: L.invite.sectionAria })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: PREMIOS_UI.cerrada.toHome })).toHaveClass('btn-primary');
  });

  it('con invitación: lleva a la lista, se puede aplazar, y volver a Premios pasa a secundario', async () => {
    const onJoin = vi.fn();
    const onLater = vi.fn();
    pintar({ invite: { onJoin, onLater } });

    expect(screen.getByRole('region', { name: L.invite.sectionAria })).toBeInTheDocument();
    const unirse = screen.getByRole('link', { name: L.invite.join });
    expect(unirse).toHaveAttribute('href', '/completados');
    expect(unirse).toHaveClass('btn-primary');
    expect(screen.getByRole('link', { name: PREMIOS_UI.cerrada.toHome })).not.toHaveClass('btn-primary');

    await userEvent.click(unirse);
    expect(onJoin).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: L.invite.later }));
    expect(onLater).toHaveBeenCalledTimes(1);
  });
});

