import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GameTable } from '../../src/view/components/GameTable';
import { UI_MESSAGES } from '../../src/core/constants/labels';

// Una lista vacía se llena de dos maneras y la pantalla solo ofrecía UNA: añadir juego a juego. La importación
// desde Playnite es la que la llena de golpe, así que el estado vacío la ofrece al lado. Desde que se eliminó
// la pantalla `/integraciones`, el selector de archivo se abre AQUÍ mismo en vez de navegar a otra pantalla.
// Cada CTA es opcional por separado, y en modo lectura (el perfil de otra persona) no se ofrece ninguno.

const IMPORT_UI = UI_MESSAGES.import.integrations;

function renderEmpty(props: Partial<Parameters<typeof GameTable>[0]> = {}) {
  return render(
    <GameTable
      games={[]}
      currentTab="c"
      expandedId={null}
      onExpandedChange={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onMigrate={vi.fn()}
      tabActions={[]}
      {...props}
    />,
  );
}

describe('GameTable — estado vacío', () => {
  it('ofrece añadir e importar', () => {
    renderEmpty({ onAddGame: vi.fn(), onImportLibrary: vi.fn() });

    expect(screen.getByRole('button', { name: UI_MESSAGES.table.emptyCta })).toBeTruthy();
    expect(screen.getByLabelText(IMPORT_UI.importAria)).toBeTruthy();
  });

  it('entrega el fichero elegido a quien lo pide', async () => {
    const onImportLibrary = vi.fn();
    renderEmpty({ onAddGame: vi.fn(), onImportLibrary });

    const file = new File(['[]'], 'biblioteca.json', { type: 'application/json' });
    await userEvent.upload(screen.getByLabelText(IMPORT_UI.importAria) as HTMLInputElement, file);

    expect(onImportLibrary).toHaveBeenCalledTimes(1);
    expect(onImportLibrary.mock.calls[0][0]).toBe(file);
  });

  it('ofrece la bandeja solo si quedan importados sin clasificar', () => {
    const onOpenInbox = vi.fn();
    const { rerender } = renderEmpty({ onAddGame: vi.fn(), onImportLibrary: vi.fn(), inboxCount: 0, onOpenInbox });

    expect(screen.queryByRole('button', { name: IMPORT_UI.viewInbox(0) })).toBeNull();

    rerender(
      <GameTable
        games={[]}
        currentTab="c"
        expandedId={null}
        onExpandedChange={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onMigrate={vi.fn()}
        tabActions={[]}
        onAddGame={vi.fn()}
        onImportLibrary={vi.fn()}
        inboxCount={3}
        onOpenInbox={onOpenInbox}
      />,
    );

    expect(screen.getByRole('button', { name: IMPORT_UI.viewInbox(3) })).toBeTruthy();
  });

  it('pinta solo el CTA que recibe', () => {
    renderEmpty({ onAddGame: vi.fn() });

    expect(screen.getByRole('button', { name: UI_MESSAGES.table.emptyCta })).toBeTruthy();
    expect(screen.queryByLabelText(IMPORT_UI.importAria)).toBeNull();
  });

  it('en modo lectura no ofrece ninguno', () => {
    renderEmpty({ onAddGame: vi.fn(), onImportLibrary: vi.fn(), readOnly: true });

    expect(screen.getByText(UI_MESSAGES.table.emptyTitle)).toBeTruthy();
    expect(screen.queryByRole('button', { name: UI_MESSAGES.table.emptyCta })).toBeNull();
    expect(screen.queryByLabelText(IMPORT_UI.importAria)).toBeNull();
  });
});
