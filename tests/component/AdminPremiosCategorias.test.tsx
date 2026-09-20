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

  it('reordenar reasigna el orden de todas en un lote', async () => {
    pintar();
    reorderMock.mockClear();
    await userEvent.click(screen.getByRole('button', { name: L.moveDown('Juego del año') }));

    expect(reorderMock).toHaveBeenCalledWith([{ id: 'cat-2' }, { id: 'cat-1' }]);
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
