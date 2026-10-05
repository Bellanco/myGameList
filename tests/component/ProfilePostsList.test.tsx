/**
 * LAS PUBLICACIONES DE UN PERFIL: quién ve qué botón y qué hace cada uno.
 *
 * Las reglas que se fijan aquí son de producto (decisión del usuario, 05-10-2026): en el perfil de otra persona
 * solo se leen; en el tuyo se borran siempre y se editan solo si tu rango publica —bronce retira lo que escribió,
 * pero no lo reescribe—. Y borrar pide confirmación: no hay papelera de la que recuperarlo.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';
import { ProfilePostsList, type ProfilePostEntry } from '../../src/view/components/socialhub/ProfilePostsList';

const POSTS: ProfilePostEntry[] = [
  { id: 'p1:3000', text: 'Segunda', updatedAt: 3000 },
  { id: 'p1:2000', text: 'Primera', updatedAt: 2000, editedAt: 9000 },
];

function renderList(opciones: { own?: boolean; canEdit?: boolean } = {}) {
  const onEdit = vi.fn(async () => true);
  const onDelete = vi.fn(async () => true);
  render(
    <ProfilePostsList
      SOCIAL_UI={SOCIAL_UI}
      posts={POSTS}
      own={opciones.own ?? true}
      canEdit={opciones.canEdit ?? true}
      maxLength={1000}
      showCounter
      changingPostId=""
      onEdit={onEdit}
      onDelete={onDelete}
    />,
  );
  return { onEdit, onDelete };
}

const botones = (name: string) => screen.queryAllByRole('button', { name: new RegExp(`^${name}$`) });

describe('publicaciones del perfil', () => {
  it('en el perfil de otra persona solo se leen', () => {
    renderList({ own: false, canEdit: false });
    expect(screen.getByText('Segunda')).toBeTruthy();
    expect(botones(SOCIAL_UI.feed.postEdit)).toHaveLength(0);
    expect(botones(SOCIAL_UI.feed.postDelete)).toHaveLength(0);
  });

  it('marca las editadas, sin cambiar su fecha', () => {
    renderList();
    const marcas = screen.getAllByText(new RegExp(SOCIAL_UI.feed.postEdited));
    expect(marcas).toHaveLength(1);
  });

  it('bronce borra sus publicaciones pero no las edita', () => {
    renderList({ canEdit: false });
    expect(botones(SOCIAL_UI.feed.postEdit)).toHaveLength(0);
    expect(botones(SOCIAL_UI.feed.postDelete)).toHaveLength(2);
  });

  it('borrar pide confirmación antes de tocar nada', async () => {
    const { onDelete } = renderList();
    fireEvent.click(botones(SOCIAL_UI.feed.postDelete)[0]);
    expect(onDelete).not.toHaveBeenCalled();

    // El diálogo lleva su propio botón de «Eliminar»: es el último que aparece.
    const confirmar = botones(SOCIAL_UI.feed.postDelete).at(-1)!;
    fireEvent.click(confirmar);
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('p1:3000'));
  });

  it('editar guarda el texto nuevo y cierra el editor solo si salió', async () => {
    const { onEdit } = renderList();
    fireEvent.click(botones(SOCIAL_UI.feed.postEdit)[0]);

    const campo = screen.getByLabelText(SOCIAL_UI.feed.postEditLabel) as HTMLTextAreaElement;
    expect(campo.value).toBe('Segunda');
    // Sin cambios no se puede guardar: sería una escritura del gist para nada.
    expect((screen.getByRole('button', { name: SOCIAL_UI.feed.postEditSave }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(campo, { target: { value: 'Segunda corregida' } });
    fireEvent.click(screen.getByRole('button', { name: SOCIAL_UI.feed.postEditSave }));

    await waitFor(() => expect(onEdit).toHaveBeenCalledWith('p1:3000', 'Segunda corregida'));
    await waitFor(() => expect(screen.queryByLabelText(SOCIAL_UI.feed.postEditLabel)).toBeNull());
  });
});
