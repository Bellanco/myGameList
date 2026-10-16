// EL PRECIO EN LA FICHA (P3 y P5 del plan de la ficha y los precios): el recuadro sale en el lado de la cabecera de
// un DESEO o de un juego que NO TIENES, con los precios encendidos. De uno que ya tienes en otra lista, ni se pide.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GameSheetPanel, type GameSheetPanelProps } from '../../src/view/components/gameSheet/GameSheetPanel';
import { TAB_ACTIONS } from '../../src/core/constants/labels';
import { PRICES_UI } from '../../src/core/constants/pricesLabels';
import { statsReviewPath } from '../../src/core/utils/reviewPath';
import { gameSheetSlug } from '../../src/core/utils/gameSheetPath';
import type { GameItem, TabData } from '../../src/model/types/game';
import type { PrecioItad } from '../../src/model/types/prices';

const senales = vi.hoisted(() => ({ actuales: [] as unknown[] }));
vi.mock('../../src/viewmodel/gameSheet/gameSheetFriendSignals', () => ({
  loadGameSheetFriendSignals: () => Promise.resolve(senales.actuales),
}));
vi.mock('../../src/viewmodel/gameSheet/friendLibraryIndex', () => ({
  loadFriendLibraryIndex: () => Promise.resolve({ signals: [], missing: 0 }),
  loadFriendGameEntry: () => Promise.resolve(null),
}));
const repo = vi.hoisted(() => ({
  readCachedPrices: vi.fn(async (): Promise<Record<string, unknown>> => ({})),
  loadGamePrice: vi.fn(async (): Promise<unknown> => undefined),
}));
vi.mock('../../src/model/repository/pricesRepository', () => repo);

const precio: PrecioItad = {
  titulo: 'Hollow Knight: Silksong',
  itadId: 'silksong',
  mejor: { tienda: 'GOG', precio: 15.99, normal: 19.99, descuento: 20, hasta: null, url: 'https://itad.link/gog' },
  otras: [],
  minimos: { historico: { precio: 15.99, fecha: null }, anio: null, tresMeses: null },
  urlFicha: null,
  bundles: [],
};

function juego(id: number, name: string): GameItem {
  return { id, _ts: 1, name, platforms: ['Steam'], genres: ['Metroidvania'], steamDeck: false, review: '' };
}

const data: TabData = {
  c: [juego(1, 'Hollow Knight')],
  v: [],
  e: [],
  p: [juego(3, 'Hades II')],
  d: [juego(2, 'Hollow Knight: Silksong')],
  deleted: [],
  updatedAt: 0,
};

function pintar(over: Partial<GameSheetPanelProps>) {
  render(
    <MemoryRouter>
      <GameSheetPanel
        open
        data={data}
        slug="hollow-knight-silksong"
        onClose={vi.fn()}
        onOpenGame={vi.fn()}
        tabActions={TAB_ACTIONS}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onMigrate={vi.fn()}
        reviewTarget={(_tab, game) => ({ to: statsReviewPath(game.id, game.name) })}
        onAddGame={vi.fn()}
        {...over}
      />
    </MemoryRouter>,
  );
}

describe('GameSheetPanel — el precio de un deseo', () => {
  beforeEach(() => {
    senales.actuales = [];
    repo.readCachedPrices.mockClear();
    repo.loadGamePrice.mockReset();
  });

  it('con los precios encendidos, pide el del deseo con el plazo de quien mira y lo enseña', async () => {
    repo.loadGamePrice.mockResolvedValue(precio);
    pintar({ pricesOn: true, priceTtlMs: 1000 });
    const box = await screen.findByRole('region', { name: PRICES_UI.boxAria });
    expect(box).toHaveTextContent(PRICES_UI.historicLow);
    expect(repo.loadGamePrice).toHaveBeenCalledWith('Hollow Knight: Silksong', 1000);
  });

  it('con el rango aún en vuelo, solo lo guardado', async () => {
    repo.readCachedPrices.mockResolvedValue({ 'Hollow Knight: Silksong': precio });
    pintar({ pricesOn: true, priceTtlMs: null });
    expect(await screen.findByRole('region', { name: PRICES_UI.boxAria })).toBeInTheDocument();
    expect(repo.loadGamePrice).not.toHaveBeenCalled();
  });

  it('apagados, ni se pide', async () => {
    pintar({ pricesOn: false, priceTtlMs: 1000 });
    await screen.findByRole('heading', { name: 'Hollow Knight: Silksong' });
    expect(repo.readCachedPrices).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: PRICES_UI.boxAria })).toBeNull();
  });

  it('de un juego que no es un deseo, tampoco', async () => {
    pintar({ slug: 'hollow-knight', pricesOn: true, priceTtlMs: 1000 });
    await screen.findByRole('heading', { name: 'Hollow Knight' });
    expect(repo.readCachedPrices).not.toHaveBeenCalled();
  });

  it('de un juego que no tienes, lo pide con el nombre que le da tu amistad y lo enseña junto a «Añadir a deseados»', async () => {
    senales.actuales = [{ kind: 'review', friend: { id: 'marta', name: 'Marta' }, gameName: 'Outer Wilds', grade: 96, snippet: 'Único.', at: 1 }];
    repo.loadGamePrice.mockResolvedValue({ ...precio, titulo: 'Outer Wilds', minimos: { ...precio.minimos, historico: null } });
    pintar({ slug: 'outer-wilds', pricesOn: true, priceTtlMs: 1000 });
    expect(await screen.findByRole('region', { name: PRICES_UI.boxAria })).toBeInTheDocument();
    expect(repo.loadGamePrice).toHaveBeenCalledWith('Outer Wilds', 1000);
    expect(screen.getByRole('button', { name: /deseados/i })).toBeInTheDocument();
  });

  it('de uno de tus próximos, también', async () => {
    repo.loadGamePrice.mockResolvedValue({ ...precio, titulo: 'Hades II' });
    pintar({ slug: gameSheetSlug('Hades II'), pricesOn: true, priceTtlMs: 1000 });
    expect(await screen.findByRole('region', { name: PRICES_UI.boxAria })).toBeInTheDocument();
    expect(repo.loadGamePrice).toHaveBeenCalledWith('Hades II', 1000);
  });
});
