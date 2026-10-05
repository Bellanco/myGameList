import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminPremiosCategorias } from '../../src/view/components/premios/AdminPremiosCategorias';
import { PREMIOS_UI } from '../../src/core/constants/premiosLabels';
import type { PremiosCategory } from '../../src/model/types/premios';

const L = PREMIOS_UI.admin.categories;

const saveCategoryMock = vi.fn(async () => ({ docId: 'cat-1', isNew: false }));
const deleteCategoryMock = vi.fn(async () => ({ kept: false }));
const reorderMock = vi.fn(async () => ({ reordered: 2 }));

const resolverMock = vi.fn(async (_nombres: readonly string[]) => ({ conCaratula: 2, sinCaratula: 0, fallidas: 0 }));

vi.mock('../../src/model/repository/premios/premiosCoversRepository', () => ({
  resolverCaratulasDeNominados: (nombres: readonly string[]) => resolverMock(nombres),
}));

vi.mock('../../src/model/repository/premios/premiosTmdbRepository', () => ({
  buscarImagenesTmdb: async () => [{ kind: 'tv', id: 100088, title: 'The Last of Us', year: '2023', path: '/tNQWO6cNzQYCyvw36mUcAQQyf5F.jpg' }],
}));

vi.mock('../../src/model/repository/premios/premiosIgdbRepository', () => ({
  buscarCaratulasIgdb: async () => ({
    candidatos: [{ id: 9999, name: 'Elden Ring', coverId: 'co4jni', year: '2022', platforms: ['PC'], gameType: 0 }],
    automatica: null,
  }),
}));

vi.mock('../../src/model/repository/premios/premiosCategoriesRepository', () => ({
  saveCategory: (...args: unknown[]) => saveCategoryMock(...(args as [])),
  deleteCategory: (...args: unknown[]) => deleteCategoryMock(...(args as [])),
  reorderCategories: (...args: unknown[]) => reorderMock(...(args as [])),
}));

const categories: PremiosCategory[] = [
  {
    id: 'cat-1',
    title: { es: 'Juego del año', en: 'Game of the year' },
    weight: 3,
    orderIndex: 0,
    options: [
      { id: 'cat-1_option_a', name: 'Elden Ring' },
      { id: 'cat-1_option_b', name: 'Hades II' },
    ],
  },
  { id: 'cat-2', title: { es: 'Mejor arte' }, weight: 1, orderIndex: 1, options: [] },
  {
    id: 'cat-3',
    title: { es: 'Mejor adaptación' },
    weight: 0.5,
    orderIndex: 2,
    nomineeKind: 'screen',
    options: [
      { id: 'cat-3_option_a', name: 'The Last of Us' },
      { id: 'cat-3_option_b', name: 'Arcane' },
    ],
  },
];

/** El panel pasa este envoltorio; aquí solo interesa que la acción llegue a ejecutarse. */
const ejecutar = async (accion: () => Promise<string>) => {
  await accion().catch(() => '');
};

function pintar() {
  render(<AdminPremiosCategorias categories={categories} busy={false} ejecutar={ejecutar} />);
}

