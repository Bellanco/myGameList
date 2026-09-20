import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { usePremiosVisible } from '../../src/viewmodel/premios/usePremiosVisible';
import { PREMIOS_VISIBLE_KEY } from '../../src/core/constants/storageKeys';
import { PREMIOS_VISIBILITY_EVENT } from '../../src/core/premios/visibilitySnapshot';

/**
 * LA ENTRADA A LOS PREMIOS en el menú de Ajustes, que la ve TODO EL MUNDO —también quien no ha iniciado sesión
 * nunca—. Su respuesta viene de `/api/premios`, del propio dominio, y la regla se aplica aquí con la hora de
 * quien mira.
 */
function Sonda() {
  return <output data-testid="ofrece">{usePremiosVisible() ? 'sí' : 'no'}</output>;
}

const AHORA = Date.parse('2026-09-20T12:00:00.000Z');
const DIA = 24 * 3_600_000;

function respondeCon(foto: unknown) {
  return vi.fn(async () => ({ ok: true, json: async () => foto })) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.useFakeTimers({ now: AHORA, toFake: ['Date'] });
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('usePremiosVisible', () => {
  // EL FALLO QUE ESTO CIERRA: antes solo se preguntaba si ya había sesión guardada, así que quien usa la app sin
  // cuenta se quedaba con «no enseñar nada» para siempre, aunque la votación estuviera abierta para todos.
  it('ofrece la entrada sin sesión cuando hay votación abierta', async () => {
    vi.stubGlobal('fetch', respondeCon({ closesAtMillis: AHORA + DIA }));

    render(<Sonda />);
    await waitFor(() => expect(screen.getByTestId('ofrece')).toHaveTextContent('sí'));
    // Y se recuerda, para pintar sin parpadeo en la siguiente visita.
    expect(localStorage.getItem(PREMIOS_VISIBLE_KEY)).toBe('on');
  });

  it('no la ofrece cuando la edición ya se cerró', async () => {
    localStorage.setItem(PREMIOS_VISIBLE_KEY, 'on');
    vi.stubGlobal('fetch', respondeCon({ closesAtMillis: AHORA - 1 }));

    render(<Sonda />);
    await waitFor(() => expect(screen.getByTestId('ofrece')).toHaveTextContent('no'));
    expect(localStorage.getItem(PREMIOS_VISIBLE_KEY)).toBe('off');
  });

  // Sin red, con la Function sin desplegar o con KV vacío: se conserva lo último que se supo, que es lo que
  // evita que la entrada parpadee al abrir la app en un tren.
  it('con la respuesta caída conserva lo que ya sabía', async () => {
    localStorage.setItem(PREMIOS_VISIBLE_KEY, 'on');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin red'); }) as unknown as typeof fetch);

    render(<Sonda />);
    expect(screen.getByTestId('ofrece')).toHaveTextContent('sí');
  });

  /**
   * EL CASO QUE SE ESCAPÓ EN PRODUCCIÓN: el menú pregunta al abrir la app, el administrador abre la edición un
   * minuto después, y como la respuesta está cacheada —en memoria y en este navegador— la entrada no aparecía
   * hasta recargar. El panel avisa al publicar y esto vuelve a preguntar.
   */
  it('se entera cuando el panel publica una foto nueva', async () => {
    const respuestas = [{ closesAtMillis: null }, { closesAtMillis: AHORA + DIA }];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => respuestas.shift() ?? respuestas[0] })) as unknown as typeof fetch,
    );

    render(<Sonda />);
    await waitFor(() => expect(screen.getByTestId('ofrece')).toHaveTextContent('no'));

    window.dispatchEvent(new CustomEvent(PREMIOS_VISIBILITY_EVENT));
    await waitFor(() => expect(screen.getByTestId('ofrece')).toHaveTextContent('sí'));
  });
});