import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormModal } from '../../src/view/modals/FormModal';
import type { GameDraft } from '../../src/viewmodel/useGameListViewModel';

function makeDraft(over: Partial<GameDraft> = {}): GameDraft {
  return {
    name: '',
    genres: [],
    platforms: [],
    steamDeck: false,
    score: 0,
    years: [],
    strengths: [],
    weaknesses: [],
    reasons: [],
    replayable: false,
    retry: false,
    hours: null,
    scored: false,
    review: '',
    ...over,
  };
}

// P3: el borrador es local al modal. Tipear NO debe emitir nada al padre por pulsación; solo `onSave` propaga.
describe('FormModal — draft local (P3)', () => {
  it('does not call any parent callback while typing (no per-keystroke re-render of the tree)', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();
    const onNotice = vi.fn();

    render(
      <FormModal
        open
        draft={makeDraft({ id: 1, name: '', genres: ['RPG'], platforms: ['PC'], score: 5, years: [2024] })}
        currentTab="c"
        lookups={{ genres: [], platforms: [], strengths: [], weaknesses: [] }}
        onClose={onClose}
        onSave={onSave}
        onNotice={onNotice}
      />,
    );

    await user.type(screen.getByPlaceholderText('Ej: The Witcher 3'), 'Halo');

    // Ningún callback del padre se dispara por tecla.
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onNotice).not.toHaveBeenCalled();
  });

  it('emits the locally edited draft only on save', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <FormModal
        open
        draft={makeDraft({ id: 1, name: 'Old', genres: ['RPG'], platforms: ['PC'], score: 5, years: [2024] })}
        currentTab="c"
        lookups={{ genres: [], platforms: [], strengths: [], weaknesses: [] }}
        onClose={vi.fn()}
        onSave={onSave}
        onNotice={vi.fn()}
      />,
    );

    const nameInput = screen.getByPlaceholderText('Ej: The Witcher 3');
    await user.clear(nameInput);
    await user.type(nameInput, 'Halo Infinite');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({ name: 'Halo Infinite', id: 1 });
  });
});

// A11y-1: <dialog> nativo en modo modal (showModal) → Esc cierra (evento `cancel`) y click en backdrop cierra.
describe('FormModal — native dialog (A11y-1)', () => {
  function renderModal(onClose = vi.fn()) {
    render(
      <FormModal
        open
        draft={makeDraft({ id: 1, genres: ['RPG'], platforms: ['PC'], score: 5, years: [2024] })}
        currentTab="c"
        lookups={{ genres: [], platforms: [], strengths: [], weaknesses: [] }}
        onClose={onClose}
        onSave={vi.fn()}
        onNotice={vi.fn()}
      />,
    );
    return onClose;
  }

  it('renders as a <dialog> and opens it modally', () => {
    renderModal();
    const dialog = screen.getByRole('dialog');
    expect(dialog.tagName).toBe('DIALOG');
    expect((dialog as HTMLDialogElement).open).toBe(true);
  });

  it('Esc (native cancel event) calls onClose', () => {
    const onClose = renderModal();
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('mousedown on the backdrop (the dialog itself) calls onClose', () => {
    const onClose = renderModal();
    fireEvent.mouseDown(screen.getByRole('dialog')); // target === dialog → backdrop
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
