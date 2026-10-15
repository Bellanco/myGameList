import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickPicks } from '../../src/view/components/QuickPicks';

/** Dos campos seguidos, el primero con sus sugerencias debajo, como en el formulario del juego. */
function renderFields() {
  render(
    <>
      <input id="draft-platforms" aria-label="Plataformas" />
      <QuickPicks options={['Steam', 'PC', 'Switch']} taken={[]} label="Tus plataformas" fieldId="draft-platforms"
        onPick={vi.fn()} />
      <input id="draft-genres" aria-label="Géneros" />
    </>,
  );
}

describe('QuickPicks — teclado', () => {
  it('Tab pasa del campo al siguiente sin detenerse en las sugerencias', async () => {
    const user = userEvent.setup();
    renderFields();
    await user.click(screen.getByLabelText('Plataformas'));
    await user.tab();
    expect(screen.getByLabelText('Géneros')).toHaveFocus();
  });

  it('↓ entra en la fila, ← → la recorren y ↑ vuelve al campo', async () => {
    const user = userEvent.setup();
    renderFields();
    const field = screen.getByLabelText('Plataformas');
    expect(field).toHaveAttribute('aria-keyshortcuts', 'ArrowDown');
    await user.click(field);
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Añadir Steam' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Añadir PC' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}{ArrowUp}');
    expect(field).toHaveFocus();
  });
});
