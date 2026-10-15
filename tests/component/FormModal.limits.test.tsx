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

  it('en los años solo entran cifras, cuatro como mucho', async () => {
    const user = userEvent.setup();
    const { onSave, save } = renderForm({ years: [] });
    const years = screen.getByLabelText('Años completado');
    expect(years).toHaveAttribute('inputmode', 'numeric');

    await user.type(years, '2o2a1-x');
    expect(years).toHaveValue('221');
    await user.clear(years);
    await user.type(years, '202456');
    expect(years).toHaveValue('2024');

    // Pegado con letras: las cifras sí, y los separadores siguen repartiendo.
    await user.clear(years);
    fireEvent.change(years, { target: { value: 'año 2020, abc2021, ' } });
    save();
    expect(onSave.mock.calls[0][0].years).toEqual([2020, 2021]);
  });

  it('un año imposible se avisa al escribir la cuarta cifra, sin esperar al Enter', async () => {
    const user = userEvent.setup();
    renderForm({ years: [] });
    const years = screen.getByLabelText('Años completado');
    await user.type(years, '421');
    expect(screen.queryByText(/Escribe un año entre/)).toBeNull();
    await user.type(years, '0');
    expect(screen.getByText(/Escribe un año entre 1970 y \d{4}\./)).toBeInTheDocument();
    expect(years).toHaveAttribute('aria-invalid', 'true');
    // Corregirlo quita el aviso.
    await user.type(years, '{Backspace}');
    expect(screen.queryByText(/Escribe un año entre/)).toBeNull();
  });

  it('los años, desde 1970', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText('Años completado'), '1969{Enter}');
    expect(screen.getByText(/entre 1970 y/)).toBeInTheDocument();
  });
});

describe('FormModal — mínimo del análisis', () => {
  const min = GAME_LIMITS.reviewMin;

  it('uno más corto que el mínimo no se guarda: dice cuánto falta y lleva el foco', () => {
    const { onSave, save } = renderForm();
    const review = screen.getByLabelText('Análisis');
    fireEvent.change(review, { target: { value: 'Muy bueno.' } });
    expect(screen.getByText(`Faltan ${min - 10} caracteres (mínimo ${min})`)).toBeInTheDocument();
    save();
    expect(onSave).not.toHaveBeenCalled();
    expect(review).toHaveAttribute('aria-invalid', 'true');
    expect(review).toHaveFocus();
    expect(screen.getAllByText(new RegExp(`al menos ${min} caracteres: faltan ${min - 10}`)).length).toBeGreaterThan(0);
  });

  it('los espacios de los extremos no cuentan; con el mínimo justo, se guarda', () => {
    const { onSave, save } = renderForm();
    const review = screen.getByLabelText('Análisis');
    fireEvent.change(review, { target: { value: `  ${'a'.repeat(min - 1)}  ` } });
    save();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(review, { target: { value: 'a'.repeat(min) } });
    expect(screen.getByText(`${min} / 22.500 caracteres`)).toBeInTheDocument();
    save();
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('vacío vale: el análisis es opcional', () => {
    const { onSave, save } = renderForm({ review: '' });
    save();
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('uno corto de antes se conserva al editar otros campos, pero no se puede cambiar por otro corto', () => {
    const { onSave, save } = renderForm({ review: 'Como juego, correcto.' });
    expect(screen.queryByText(/Faltan/)).toBeNull();
    save();
    expect(onSave.mock.calls[0][0].review).toBe('Como juego, correcto.');

    fireEvent.change(screen.getByLabelText('Análisis'), { target: { value: 'Como juego, regular.' } });
    save();
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('en próximos no hay análisis y no se exige nada', () => {
    const onSave = vi.fn();
    render(
      <FormModal
        open
        draft={makeDraft({ years: [], review: 'corto' })}
        currentTab="p"
        lookups={{ genres: [], platforms: [], strengths: [], weaknesses: [] }}
        findDuplicate={() => null}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSave).toHaveBeenCalledOnce();
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
