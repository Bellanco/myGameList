import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PremiosCerrada } from '../../src/view/components/premios/PremiosEstado';
import { PREMIOS_UI } from '../../src/core/constants/premiosLabels';

const L = PREMIOS_UI.cerrada;

const pintar = (props: Partial<Parameters<typeof PremiosCerrada>[0]> = {}) =>
  render(
    <MemoryRouter>
      <PremiosCerrada scheduled={false} hasResults={false} {...props} />
    </MemoryRouter>,
  );

describe('PremiosCerrada — llegar cuando ya no se puede votar', () => {
  /**
   * LO SUYO SIGUE AHÍ. Cerrar la votación cierra votar y corregir, no mirar: las reglas dejan leer la papeleta
   * propia sin mirar el plazo, y es lo último que queda de su voto antes de que la publicación lo retire.
   */
  it('a quien votó le ofrece ver sus votos', () => {
    pintar({ hasBallot: true });
    expect(screen.getByRole('link', { name: PREMIOS_UI.enviada.see })).toBeInTheDocument();
  });

  it('a quien no votó no le ofrece una papeleta que no existe', () => {
    pintar();
    expect(screen.queryByRole('link', { name: PREMIOS_UI.enviada.see })).not.toBeInTheDocument();
  });

  // Antes de empezar no hay nada que repasar: la papeleta, si la hay, es de otra edición ya retirada.
  it('con la votación aún por empezar tampoco', () => {
    pintar({ scheduled: true, hasBallot: true });
    expect(screen.queryByRole('link', { name: PREMIOS_UI.enviada.see })).not.toBeInTheDocument();
  });

  // Los resultados los decide quien llama (`areResultsOffered`): aquí solo se comprueba que no se inventa uno.
  it('no ofrece resultados si no se le dice que los hay', () => {
    pintar({ hasBallot: true });
    expect(screen.queryByRole('link', { name: L.toResults })).not.toBeInTheDocument();
    expect(screen.getByText(L.bodyPending)).toBeInTheDocument();
  });

  it('con archivo publicado sí los ofrece', () => {
    pintar({ hasResults: true });
    expect(screen.getByRole('link', { name: L.toResults })).toBeInTheDocument();
  });
});
