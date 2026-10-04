import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { usePremiosVisible } from '../../src/viewmodel/premios/usePremiosVisible';
import { PREMIOS_VISIBLE_KEY } from '../../src/core/constants/storageKeys';
import { PREMIOS_VISIBILITY_EVENT } from '../../src/core/premios/visibilitySnapshot';

/**
 * LA ENTRADA A LOS PREMIOS en el menú de Ajustes, que la ve TODO EL MUNDO —también quien no ha iniciado sesión
 * nunca—. Su respuesta viene de `/api/premios`, del propio dominio, y la regla se aplica aquí.
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
  it('ofrece la entrada sin sesión cuando el administrador la ha encendido', async () => {
    vi.stubGlobal('fetch', respondeCon({ visible: true, closesAtMillis: AHORA + DIA }));

    render(<Sonda />);
    await waitFor(() => expect(screen.getByTestId('ofrece')).toHaveTextContent('sí'));
    // Y se recuerda, para pintar sin parpadeo en la siguiente visita.
    expect(localStorage.getItem(PREMIOS_VISIBLE_KEY)).toBe('on');
  });

  // Solo el interruptor decide: con la votación abierta pero sin encender, tampoco (ver `core/premios/visibility`).
  it('no la ofrece si no está encendida, aunque haya votación abierta', async () => {
    localStorage.setItem(PREMIOS_VISIBLE_KEY, 'on');
    vi.stubGlobal('fetch', respondeCon({ closesAtMillis: AHORA + DIA }));

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

  // docs/plan-degradacion-servicios.md, fase 2: una respuesta de ERROR (Function sin cupo, KV agotado) se tomaba
  // por «no hay premios», se guardaba «oculto» en este navegador y la entrada desaparecía hasta que la API volviera.
  it('con un error del servidor o la página de error de Cloudflare, no apaga la entrada', async () => {
    localStorage.setItem(PREMIOS_VISIBLE_KEY, 'on');
    const fetchSpy = vi.fn(async () => new Response('<html>Error 1027</html>', { status: 429, headers: { 'content-type': 'text/html' } }));
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    render(<Sonda />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(screen.getByTestId('ofrece')).toHaveTextContent('sí');
    expect(localStorage.getItem(PREMIOS_VISIBLE_KEY)).toBe('on');
  });

  it('ni con un 200 que en realidad es HTML (el `404.html` estático en modo «fail open»)', async () => {
    localStorage.setItem(PREMIOS_VISIBLE_KEY, 'on');
    const fetchSpy = vi.fn(async () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }));
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    render(<Sonda />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(localStorage.getItem(PREMIOS_VISIBLE_KEY)).toBe('on');
  });

  /**
   * EL CASO QUE SE ESCAPÓ EN PRODUCCIÓN: el menú pregunta al abrir la app, el administrador abre la edición un
   * minuto después, y como la respuesta está cacheada —en memoria y en este navegador— la entrada no aparecía
   * hasta recargar. El panel avisa al publicar y esto vuelve a preguntar.
   */
  it('se entera cuando el panel publica una foto nueva', async () => {
    const respuestas = [{ visible: false }, { visible: true }];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => respuestas.shift() ?? respuestas[0] })) as unknown as typeof fetch,
    );

    render(<Sonda />);
    await waitFor(() => expect(screen.getByTestId('ofrece')).toHaveTextContent('no'));

    window.dispatchEvent(new CustomEvent(PREMIOS_VISIBILITY_EVENT));
    await waitFor(() => expect(screen.getByTestId('ofrece')).toHaveTextContent('sí'));
  });

  /**
   * LA VUELTA A LA APP TIENE TOPE. Salta la caché HTTP, así que sin él cada cambio de ventana era una invocación
   * de Pages Functions y una lectura de KV: dos cupos diarios del plan gratuito (docs/plan-capacidad-gratuita.md).
   * El aviso del panel sigue forzando siempre: es quien acaba de publicar.
   */
  it('al volver a la app no repite la pregunta antes de cinco minutos, y el panel sí fuerza', async () => {
    const pedir = respondeCon({ visible: true });
    vi.stubGlobal('fetch', pedir);
    const volver = () => document.dispatchEvent(new Event('visibilitychange'));

    render(<Sonda />);
    await waitFor(() => expect(screen.getByTestId('ofrece')).toHaveTextContent('sí'));
    const alAbrir = vi.mocked(pedir).mock.calls.length;

    volver();
    volver();
    vi.setSystemTime(AHORA + 4 * 60_000);
    volver();
    // Los `import()` del hook resuelven en otra vuelta: hay que dejarles llegar antes de contar lo que NO pasó.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(vi.mocked(pedir).mock.calls.length).toBe(alAbrir);

    vi.setSystemTime(AHORA + 5 * 60_000 + 1);
    volver();
    await waitFor(() => expect(vi.mocked(pedir).mock.calls.length).toBe(alAbrir + 1));

    window.dispatchEvent(new CustomEvent(PREMIOS_VISIBILITY_EVENT));
    await waitFor(() => expect(vi.mocked(pedir).mock.calls.length).toBe(alAbrir + 2));
  });
});