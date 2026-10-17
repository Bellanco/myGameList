import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GradeLine } from '../../src/view/components/GradeLine';

describe('GradeLine — teclado', () => {
  it('Tab cae en la cifra, no en la barra', async () => {
    const user = userEvent.setup();
    render(
      <>
        <input aria-label="Nombre" />
        <GradeLine value={50} onChange={vi.fn()} />
      </>,
    );
    await user.click(screen.getByLabelText('Nombre'));
    await user.tab();
    expect(screen.getByLabelText('Nota, en número')).toHaveFocus();
  });

  it('desde la cifra, ↑ ↓ mueven un punto y RePág/AvPág diez, sin salir de 0–100', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<GradeLine value={50} onChange={onChange} />);
    await user.click(screen.getByLabelText('Nota, en número'));
    await user.keyboard('{ArrowUp}');
    expect(onChange).toHaveBeenLastCalledWith(51);
    await user.keyboard('{PageDown}');
    expect(onChange).toHaveBeenLastCalledWith(40);
    rerender(<GradeLine value={95} onChange={onChange} />);
    await user.keyboard('{PageUp}');
    expect(onChange).toHaveBeenLastCalledWith(100);
  });
});
