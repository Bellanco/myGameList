import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmModal } from '../../src/view/modals/ConfirmModal';

// A11y-1: ConfirmModal usa <dialog> en modo modal (showModal) → focus trap, ::backdrop y Esc → onCancel.
describe('ConfirmModal — native dialog (A11y-1)', () => {
  it('opens modally and shows the title', () => {
    render(<ConfirmModal open title="¿Eliminar juego?" onCancel={vi.fn()} onConfirm={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect((dialog as HTMLDialogElement).open).toBe(true);
    expect(screen.getByText('¿Eliminar juego?')).toBeInTheDocument();
  });

  it('is closed (not open) when open=false', () => {
    render(<ConfirmModal open={false} title="x" onCancel={vi.fn()} onConfirm={vi.fn()} />);
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(false);
  });

  it('Esc (native cancel event) calls onCancel', () => {
    const onCancel = vi.fn();
    render(<ConfirmModal open title="x" onCancel={onCancel} onConfirm={vi.fn()} />);
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('confirm/cancel buttons call their handlers', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<ConfirmModal open title="x" onCancel={onCancel} onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
