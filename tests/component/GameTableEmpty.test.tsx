import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GameTable } from '../../src/view/components/GameTable';
import { UI_MESSAGES } from '../../src/core/constants/labels';

// Una lista vacía se llena de dos maneras y la pantalla solo ofrecía UNA: añadir juego a juego. La importación
// desde Playnite es la que la llena de golpe, así que el estado vacío la ofrece al lado. Cada CTA es opcional
// por separado, y en modo lectura (el perfil de otra persona) no se ofrece ninguno.

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
    renderEmpty({ onAddGame: vi.fn(), onImportGames: vi.fn() });

    expect(screen.getByRole('button', { name: UI_MESSAGES.table.emptyCta })).toBeTruthy();
    expect(screen.getByRole('button', { name: UI_MESSAGES.table.emptyImportCta })).toBeTruthy();
  });

  it('avisa a quien lo pide al pulsar importar', async () => {
    const onImportGames = vi.fn();
    renderEmpty({ onAddGame: vi.fn(), onImportGames });

    await userEvent.click(screen.getByRole('button', { name: UI_MESSAGES.table.emptyImportCta }));
    expect(onImportGames).toHaveBeenCalledTimes(1);
  });

  it('pinta solo el CTA que recibe', () => {
    renderEmpty({ onAddGame: vi.fn() });

    expect(screen.getByRole('button', { name: UI_MESSAGES.table.emptyCta })).toBeTruthy();
    expect(screen.queryByRole('button', { name: UI_MESSAGES.table.emptyImportCta })).toBeNull();
  });

  it('en modo lectura no ofrece ninguno', () => {
    renderEmpty({ onAddGame: vi.fn(), onImportGames: vi.fn(), readOnly: true });

    expect(screen.getByText(UI_MESSAGES.table.emptyTitle)).toBeTruthy();
    expect(screen.queryByRole('button', { name: UI_MESSAGES.table.emptyCta })).toBeNull();
    expect(screen.queryByRole('button', { name: UI_MESSAGES.table.emptyImportCta })).toBeNull();
  });
});