describe('AdminPremiosCategorias', () => {
  it('lista las categorías con sus nominados y su peso', () => {
    pintar();
    expect(screen.getByText('Juego del año')).toBeInTheDocument();
    expect(screen.getByText(`${L.nominees(2)} · ${L.weight(3)}`)).toBeInTheDocument();
  });

  // LO QUE PROTEGE LOS VOTOS: cada nominado que ya existía se guarda con SU id. Si se reescribieran como nuevos,
  // un voto emitido acabaría apuntando a otro juego.
  it('al guardar conserva el id de los nominados que ya existían', async () => {
    pintar();
    saveCategoryMock.mockClear();
    await userEvent.click(screen.getAllByRole('button', { name: L.edit })[0]);
    await userEvent.click(screen.getByRole('button', { name: L.save }));

    expect(saveCategoryMock).toHaveBeenCalledTimes(1);
    const [params] = saveCategoryMock.mock.calls[0] as unknown as [{ options: Array<{ id: string | null }> }];
    expect(params.options.map((o) => o.id)).toEqual(['cat-1_option_a', 'cat-1_option_b']);
  });

  // La votación solo enseña carátulas ya resueltas, así que guardar resuelve las de sus nominados.
  it('al guardar resuelve las carátulas de sus nominados', async () => {
    pintar();
    resolverMock.mockClear();
    await userEvent.click(screen.getAllByRole('button', { name: L.edit })[0]);
    await userEvent.click(screen.getByRole('button', { name: L.save }));

    expect(resolverMock).toHaveBeenCalledWith(['Elden Ring', 'Hades II']);
  });

  // Una serie buscada en IGDB casa con el juego que adapta: ni se busca, ni se gasta cupo.
  it('una categoría de cine o serie no resuelve carátulas al guardar', async () => {
    pintar();
    resolverMock.mockClear();
    saveCategoryMock.mockClear();
    await userEvent.click(screen.getAllByRole('button', { name: L.edit })[2]);
    expect(screen.getByRole('button', { name: L.kinds.screen })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: L.save }));

    const [params] = saveCategoryMock.mock.calls[0] as unknown as [{ nomineeKind: string }];
    expect(params.nomineeKind).toBe('screen');
    expect(resolverMock).not.toHaveBeenCalled();
  });

  it('el tipo se elige en el formulario y se ve en la lista cuando no es de juegos', async () => {
    pintar();
    expect(screen.getByText(`${L.nominees(2)} · ${L.weight(0.5)} · ${L.kinds.screen}`)).toBeInTheDocument();

    saveCategoryMock.mockClear();
    await userEvent.click(screen.getAllByRole('button', { name: L.edit })[0]);
    expect(screen.getByRole('button', { name: L.kinds.game })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: L.kinds.person }));
    await userEvent.click(screen.getByRole('button', { name: L.save }));

    const [params] = saveCategoryMock.mock.calls[0] as unknown as [{ nomineeKind: string }];
    expect(params.nomineeKind).toBe('person');
  });

  // LA IMAGEN SE ELIGE A MANO en las que no son de juegos, y viaja con el nominado al guardar.
  it('en cine o serie se busca la imagen de cada nominado y se guarda con él', async () => {
    pintar();
    saveCategoryMock.mockClear();
    await userEvent.click(screen.getAllByRole('button', { name: L.edit })[2]);

    await userEvent.click(screen.getByRole('button', { name: L.image.searchAria(1) }));
    await userEvent.click(await screen.findByRole('button', { name: /Elegir The Last of Us/ }));
    await userEvent.click(screen.getByRole('button', { name: L.save }));

    const [params] = saveCategoryMock.mock.calls[0] as unknown as [{ options: Array<{ image?: unknown }> }];
    expect(params.options[0].image).toEqual({ source: 'tmdb', kind: 'tv', id: 100088, path: '/tNQWO6cNzQYCyvw36mUcAQQyf5F.jpg' });
    expect(params.options[1].image).toBeNull();
  });

  it('en las de juegos no hay nada que buscar', async () => {
    pintar();
    await userEvent.click(screen.getAllByRole('button', { name: L.edit })[0]);
    expect(screen.queryByRole('button', { name: L.image.searchAria(1) })).not.toBeInTheDocument();
  });

  // En las de juegos la carátula sale sola, pero se puede elegir a mano; la elegida viaja con el nominado y ese ya
  // no se resuelve por el nombre.
  it('en las de juegos se puede elegir la carátula, y la elegida no se resuelve al guardar', async () => {
    pintar();
    saveCategoryMock.mockClear();
    resolverMock.mockClear();
    await userEvent.click(screen.getAllByRole('button', { name: L.edit })[0]);

    await userEvent.click(screen.getByRole('button', { name: L.cover.chooseAria(1) }));
    await userEvent.click(await screen.findByRole('button', { name: /Elegir Elden Ring/ }));
    await userEvent.click(screen.getByRole('button', { name: L.save }));

    const [params] = saveCategoryMock.mock.calls[0] as unknown as [{ options: Array<{ cover?: unknown }> }];
    expect(params.options[0].cover).toEqual({ source: 'igdb', imageId: 'co4jni', gameId: 9999, name: 'Elden Ring' });
    expect(params.options[1].cover).toBeNull();
    expect(resolverMock).toHaveBeenCalledWith(['Hades II']);
  });

  it('cada nominado es un campo propio, y se pueden añadir y quitar', async () => {
    pintar();
    await userEvent.click(screen.getAllByRole('button', { name: L.edit })[0]);

    expect(screen.getByRole('textbox', { name: L.nomineePlaceholder(1) })).toHaveValue('Elden Ring');
    expect(screen.getByRole('textbox', { name: L.nomineePlaceholder(2) })).toHaveValue('Hades II');

    await userEvent.click(screen.getByRole('button', { name: L.addNominee }));
    expect(screen.getByRole('textbox', { name: L.nomineePlaceholder(3) })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: L.removeNominee(3) }));
    expect(screen.queryByRole('textbox', { name: L.nomineePlaceholder(3) })).not.toBeInTheDocument();
  });

  it('el peso se elige entre los cuatro que se usan', async () => {
    pintar();
    await userEvent.click(screen.getAllByRole('button', { name: L.edit })[0]);

    expect(screen.getByRole('button', { name: '3' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: '2' }));
    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('una categoría nueva se crea al final de la lista', async () => {
    pintar();
    saveCategoryMock.mockClear();
    await userEvent.click(screen.getByRole('button', { name: L.create }));
    await userEvent.type(screen.getByLabelText(L.titleEs), 'Mejor banda sonora');
    await userEvent.click(screen.getByRole('button', { name: L.save }));

    const [params] = saveCategoryMock.mock.calls[0] as unknown as [{ docId: string | null; orderIndex: number }];
    expect(params.docId).toBeNull();
    expect(params.orderIndex).toBe(categories.length);
  });

  it('sin título en español no guarda nada', async () => {
    pintar();
    saveCategoryMock.mockClear();
    await userEvent.click(screen.getByRole('button', { name: L.create }));
    await userEvent.click(screen.getByRole('button', { name: L.save }));
    expect(saveCategoryMock).not.toHaveBeenCalled();
  });

  // EDITAR VA PRIMERO, con las flechas a su derecha y borrar el último.
  it('las acciones de cada categoría van en orden: editar, subir, bajar, eliminar', () => {
    const { container } = render(<AdminPremiosCategorias categories={categories} busy={false} ejecutar={ejecutar} />);
    const acciones = [...(container.querySelector('.premios-admin__cat-actions') as HTMLElement).querySelectorAll('button')];
    expect(acciones.map((boton) => boton.getAttribute('aria-label') || boton.textContent)).toEqual([
      L.edit,
      L.moveUp('Juego del año'),
      L.moveDown('Juego del año'),
      L.remove,
    ]);
  });

  it('reordenar reasigna el orden de todas en un lote', async () => {
    pintar();
    reorderMock.mockClear();
    await userEvent.click(screen.getByRole('button', { name: L.moveDown('Juego del año') }));

    expect(reorderMock).toHaveBeenCalledWith([{ id: 'cat-2' }, { id: 'cat-1' }, { id: 'cat-3' }]);
  });

  it('eliminar pregunta antes, y no hace nada si se cancela', async () => {
    pintar();
    deleteCategoryMock.mockClear();
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);

    await userEvent.click(screen.getAllByRole('button', { name: L.remove })[0]);
    expect(deleteCategoryMock).not.toHaveBeenCalled();

    confirmar.mockReturnValue(true);
    await userEvent.click(screen.getAllByRole('button', { name: L.remove })[0]);
    expect(deleteCategoryMock).toHaveBeenCalledWith('cat-1', false);
    confirmar.mockRestore();
  });
});
