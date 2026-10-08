import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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
