// EL SCROLL AL CAMBIAR DE PANTALLA, que hasta ahora no lo decidía nadie.
//
// Lo que se protege aquí es el reparto: al ENTRAR en una pantalla se sube al principio, y al VOLVER no se toca
// lo que la pantalla de destino sepa restaurar. Y la excepción que sostiene el salto al logro: cuando la
// navegación trae un ancla, este hook se aparta —si no, habría dos saltos, primero al principio y después a la
// medalla—.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { useScrollOnNavigate } from '../../src/view/hooks/useScrollOnNavigate';

function Pantallas() {
  useScrollOnNavigate();
  const navigate = useNavigate();
  return (
    <Routes>
      <Route
        path="/"
        element={
          <>
            <button type="button" onClick={() => navigate('/otra')}>ir</button>
            <button type="button" onClick={() => navigate('/otra', { state: { anclaje: 'completados-10' } })}>ir con ancla</button>
            <button type="button" onClick={() => navigate('/otra', { replace: true })}>reemplazar</button>
          </>
        }
      />
      <Route path="/otra" element={<p>otra pantalla</p>} />
    </Routes>
  );
}

let scrollTo: ReturnType<typeof vi.fn>;

beforeEach(() => {
  scrollTo = vi.fn();
  Object.defineProperty(window, 'scrollTo', { configurable: true, value: scrollTo });
});

describe('el scroll al cambiar de pantalla', () => {
  it('al entrar en una pantalla nueva sube al principio', async () => {
    render(<MemoryRouter initialEntries={['/']}><Pantallas /></MemoryRouter>);

    await userEvent.click(screen.getByRole('button', { name: 'ir' }));

    expect(screen.getByText('otra pantalla')).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  /* La excepción declarada: quien navega ya sabe a dónde quiere ir (el logro recién conseguido), y la pantalla
     de destino es la que sabe dónde está esa fila. */
  it('pero no toca nada si la navegación trae un ancla', async () => {
    render(<MemoryRouter initialEntries={['/']}><Pantallas /></MemoryRouter>);

    await userEvent.click(screen.getByRole('button', { name: 'ir con ancla' }));

    expect(screen.getByText('otra pantalla')).toBeInTheDocument();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  /* Un `replace` no es un viaje: es la misma pantalla corrigiendo su URL —la expulsión de `/cuenta` sin sesión,
     por ejemplo—, y moverla sería un salto sin causa. */
  it('y un reemplazo de URL tampoco mueve nada', async () => {
    render(<MemoryRouter initialEntries={['/']}><Pantallas /></MemoryRouter>);

    await userEvent.click(screen.getByRole('button', { name: 'reemplazar' }));

    expect(screen.getByText('otra pantalla')).toBeInTheDocument();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
