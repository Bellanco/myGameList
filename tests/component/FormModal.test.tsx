import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormModal } from '../../src/view/modals/FormModal';
import type { GameItem } from '../../src/model/types/game';
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

type Lookups = { genres: string[]; platforms: string[]; strengths: string[]; weaknesses: string[] };
const NO_LOOKUPS: Lookups = { genres: [], platforms: [], strengths: [], weaknesses: [] };

// P3: el borrador es local al modal. Tipear NO debe emitir nada al padre por pulsación; solo `onSave` propaga.
describe('FormModal — draft local (P3)', () => {
  it('does not call any parent callback while typing (no per-keystroke re-render of the tree)', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <FormModal
        open
        draft={makeDraft({ id: 1, name: '', genres: ['RPG'], platforms: ['PC'], score: 5, years: [2024] })}
        currentTab="c"
        lookups={NO_LOOKUPS}
        findDuplicate={() => null}
        onClose={onClose}
        onSave={onSave}
      />,
    );

    await user.type(screen.getByPlaceholderText('Ej: The Witcher 3'), 'Halo');

    // Ningún callback del padre se dispara por tecla.
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('emits the locally edited draft only on save', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <FormModal
        open
        draft={makeDraft({ id: 1, name: 'Old', genres: ['RPG'], platforms: ['PC'], score: 5, years: [2024] })}
        currentTab="c"
        lookups={NO_LOOKUPS}
        findDuplicate={() => null}
        onClose={vi.fn()}
        onSave={onSave}
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

// Duplicados: un nombre que ya está en cualquier lista no puede volver a darse de alta. El aviso sale mientras se
// escribe (antes de rellenar el resto del formulario) y Guardar no llega a emitir el borrador.
describe('FormModal — nombre repetido', () => {
  const existing = { id: 7, _ts: 0, name: 'Halo Infinite', genres: [], platforms: [], steamDeck: false, review: '', score: 0 } as GameItem;

  /** Simula el buscador real del view-model: compara sin distinguir mayúsculas y respeta el `ignoreId`. */
  const findDuplicate = (name: string, ignoreId?: number) =>
    name.trim().toLowerCase() === 'halo infinite' && ignoreId !== existing.id ? { tab: 'c' as const, game: existing } : null;

  function renderNewGame(onSave = vi.fn()) {
    render(
      <FormModal
        open
        draft={makeDraft({ genres: ['RPG'], platforms: ['PC'], score: 5, years: [2024] })}
        currentTab="c"
        lookups={NO_LOOKUPS}
        findDuplicate={findDuplicate}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    return { onSave, nameInput: screen.getByPlaceholderText('Ej: The Witcher 3') };
  }

  it('avisa mientras se escribe un nombre que ya está en las listas', async () => {
    const user = userEvent.setup();
    const { nameInput } = renderNewGame();

    await user.type(nameInput, 'halo infinite'); // otra grafía: la comparación no distingue mayúsculas

    expect(screen.getByRole('alert')).toHaveTextContent('Ya tienes "Halo Infinite" en Completados.');
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
  });

  it('no guarda el duplicado y el aviso queda DENTRO del modal (no en el banner de la página)', async () => {
    const user = userEvent.setup();
    const { onSave, nameInput } = renderNewGame();

    await user.type(nameInput, 'Halo Infinite');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSave).not.toHaveBeenCalled();
    // El mensaje sale dos veces: bajo el campo y en el resumen del pie, junto al botón Guardar.
    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((el) => el.textContent?.includes('Ya tienes "Halo Infinite" en Completados.'))).toBe(true);
    expect(screen.getByText('Falta 1 cosa para poder guardar:')).toBeTruthy();
  });

  it('editar el propio juego con su mismo nombre sí guarda (no se compara consigo mismo)', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <FormModal
        open
        draft={makeDraft({ id: existing.id, name: 'Halo Infinite', genres: ['RPG'], platforms: ['PC'], score: 5, years: [2024] })}
        currentTab="c"
        lookups={NO_LOOKUPS}
        findDuplicate={findDuplicate}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    expect(screen.queryByRole('alert')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

// Etiquetas: ni las mayúsculas ni las tildes crean etiquetas gemelas, y las comas separan.
describe('FormModal — etiquetas', () => {
  function renderTags(lookups: Lookups = NO_LOOKUPS, draft: Partial<GameDraft> = {}) {
    const onSave = vi.fn();
    render(
      <FormModal
        open
        draft={makeDraft({ id: 1, name: 'Halo', platforms: ['PC'], score: 5, years: [2024], ...draft })}
        currentTab="c"
        lookups={lookups}
        findDuplicate={() => null}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    return { onSave, genres: screen.getByPlaceholderText('Ej: Acción') };
  }

  it('adopta la grafía que ya existe en las listas aunque se escriba sin tilde ni mayúsculas', async () => {
    const user = userEvent.setup();
    const { onSave, genres } = renderTags({ ...NO_LOOKUPS, genres: ['Acción'] });

    await user.type(genres, 'accion{Enter}');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSave.mock.calls[0][0].genres).toEqual(['Acción']);
  });

  it('no duplica una etiqueta que ya está en el juego escrita de otra forma', async () => {
    const user = userEvent.setup();
    const { onSave, genres } = renderTags(NO_LOOKUPS, { genres: ['Acción'] });

    await user.type(genres, 'ACCION{Enter}');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSave.mock.calls[0][0].genres).toEqual(['Acción']);
  });

  it('separa por comas y punto y coma, y deja lo último a medias en el campo', async () => {
    const user = userEvent.setup();
    const { onSave, genres } = renderTags();

    await user.type(genres, 'Acción, RPG; Aventura');

    expect(screen.getByText('Acción')).toBeTruthy();
    expect(screen.getByText('RPG')).toBeTruthy();
    expect(genres).toHaveValue('Aventura'); // aún se está escribiendo: no se cierra sin separador

    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSave.mock.calls[0][0].genres).toEqual(['Acción', 'RPG', 'Aventura']);
  });

  it('un pegado con separador en medio conserva lo que queda escrito detrás', async () => {
    const user = userEvent.setup();
    const { onSave, genres } = renderTags();

    await user.click(genres);
    await user.paste('Acción, RPG; Aventura'); // sin separador final: "Aventura" sigue a medias

    expect(genres).toHaveValue('Aventura');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSave.mock.calls[0][0].genres).toEqual(['Acción', 'RPG', 'Aventura']);
  });

  it('reparte una lista pegada de una vez', async () => {
    const user = userEvent.setup();
    const { onSave, genres } = renderTags();

    await user.click(genres);
    await user.paste('Acción, RPG, Aventura,');

    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSave.mock.calls[0][0].genres).toEqual(['Acción', 'RPG', 'Aventura']);
  });

  it('guarda lo escrito en el campo aunque no se pulse Enter', async () => {
    const user = userEvent.setup();
    const { onSave, genres } = renderTags();

    await user.type(genres, 'Aventura');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSave.mock.calls[0][0].genres).toEqual(['Aventura']);
  });

  it('un año mal escrito no entra y explica qué se espera', async () => {
    const user = userEvent.setup();
    const { onSave } = renderTags();
    const years = screen.getByPlaceholderText(`Ej: ${new Date().getFullYear()}`);

    await user.type(years, '20{Enter}');

    expect(screen.getByText(/Escribe el año con 4 cifras/)).toBeTruthy();
    expect(years).toHaveValue('20'); // se queda para poder corregirlo

    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSave).not.toHaveBeenCalled();
  });
});

