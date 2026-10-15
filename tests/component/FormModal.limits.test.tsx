import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormModal } from '../../src/view/modals/FormModal';
import { GAME_LIMITS } from '../../src/core/constants/gameLimits';
import type { GameDraft } from '../../src/viewmodel/useGameListViewModel';

// Los topes del formulario (`GAME_LIMITS`, 15-10-2026): frenan lo que se escribe y nunca recortan lo que ya había.

function makeDraft(over: Partial<GameDraft> = {}): GameDraft {
  return {
    id: 1,
    name: 'Halo',
    genres: ['RPG'],
    platforms: ['PC'],
    steamDeck: false,
    score: 5,
    years: [2024],
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

function renderForm(draft: Partial<GameDraft> = {}) {
  const onSave = vi.fn();
  render(
    <FormModal
      open
      draft={makeDraft(draft)}
      currentTab="c"
      lookups={{ genres: [], platforms: [], strengths: [], weaknesses: [] }}
      findDuplicate={() => null}
      onClose={vi.fn()}
      onSave={onSave}
    />,
  );
  return { onSave, save: () => fireEvent.click(screen.getByRole('button', { name: 'Guardar' })) };
}

describe('FormModal — topes', () => {
  it('el nombre no pasa de su tope y lo dice al llegar', () => {
    renderForm({ name: '' });
    const name = screen.getByLabelText('Nombre');
    fireEvent.change(name, { target: { value: 'x'.repeat(GAME_LIMITS.name + 5) } });
    expect(name).toHaveValue('x'.repeat(GAME_LIMITS.name));
    expect(screen.getByText(`Máximo ${GAME_LIMITS.name} caracteres`)).toBeInTheDocument();
  });

  it('un nombre que ya pasaba del tope se abre entero y se guarda tal cual', () => {
    const long = 'y'.repeat(GAME_LIMITS.name + 10);
    const { onSave, save } = renderForm({ name: long });
    expect(screen.getByLabelText('Nombre')).toHaveValue(long);
    save();
    expect(onSave.mock.calls[0][0].name).toBe(long);
  });

  it('cada etiqueta se recorta a su tope, también al pegar varias', () => {
    const { onSave, save } = renderForm({ platforms: [] });
    const platforms = screen.getByLabelText('Plataformas');
    const long = 'P'.repeat(GAME_LIMITS.tagLength.platforms + 8);
    fireEvent.change(platforms, { target: { value: `${long}, Switch, ` } });
    save();
    expect(onSave.mock.calls[0][0].platforms).toEqual(['P'.repeat(GAME_LIMITS.tagLength.platforms), 'Switch']);
  });

  it('una lista llena no admite más, lo dice y deja de sugerir', async () => {
    const user = userEvent.setup();
    const full = Array.from({ length: GAME_LIMITS.tagCount.genres }, (_, i) => `Género ${i}`);
    const { onSave, save } = renderForm({ genres: full.slice(0, -1) });
    const genres = screen.getByLabelText('Géneros');

    // Pegar dos cuando cabe una: entra la primera.
    fireEvent.change(genres, { target: { value: 'Género 4, Otro, ' } });
    expect(screen.getByText(`Has llegado al máximo de ${GAME_LIMITS.tagCount.genres}`)).toBeInTheDocument();
    expect(genres).toHaveAttribute('readonly');

    await user.type(genres, 'Más');
    expect(genres).toHaveValue('');
    save();
    expect(onSave.mock.calls[0][0].genres).toEqual(full);
  });

  it('los años, desde 1970', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText('Años completado'), '1969{Enter}');
    expect(screen.getByText(/entre 1970 y/)).toBeInTheDocument();
  });
});

describe('FormModal — horas en español', () => {
  it('se enseñan con coma decimal', () => {
    renderForm({ hours: 12.5 });
    expect(screen.getByLabelText('Horas jugadas')).toHaveValue('12,5');
  });

  it('el punto se convierte en coma y no da error', async () => {
    const user = userEvent.setup();
    const { onSave, save } = renderForm();
    const hours = screen.getByLabelText('Horas jugadas');
    await user.type(hours, '12.5');
    expect(hours).toHaveValue('12,5');
    expect(hours).not.toHaveAttribute('aria-invalid');
    save();
    expect(onSave.mock.calls[0][0].hours).toBe(12.5);
  });

  it('una sola coma y dos decimales como mucho', async () => {
    const user = userEvent.setup();
    renderForm();
    const hours = screen.getByLabelText('Horas jugadas');
    await user.type(hours, '1,2,345');
    expect(hours).toHaveValue('1,23');
  });

  it('por encima del tope no entra y lo dice', async () => {
    const user = userEvent.setup();
    const { onSave, save } = renderForm();
    const hours = screen.getByLabelText('Horas jugadas');
    await user.type(hours, '99999');
    expect(hours).toHaveValue('9999');
    expect(screen.getByText('Como mucho 9999 horas')).toBeInTheDocument();
    save();
    expect(onSave.mock.calls[0][0].hours).toBe(9999);
  });
});
