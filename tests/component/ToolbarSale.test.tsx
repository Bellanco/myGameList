// «EN OFERTA» Y LOS CHIPS DE PRECIO (segunda pasada de la P3): solo salen en Deseados con los precios encendidos.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Toolbar } from '../../src/view/components/Toolbar';
import { GameTable } from '../../src/view/components/GameTable';
import { UI_MESSAGES } from '../../src/core/constants/labels';
import { DEFAULT_FILTERS } from '../../src/viewmodel/toolbarFilters';
import type { GameItem, ToolbarFilters } from '../../src/model/types/game';

function barra(showSaleFilter: boolean, filters: ToolbarFilters = DEFAULT_FILTERS) {
  const onFilterChange = vi.fn();
  render(
    <Toolbar
      currentTab="d"
      filters={filters}
      options={{ genres: [], platforms: [], scores: [], hours: [] }}
      activeFilterCount={filters.sale ? 1 : 0}
      compactFilters={false}
      filtersOpen
      onFiltersToggle={vi.fn()}
      onFilterChange={onFilterChange}
      onToggleValue={vi.fn()}
      onClearFilter={vi.fn()}
      onClearAll={vi.fn()}
      showSteamButton={false}
      showSaleFilter={showSaleFilter}
    />,
  );
  return onFilterChange;
}

describe('filtro «En oferta»', () => {
  it('sin precios no aparece', () => {
    barra(false);
    expect(screen.queryByRole('button', { name: UI_MESSAGES.toolbar.onSale })).toBeNull();
  });

  it('con precios aparece y se enciende', () => {
    const onFilterChange = barra(true);
    const boton = screen.getByRole('button', { name: UI_MESSAGES.toolbar.onSale });
    expect(boton).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(boton);
    expect(onFilterChange).toHaveBeenCalledWith('sale', true);
  });

  it('encendido, sale también entre los filtros activos para quitarlo', () => {
    barra(true, { ...DEFAULT_FILTERS, sale: true });
    expect(screen.getByRole('button', { name: UI_MESSAGES.toolbar.removeFilter(UI_MESSAGES.toolbar.onSale) })).toBeInTheDocument();
  });
});

describe('chips de orden por precio', () => {
  const deseo: GameItem = { id: 1, _ts: 1, name: 'Hades 2', platforms: [], genres: [], steamDeck: false, review: '', score: 4 };

  it('se pintan tras los de la lista y ordenan con su clave', () => {
    const onSort = vi.fn();
    render(
      <GameTable
        games={[deseo]}
        currentTab="d"
        onOpenGame={vi.fn()}
        onEdit={vi.fn()}
        onSort={onSort}
        sort={{ col: 'price', asc: true }}
        extraSorts={[{ header: 'Precio', key: 'price' }, { header: 'Descuento', key: 'discount' }]}
      />,
    );
    const precio = screen.getByRole('button', { name: /Precio/ });
    expect(precio).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: UI_MESSAGES.table.sortHeaderTip('Descuento') }));
    expect(onSort).toHaveBeenCalledWith('d', 'discount');
  });
});