// Horas jugadas: el negativo no se puede ni escribir.
describe('FormModal — horas jugadas', () => {
  function renderHours(draft: Partial<GameDraft> = {}) {
    const onSave = vi.fn();
    render(
      <FormModal
        open
        draft={makeDraft({ id: 1, name: 'Halo', genres: ['RPG'], platforms: ['PC'], score: 5, years: [2024], ...draft })}
        currentTab="c"
        lookups={NO_LOOKUPS}
        findDuplicate={() => null}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    return { onSave, hours: screen.getByPlaceholderText('Ej: 120') };
  }

  it('descarta el signo menos al teclearlo y lo dice', async () => {
    const user = userEvent.setup();
    const { onSave, hours } = renderHours();

    await user.type(hours, '-5');

    expect(hours).toHaveValue('5');
    expect(screen.getByText('Las horas jugadas no pueden ser negativas.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSave.mock.calls[0][0].hours).toBe(5);
  });

  it('admite la coma decimal', async () => {
    const user = userEvent.setup();
    const { onSave, hours } = renderHours();

    await user.type(hours, '12,5');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSave.mock.calls[0][0].hours).toBe(12.5);
  });

  it('vaciar el campo deja las horas sin dato (null), no en cero', async () => {
    const user = userEvent.setup();
    const { onSave, hours } = renderHours({ hours: 40 });

    expect(hours).toHaveValue('40');
    await user.clear(hours);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSave.mock.calls[0][0].hours).toBeNull();
  });
});

// Los mensajes de validación viven DENTRO del modal: el banner de la página queda detrás del <dialog>.
describe('FormModal — mensajes de error', () => {
  it('enumera todo lo que falta y enfoca el primer campo', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <FormModal
        open
        draft={makeDraft()}
        currentTab="c"
        lookups={NO_LOOKUPS}
        findDuplicate={() => null}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Faltan 5 cosas para poder guardar:')).toBeTruthy();
    expect(screen.getAllByText('Escribe el nombre del juego.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Añade al menos un género.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Añade al menos una plataforma.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Añade al menos un año de finalización.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Selecciona una puntuación').length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(screen.getByPlaceholderText('Ej: The Witcher 3'));
  });

  it('el resumen del pie se retira solo a los 5 s, pero el mensaje de cada campo se queda', async () => {
    vi.useFakeTimers();
    try {
      render(
        <FormModal
          open
          draft={makeDraft()}
          currentTab="c"
          lookups={NO_LOOKUPS}
          findDuplicate={() => null}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
      expect(screen.getByText('Faltan 5 cosas para poder guardar:')).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(screen.queryByText('Faltan 5 cosas para poder guardar:')).toBeNull();
      expect(screen.getByText('Escribe el nombre del juego.')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('el mensaje de un campo desaparece en cuanto se corrige', async () => {
    const user = userEvent.setup();

    render(
      <FormModal
        open
        draft={makeDraft()}
        currentTab="c"
        lookups={NO_LOOKUPS}
        findDuplicate={() => null}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getAllByText('Añade al menos un género.').length).toBeGreaterThan(0);

    await user.type(screen.getByPlaceholderText('Ej: Acción'), 'RPG{Enter}');
    expect(screen.queryByText('Añade al menos un género.')).toBeNull();
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
        lookups={NO_LOOKUPS}
        findDuplicate={() => null}
        onClose={onClose}
        onSave={vi.fn()}
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
