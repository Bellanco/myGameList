// El aviso del hub se ANUNCIA (09-10-2026): región viva siempre montada, que es la única que el lector de pantalla
// lee cuando cambia. Antes el aviso solo se veía.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HubStatus } from '../../src/view/components/socialhub/HubStatus';
import { UI_MESSAGES } from '../../src/core/constants/labels';

describe('aviso de estado del hub', () => {
  it('la región viva existe aunque no haya aviso, y vacía', () => {
    render(<HubStatus status="" statusKind="" />);
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('al llegar un aviso, la MISMA región lo dice con su tono, y además se ve', () => {
    const { rerender } = render(<HubStatus status="" statusKind="" />);
    const region = screen.getByRole('status');

    rerender(<HubStatus status="Solicitud enviada." statusKind="ok" />);

    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent(`${UI_MESSAGES.statusKind.ok}: Solicitud enviada.`);
    expect(document.querySelector('.sync-status-msg.ok')).toHaveTextContent('Solicitud enviada.');
  });
});
