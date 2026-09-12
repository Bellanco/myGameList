import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminAnnouncement } from '../../src/view/components/AdminAnnouncement';
import { ADMIN_ANNOUNCEMENT_UI } from '../../src/core/constants/adminLabels';
import { DIALOG_MESSAGES } from '../../src/core/constants/labels';
import type { Announcement } from '../../src/core/announcement/announcement';

// LO QUE SE PRUEBA ES LA DIFERENCIA ENTRE LOS DOS BOTONES DE GUARDAR, que es la única decisión con consecuencias
// de esta pantalla: «Guardar cambios» corrige el aviso en curso y «Publicar como aviso nuevo» estrena campaña —y
// con ella la cuenta de veces de TODOS los dispositivos, incluidos los que ya habían pulsado—.

const A = ADMIN_ANNOUNCEMENT_UI;

const ACTUAL: Announcement = {
  id: 'av-1',
  kicker: 'Ya puedes votar',
  title: 'Vota los juegos del año',
  body: 'Hasta el domingo.',
  url: 'https://ejemplo.org/votar',
  icon: 'bell',
  active: true,
  repeats: 3,
  intervalHours: 24,
  updatedAt: Date.parse('2026-09-12T08:00:00.000Z'),
};

afterEach(() => {
  vi.restoreAllMocks();
});

function setup(current: Announcement | null = ACTUAL) {
  const onSave = vi.fn(async (next: Announcement) => next);
  render(<AdminAnnouncement current={current} onSave={onSave} onBack={() => {}} />);
  return { onSave, user: userEvent.setup() };
}

describe('panel · aviso a los usuarios', () => {
  it('abre con lo que hay publicado y lo enseña en la muestra', () => {
    setup();
    expect(screen.getByDisplayValue(ACTUAL.title)).toBeInTheDocument();
    expect(screen.getByDisplayValue(ACTUAL.url)).toBeInTheDocument();
    // La muestra es la cápsula de verdad: el enlace del aviso está en la pantalla del panel.
    expect(screen.getByRole('link')).toHaveAttribute('href', ACTUAL.url);
  });

  it('no deja guardar sin título ni sin un enlace http(s)', async () => {
    const { user } = setup(null);
    expect(screen.getByRole('button', { name: A.save })).toBeDisabled();

    await user.type(screen.getByRole('textbox', { name: new RegExp(`^${A.field.title}`) }), 'Hola');
    expect(screen.getByRole('button', { name: A.save })).toBeDisabled();

    await user.type(screen.getByRole('textbox', { name: new RegExp(`^${A.field.url}`) }), 'javascript:alert(1)');
    expect(screen.getByRole('button', { name: A.save })).toBeDisabled();
    expect(screen.getByText(A.needUrl)).toBeInTheDocument();
  });

  it('guardar cambios conserva la campaña: a quien ya se lo dijimos no se le repite', async () => {
    const { onSave, user } = setup();
    await user.clear(screen.getByRole('textbox', { name: new RegExp(`^${A.field.title}`) }));
    await user.type(screen.getByRole('textbox', { name: new RegExp(`^${A.field.title}`) }), 'Vota ya');
    await user.click(screen.getByRole('button', { name: A.save }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const escrito = onSave.mock.calls[0][0];
    expect(escrito.id, 'la campaña es la misma').toBe('av-1');
    expect(escrito.title).toBe('Vota ya');
    expect(escrito.url).toBe(ACTUAL.url);
  });

  /** La pregunta es el diálogo de la app, no el del navegador: mismo tema, foco atrapado y Esc para salir. */
  it('publicar de nuevo estrena campaña, y pregunta antes con el diálogo de la app', async () => {
    const { onSave, user } = setup();

    await user.click(screen.getByRole('button', { name: A.republish }));

    // Nada escrito todavía: primero hay que responder.
    expect(onSave).not.toHaveBeenCalled();
    const dialogo = screen.getByRole('dialog', { name: A.republishConfirm });
    await user.click(within(dialogo).getByRole('button', { name: A.republishAccept }));

    const escrito = onSave.mock.calls[0][0];
    expect(escrito.id).not.toBe('av-1');
    // Y sale encendido: publicar de nuevo algo apagado no tendría ningún sentido.
    expect(escrito.active).toBe(true);
  });

  it('y no publica nada si se cancela', async () => {
    const { onSave, user } = setup();
    await user.click(screen.getByRole('button', { name: A.republish }));

    const dialogo = screen.getByRole('dialog', { name: A.republishConfirm });
    await user.click(within(dialogo).getByRole('button', { name: DIALOG_MESSAGES.cancel }));

    expect(onSave).not.toHaveBeenCalled();
  });

  it('apagar deja el texto guardado y deja de enseñarlo', async () => {
    const { onSave, user } = setup();
    await user.click(screen.getByRole('button', { name: A.retire }));
    const escrito = onSave.mock.calls[0][0];
    expect(escrito.active).toBe(false);
    expect(escrito.title).toBe(ACTUAL.title);
    expect(await screen.findByText(A.retired)).toBeInTheDocument();
  });

  it('si la escritura falla, lo dice', async () => {
    const onSave = vi.fn(async () => { throw new Error('permission-denied'); });
    render(<AdminAnnouncement current={ACTUAL} onSave={onSave} onBack={() => {}} />);
    await userEvent.setup().click(screen.getByRole('button', { name: A.save }));
    expect(await screen.findByText('permission-denied')).toBeInTheDocument();
  });
});
