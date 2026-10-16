// LOS PRECIOS PINTADOS (P3 del plan de la ficha y los precios): la línea del renglón y de la caja del mosaico, el
// recuadro de la ficha y la ranura de la tabla. Sin precio no se pinta nada: ni «—» ni un error.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PRICES_UI } from '../../src/core/constants/pricesLabels';
import { PriceBox, PriceTag, PricesCredit } from '../../src/view/components/prices/Prices';
import { GameTable } from '../../src/view/components/GameTable';
import type { GameItem } from '../../src/model/types/game';
import type { PrecioItad } from '../../src/model/types/prices';

const nbsp = (texto: string | null | undefined) => (texto ?? '').replace(/\s/g, ' ');

function precio(over: Partial<PrecioItad> = {}): PrecioItad {
  return {
    titulo: 'Hades II',
    itadId: 'hades-2',
    mejor: { tienda: 'Steam', precio: 22.49, normal: 29.99, descuento: 25, hasta: '2026-10-30T17:00:00Z', url: 'https://itad.link/steam' },
    otras: [
      { tienda: 'GOG', precio: 23.99, normal: 29.99, descuento: 20, hasta: null, url: 'https://itad.link/gog' },
      { tienda: 'Epic', precio: 29.99, normal: 29.99, descuento: 0, hasta: null, url: 'https://itad.link/epic' },
    ],
    minimos: { historico: { precio: 19.49, fecha: '2026-08-12T00:00:00Z' }, anio: 19.49, tresMeses: 21.99 },
    urlFicha: 'https://isthereanydeal.com/game/hades-ii/',
    bundles: [],
    ...over,
  };
}

describe('PriceTag', () => {
  it('pinta el precio y el descuento, sin la marca de mínimo si no lo es', () => {
    const { container } = render(<PriceTag precio={precio()} name="Hades 2" />);
    expect(nbsp(container.textContent)).toBe('22,49 €−25 %');
    expect(screen.queryByText(PRICES_UI.lowShort)).toBeNull();
    // Mismo juego escrito de otra forma: no hay emparejamiento que avisar.
    expect(container.querySelector('.price-tag')).not.toHaveAttribute('title');
  });

  it('marca el mínimo histórico, y sin descuento no dice «−0 %»', () => {
    const p = precio({ mejor: { ...precio().mejor!, precio: 19.49, descuento: 0 } });
    const { container } = render(<PriceTag precio={p} name="Hades 2" />);
    expect(screen.getByText(PRICES_UI.lowShort)).toBeInTheDocument();
    expect(container.textContent).not.toContain('%');
  });

  it('con otro título, lo dice al pasar por encima', () => {
    const { container } = render(<PriceTag precio={precio({ titulo: 'Hades' })} name="Hades 2" />);
    expect(container.querySelector('.price-tag')).toHaveAttribute('title', PRICES_UI.matchedAs('Hades'));
  });

  it('sin precio, sin tienda que lo venda o sin saberlo, no pinta nada', () => {
    for (const valor of [undefined, null, precio({ mejor: null })]) {
      const { container, unmount } = render(<PriceTag precio={valor} name="Hades 2" />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});

describe('PriceBox', () => {
  it('enseña el recuadro completo, con las url de ITAD tal cual', () => {
    render(<PriceBox precio={precio()} name="Hades 2" />);
    const box = screen.getByRole('region', { name: PRICES_UI.boxAria });
    expect(nbsp(box.querySelector('.gs-price-now')?.textContent)).toBe('22,49 €');
    expect(nbsp(box.querySelector('.gs-price-regular')?.textContent)).toBe('29,99 €');
    expect(within(box).getByText(PRICES_UI.until('30 de octubre'))).toBeInTheDocument();
    expect(within(box).queryByText(PRICES_UI.historicLow)).toBeNull();

    const minimos = within(box).getByLabelText(PRICES_UI.lowsAria);
    expect(within(minimos).getByText(PRICES_UI.lows.historic)).toBeInTheDocument();
    expect(nbsp(minimos.textContent)).toContain('19,49 €ago 2026');
    expect(within(minimos).getByText(PRICES_UI.lows.months3)).toBeInTheDocument();

    expect(within(within(box).getByRole('list', { name: PRICES_UI.otherStoresAria })).getAllByRole('listitem')).toHaveLength(2);

    const tienda = within(box).getByRole('link', { name: PRICES_UI.seeIn('Steam') });
    expect(tienda).toHaveAttribute('href', 'https://itad.link/steam');
    expect(tienda).toHaveAttribute('target', '_blank');
    expect(tienda).toHaveAttribute('rel', 'noopener');
    expect(within(box).getByRole('link', { name: PRICES_UI.credit })).toHaveAttribute('href', 'https://isthereanydeal.com/game/hades-ii/');
  });

  it('sin oferta, dónde está y que no hay rebaja; en su mínimo, el sello', () => {
    const p = precio({ mejor: { ...precio().mejor!, precio: 19.49, descuento: 0, hasta: null } });
    render(<PriceBox precio={p} name="Hades 2" />);
    expect(screen.getByText(PRICES_UI.noOffer)).toBeInTheDocument();
    expect(screen.getByText(PRICES_UI.historicLow)).toBeInTheDocument();
    expect(document.querySelector('.gs-price-regular')).toBeNull();
  });

  it('los mínimos no repiten cifra: el del año y el de 3 meses, solo si dicen algo nuevo', () => {
    render(<PriceBox precio={precio({ minimos: { historico: { precio: 30.48, fecha: null }, anio: 30.48, tresMeses: 30.48 } })} name="Hades 2" />);
    const minimos = screen.getByLabelText(PRICES_UI.lowsAria);
    expect(within(minimos).getByText(PRICES_UI.lows.historic)).toBeInTheDocument();
    expect(within(minimos).queryByText(PRICES_UI.lows.year)).toBeNull();
    expect(within(minimos).queryByText(PRICES_UI.lows.months3)).toBeNull();
  });

  it('con otro título, «Precio de: …» a la vista', () => {
    render(<PriceBox precio={precio({ titulo: 'Hades' })} name="Hades 2" />);
    expect(screen.getByText(PRICES_UI.matchedAs('Hades'))).toBeInTheDocument();
  });

  it('el crédito al pie de Deseados enlaza con ITAD', () => {
    render(<PricesCredit />);
    expect(screen.getByRole('link', { name: PRICES_UI.credit })).toHaveAttribute('href', 'https://isthereanydeal.com/');
  });
});

describe('GameTable — la ranura del precio', () => {
  const deseo: GameItem = { id: 1, _ts: 1, name: 'Hades 2', platforms: ['Steam'], genres: ['Roguelike'], steamDeck: false, review: '', score: 4 };

  it('con `renderPrice`, cada renglón lleva su precio', () => {
    const { container } = render(
      <GameTable games={[deseo]} currentTab="d" onOpenGame={vi.fn()} onEdit={vi.fn()} renderPrice={(game) => <PriceTag precio={precio()} name={game.name} />} />,
    );
    expect(nbsp(container.querySelector('.row-price')?.textContent)).toBe('22,49 €−25 %');
  });

  it('sin él, ni la ranura', () => {
    const { container } = render(<GameTable games={[deseo]} currentTab="d" onOpenGame={vi.fn()} onEdit={vi.fn()} />);
    expect(container.querySelector('.row-price')).toBeNull();
  });
});
