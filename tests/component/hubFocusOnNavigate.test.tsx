import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useHubFocusOnNavigate } from '../../src/view/hooks/useHubFocusOnNavigate';

// EL FOCO AL NAVEGAR DENTRO DEL HUB (09-10-2026): caía al `body` al desmontarse el botón pulsado.

function Lista() {
  const navigate = useNavigate();
  return (
    <section className="hub-hub">
      <h2>Amigos</h2>
      {['Ana', 'Bea', 'Carla'].map((name) => (
        <button key={name} type="button" onClick={() => navigate(`/p/${name}`)}>{name}</button>
      ))}
      <button type="button" onClick={() => navigate('/vista')}>Alternar</button>
    </section>
  );
}

function Ficha() {
  const navigate = useNavigate();
  return (
    <section className="hub-hub">
      <h2>Ficha</h2>
      <button type="button" onClick={() => navigate(-1)}>Volver</button>
    </section>
  );
}

function Hub() {
  useHubFocusOnNavigate();
  return (
    <Routes>
      <Route path="/" element={<Lista />} />
      <Route path="/vista" element={<Lista />} />
      <Route path="/p/:id" element={<Ficha />} />
    </Routes>
  );
}

function pulsar(name: string) {
  const button = screen.getByRole('button', { name });
  act(() => button.focus());
  fireEvent.click(button);
}

describe('useHubFocusOnNavigate', () => {
  it('al abrir una pantalla, el foco va a su título', async () => {
    render(<MemoryRouter><Hub /></MemoryRouter>);

    pulsar('Bea');

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Ficha' })));
    expect(screen.getByRole('heading', { name: 'Ficha' }).getAttribute('tabindex')).toBe('-1');
  });

  it('al volver, el foco vuelve al control desde el que se salió', async () => {
    render(<MemoryRouter><Hub /></MemoryRouter>);

    pulsar('Bea');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Ficha' })));
    pulsar('Volver');

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Bea' })));
  });

  it('si el foco sigue vivo tras navegar, no se toca', async () => {
    render(<MemoryRouter><Hub /></MemoryRouter>);

    // La misma pantalla en otra ruta (como alternar una vista de la ficha): el botón no se desmonta.
    pulsar('Alternar');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Alternar' }));
  });
});
