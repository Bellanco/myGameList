import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportFieldPrefsCard } from '../../src/view/components/import/ImportFieldPrefsCard';
import { DEFAULT_IMPORT_FIELD_PREFS } from '../../src/core/import/fieldPrefs';
import { UI_MESSAGES } from '../../src/core/constants/labels';

const M = UI_MESSAGES.import.inbox.fields;

// La preferencia se aplica a TODOS los juegos, en dos grupos independientes (nuevos / ya en tus listas).
describe('ImportFieldPrefsCard — "qué datos traer"', () => {
  it('plegada muestra el resumen de cada grupo (nota fuera en los que ya tienes)', () => {
    render(<ImportFieldPrefsCard prefs={DEFAULT_IMPORT_FIELD_PREFS} onChange={vi.fn()} />);
    const summaries = screen.getAllByText(/Se traen:/);
    expect(summaries).toHaveLength(2);
    expect(summaries[0].textContent).toContain('nota'); // nuevos: todo
    expect(summaries[1].textContent).not.toContain('nota'); // existentes: sin nota por defecto
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('al desplegar, cada campo tiene su casilla por grupo y notifica el cambio', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ImportFieldPrefsCard prefs={DEFAULT_IMPORT_FIELD_PREFS} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: M.toggleShow }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(8); // 4 campos × 2 grupos

    // Desmarcar géneros de los juegos NUEVOS.
    await user.click(screen.getByRole('checkbox', { name: M.fieldAria(M.labels.genres, M.newGames) }));
    expect(onChange).toHaveBeenCalledWith('newGames', 'genres', false);

    // Marcar la nota de los que YA tienes (venía desactivada).
    await user.click(screen.getByRole('checkbox', { name: M.fieldAria(M.labels.grade, M.existingGames) }));
    expect(onChange).toHaveBeenCalledWith('existingGames', 'grade', true);
  });

  it('sin ningún campo activo el resumen lo dice', () => {
    const none = { platforms: false, genres: false, hours: false, grade: false };
    render(<ImportFieldPrefsCard prefs={{ newGames: none, existingGames: none }} onChange={vi.fn()} />);
    expect(screen.getAllByText(M.summary(''))).toHaveLength(2);
  });
});
