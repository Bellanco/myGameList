import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnnouncementToast } from '../../src/view/components/AnnouncementToast';
import { ANNOUNCEMENT_UI } from '../../src/core/constants/announcementLabels';
import type { Announcement } from '../../src/core/announcement/announcement';

// Lo que se prueba aquí es lo que distingue esta cápsula de la del logro: que lleva a OTRA web (enlace de
// verdad, en otra pestaña y con `noopener`), que dura lo suyo y se para al leerla, y que la cuenta de veces la
// apunta el MONTAJE —si esta cápsula no se pinta, no se ha dicho nada—.

const AVISO: Announcement = {
  id: 'av-1',
  kicker: 'Ya puedes votar',
  title: 'Vota los juegos del año',
  body: 'La votación está abierta hasta el domingo.',
  url: 'https://ejemplo.org/votar',
  icon: 'bell',
  active: true,
  repeats: 3,
  intervalHours: 24,
  updatedAt: 0,
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('la cápsula del aviso', () => {
  it('dice las tres filas y lleva al enlace en otra pestaña', () => {
    render(<AnnouncementToast announcement={AVISO} />);

    expect(screen.getByText(AVISO.kicker)).toBeInTheDocument();
    expect(screen.getByText(AVISO.title)).toBeInTheDocument();
    expect(screen.getByText(AVISO.body)).toBeInTheDocument();

    const enlace = screen.getByRole('link', { name: ANNOUNCEMENT_UI.linkAria(AVISO.title, AVISO.body) });
    expect(enlace).toHaveAttribute('href', AVISO.url);
    expect(enlace).toHaveAttribute('target', '_blank');
    // Obligado en cualquier enlace con `target="_blank"`: sin esto la otra pestaña puede tocar a esta.
    expect(enlace.getAttribute('rel')).toContain('noopener');
  });

  /** Los dos textos los escribe una persona en un formulario: unos acaban en punto y otros no. */
  it('el nombre accesible no duplica el punto final', () => {
    render(<AnnouncementToast announcement={AVISO} />);
    expect(screen.getByRole('link').getAttribute('aria-label')).toBe(
      'Vota los juegos del año. La votación está abierta hasta el domingo. Se abre en otra pestaña.',
    );

    const { container } = render(
      <AnnouncementToast announcement={{ ...AVISO, title: 'Vota ya', body: '' }} />,
    );
    expect(container.querySelector('a')?.getAttribute('aria-label')).toBe('Vota ya. Se abre en otra pestaña.');
  });

  it('sin rótulo pone el de respaldo: la primera fila nunca va vacía', () => {
    render(<AnnouncementToast announcement={{ ...AVISO, kicker: '' }} />);
    expect(screen.getByText(ANNOUNCEMENT_UI.kickerFallback)).toBeInTheDocument();
  });

  /** La cuenta se gasta al PINTAR, que es lo que permite que un desbloqueo de logro le quite el turno sin coste. */
  it('apunta la aparición una sola vez', () => {
    const onShown = vi.fn();
    const { rerender } = render(<AnnouncementToast announcement={AVISO} onShown={onShown} />);
    rerender(<AnnouncementToast announcement={AVISO} onShown={onShown} />);
    expect(onShown).toHaveBeenCalledTimes(1);
  });

  it('se va sola a los ocho segundos, y la cuenta se para mientras se lee', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onDone = vi.fn();
    render(<AnnouncementToast announcement={AVISO} onDone={onDone} />);

    await user.hover(screen.getByRole('link'));
    act(() => { vi.advanceTimersByTime(9000); });
    expect(onDone, 'con el ratón encima no se va').not.toHaveBeenCalled();

    // Al soltar, el reloj vuelve a correr desde el principio y entonces sí se va.
    await user.unhover(screen.getByRole('link'));
    act(() => { vi.advanceTimersByTime(8100); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('avisa de que se pulsó', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onOpen = vi.fn();
    render(<AnnouncementToast announcement={AVISO} onOpen={onOpen} />);
    await user.click(screen.getByRole('link'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  /**
   * LA REGIÓN VIVA SE RELLENA DESPUÉS DE MONTARSE. Si naciera con el texto dentro no anunciaría nada, que es el
   * fallo silencioso que ya documentan `StatusBanner` y `UpdateNotice`.
   */
  it('anuncia el aviso a un lector de pantalla', () => {
    render(<AnnouncementToast announcement={AVISO} />);
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('');
    act(() => { vi.advanceTimersByTime(200); });
    expect(region).toHaveTextContent(AVISO.title);
  });

  /** La muestra del panel: la misma cápsula, sin reloj, sin carril fijo y sin gastar ninguna de las veces. */
  it('en modo muestra no cuenta ni se va sola', () => {
    const onShown = vi.fn();
    const onDone = vi.fn();
    render(<AnnouncementToast announcement={AVISO} onShown={onShown} onDone={onDone} preview />);
    act(() => { vi.advanceTimersByTime(30000); });
    expect(onShown).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
