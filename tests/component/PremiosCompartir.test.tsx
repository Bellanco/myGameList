import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PremiosCompartir } from '../../src/view/components/premios/PremiosCompartir';
import { PREMIOS_UI } from '../../src/core/constants/premiosLabels';

const L = PREMIOS_UI.compartir;

/**
 * Los dos aparatos, que son las dos ramas del botón: con hoja del sistema (móvil y tablet) y sin ella (el
 * escritorio de Firefox y Chrome). Se simulan poniendo y quitando `navigator.share`, que es exactamente lo que
 * mira el componente.
 */
function conHojaDelSistema(share: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
}

function conPortapapeles(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'clipboard');
  vi.restoreAllMocks();
});

describe('PremiosCompartir', () => {
  it('en móvil y tablet abre la hoja del sistema con el enlace absoluto', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    conHojaDelSistema(share);

    render(<PremiosCompartir path="/premios" title="Vota" text="Echa tu porra" />);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(L.button, 'i') }));

    expect(share).toHaveBeenCalledWith({
      title: 'Vota',
      text: 'Echa tu porra',
      url: `${window.location.origin}/premios`,
    });
  });

  // Cancelar la hoja de compartir RECHAZA la promesa. No es un fallo de nada: no puede acabar en un aviso de
  // error ni, peor, en un `unhandledrejection` que la red global reportaría como avería de la aplicación.
  it('cancelar la hoja no deja ningún aviso', async () => {
    conHojaDelSistema(vi.fn().mockRejectedValue(new Error('AbortError')));

    render(<PremiosCompartir path="/premios" title="Vota" text="Echa tu porra" />);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(L.button, 'i') }));

    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('en escritorio sin hoja del sistema copia el enlace y lo dice', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    conPortapapeles(writeText);

    render(<PremiosCompartir path="/premios/resultados/reto-2025" title="Resultados" text="Quién ganó" />);
    const boton = screen.getByRole('button', { name: new RegExp(L.copy, 'i') });
    await userEvent.click(boton);

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/premios/resultados/reto-2025`);
    expect(screen.getByRole('status')).toHaveTextContent(L.copied);
  });

  // Sin portapapeles (contexto no seguro, permiso denegado) no se miente: se dice dónde está el enlace.
  it('si no se puede copiar lo dice, sin tratarlo como avería', async () => {
    conPortapapeles(vi.fn().mockRejectedValue(new Error('denied')));

    render(<PremiosCompartir path="/premios" title="Vota" text="Echa tu porra" />);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(L.copy, 'i') }));

    expect(screen.getByRole('status')).toHaveTextContent(L.failed);
  });
});
