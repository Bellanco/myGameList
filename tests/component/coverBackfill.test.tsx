// El llenado de carátulas en segundo plano.
//
// Es la pieza que más puede molestar si se porta mal: recorre la biblioteca entera haciendo peticiones. Lo que
// se protege aquí es, por orden de gravedad: que APAGADA no hace absolutamente nada, que no se sale del ritmo
// para el que está calibrada (IGDB admite 4 consultas por segundo), que aprende quién no tiene carátula para
// dejar de preguntarlo, y que no repite la biblioteca en cada visita.
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';

vi.mock('../../src/model/repository/firebaseRepository', () => ({
  getPublicConfig: vi.fn(),
  setPublicConfig: vi.fn(async () => {}),
}));

/* El modo ampliado sale de quién ha iniciado sesión. Aquí se decide a mano para poder comprobar las dos caras sin
   montar una sesión de Firebase. */
const admin = vi.hoisted(() => ({ manda: false }));
vi.mock('../../src/view/hooks/useIsAdmin', () => ({ useIsAdmin: () => admin.manda }));

/* La petición del cupo levantado va al servidor con la sesión: aquí solo interesa SI se pide, no qué contesta
   (eso lo decide la Function, que lee el rango del perfil de verdad). */
const cupo = vi.hoisted(() => ({ pedido: 0 }));
vi.mock('../../src/model/repository/coverQuotaRepository', () => ({
  pedirCupoDeCaratulasLibre: async () => { cupo.pedido += 1; return true; },
}));

import { useCoverBackfill } from '../../src/view/hooks/useCoverBackfill';
import { coverUrl } from '../../src/core/utils/coverUrl';
import { reiniciarMemoriaDeCaratulas, sabemosQueNoTiene } from '../../src/core/utils/coverMemory';
import { claveDeJuego, guardarHechos, reiniciarIndiceDeCaratulas } from '../../src/core/utils/coverDone';
import type { GameItem, TabData } from '../../src/model/types/game';

const juego = (id: number, name: string, platforms: string[] = ['Steam']): GameItem =>
  ({ id, _ts: 0, name, platforms, genres: [], steamDeck: false, review: '' }) as GameItem;

const biblioteca = (juegos: GameItem[]): TabData =>
  ({ c: juegos, v: [], e: [], p: [], deleted: [], updatedAt: 0 }) as unknown as TabData;

let fetchSimulado: ReturnType<typeof vi.fn>;

beforeEach(() => {
  admin.manda = false;
  cupo.pedido = 0;
  localStorage.clear();
  reiniciarMemoriaDeCaratulas();
  reiniciarIndiceDeCaratulas();
  // El hook arranca cuando el navegador está ocioso; en las pruebas, ya.
  (window as unknown as { requestIdleCallback: unknown }).requestIdleCallback = (cb: () => void) => {
    cb();
    return 1;
  };
  (window as unknown as { cancelIdleCallback: unknown }).cancelIdleCallback = () => {};
  fetchSimulado = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchSimulado);
});

afterEach(async () => {
  /* Desmontar SIEMPRE antes de pasar al siguiente test. El recorrido es un bucle con pausas que sigue vivo
     después de que el test termine, y su siguiente petición caía en el contador del test de al lado: así fue
     como «no repite la biblioteca» falló tres veces seguidas por una llamada que no era suya. El desmontaje
     enciende la bandera de cancelado, y la espera le da el turno para verla. */
  cleanup();
  await new Promise((listo) => setTimeout(listo, 300));
  vi.unstubAllGlobals();
  localStorage.clear();
  reiniciarMemoriaDeCaratulas();
});

describe('llenado de carátulas', () => {
  it('APAGADA no hace ni una sola petición', async () => {
    // Es la garantía que sostiene la promesa de privacidad: sin encenderla, nadie pregunta por tus títulos.
    renderHook(() => useCoverBackfill(biblioteca([juego(1, 'Celeste'), juego(2, 'Portal')])));
    await new Promise((listo) => setTimeout(listo, 600));
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it('encendida recorre la biblioteca entera, y pide solo el mapa', async () => {
    localStorage.setItem('mis-listas-covers', 'on');
    renderHook(() => useCoverBackfill(biblioteca([juego(1, 'Celeste'), juego(2, 'Portal'), juego(3, 'Hades 2')])));

    await waitFor(() => expect(fetchSimulado).toHaveBeenCalledTimes(3), { timeout: 4000 });
    // `m=1`: resolver y apuntar, sin traerse la imagen. Calentar 300 juegos con sus portadas serían ~6 MB.
    for (const [url] of fetchSimulado.mock.calls) {
      expect(String(url)).toContain('m=1');
      expect(String(url).startsWith('/cover?')).toBe(true);
    }
  });

  it('va en fila y despacio: nunca dispara todo a la vez', async () => {
    localStorage.setItem('mis-listas-covers', 'on');
    const instantes: number[] = [];
    fetchSimulado.mockImplementation(async () => {
      instantes.push(Date.now());
      return new Response(null, { status: 204 });
    });
    renderHook(() => useCoverBackfill(biblioteca([juego(1, 'A'), juego(2, 'B'), juego(3, 'C')])));

    await waitFor(() => expect(instantes.length).toBe(3), { timeout: 4000 });
    // Entre una y otra hay pausa de verdad. Sin esto, 150 cajas reventaban el tope de IGDB y medio catálogo se
    // quedaba sin carátula (y, antes del arreglo, con el fallo guardado en caché).
    expect(instantes[2] - instantes[0]).toBeGreaterThanOrEqual(200);
  });

  it('aprende quién NO tiene carátula, para dejar de pedirla en cada visita', async () => {
    localStorage.setItem('mis-listas-covers', 'on');
    fetchSimulado.mockImplementation(async (url: string) =>
      String(url).includes('Max+Paine') ? new Response(null, { status: 404 }) : new Response(null, { status: 204 }),
    );
    renderHook(() => useCoverBackfill(biblioteca([juego(1, 'Max Paine 3'), juego(2, 'Portal')])));

    await waitFor(() => expect(fetchSimulado).toHaveBeenCalledTimes(2), { timeout: 4000 });
    await waitFor(() => expect(sabemosQueNoTiene(coverUrl('Max Paine 3', ['Steam']))).toBe(true));
    expect(sabemosQueNoTiene(coverUrl('Portal', ['Steam']))).toBe(false);
  });

  it('no repite la biblioteca en la siguiente visita', async () => {
    localStorage.setItem('mis-listas-covers', 'on');
    const datos = biblioteca([juego(1, 'Celeste'), juego(2, 'Portal')]);

    const primera = renderHook(() => useCoverBackfill(datos));
    await waitFor(() => expect(fetchSimulado).toHaveBeenCalledTimes(2), { timeout: 4000 });
    // El progreso se guarda al terminar el recorrido, no en cada juego: hay que esperarlo o la segunda visita
    // arrancaría sin memoria (y el test estaría comprobando otra cosa).
    await waitFor(() => expect(localStorage.getItem('mis-listas-covers-done-v2')).toContain('Portal'), { timeout: 4000 });
    primera.unmount();

    fetchSimulado.mockClear();
    renderHook(() => useCoverBackfill(datos)); // como volver a entrar en el listado
    await new Promise((listo) => setTimeout(listo, 600));
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  /* UN JUEGO SIN CARÁTULA NO SE VUELVE A PREGUNTAR, que es para lo que existe este recorrido: el 404 no lo
     cachea nadie, así que sin esto los mismos juegos sin imagen se preguntaban en cada visita. */
  it('no repregunta por los juegos que ya se sabe que no tienen carátula', async () => {
    localStorage.setItem('mis-listas-covers', 'on');
    const datos = biblioteca([juego(1, 'Max Paine 3'), juego(2, 'Portal')]);
    fetchSimulado.mockImplementation(async (url: string) =>
      String(url).includes('Max+Paine') ? new Response(null, { status: 404 }) : new Response(null, { status: 204 }),
    );

    const primera = renderHook(() => useCoverBackfill(datos));
    await waitFor(() => expect(fetchSimulado).toHaveBeenCalledTimes(2), { timeout: 4000 });
    await waitFor(() => expect(sabemosQueNoTiene(coverUrl('Max Paine 3', ['Steam']))).toBe(true));
    // El progreso se guarda al terminar el recorrido: hay que esperarlo o la segunda visita arrancaría sin
    // memoria y el test estaría comprobando otra cosa.
    await waitFor(() => expect(localStorage.getItem('mis-listas-covers-done-v2')).toContain('Portal'), {
      timeout: 4000,
    });
    primera.unmount();

    fetchSimulado.mockClear();
    renderHook(() => useCoverBackfill(datos)); // como volver a entrar, días después
    await new Promise((listo) => setTimeout(listo, 600));

    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  /* Y LA ÚNICA VÍA DE VUELTA: corregir el título. La clave de lo ya recorrido lleva el nombre dentro, así que un
     juego reescrito entra como lo que es —uno nuevo— y se pide otra vez. Sin esto, arreglar una errata no
     serviría de nada y el juego se quedaría sin carátula para siempre en ese navegador. */
  it('pero un título corregido se vuelve a pedir como si fuera nuevo', async () => {
    localStorage.setItem('mis-listas-covers', 'on');
    fetchSimulado.mockImplementation(async () => new Response(null, { status: 404 }));

    const primera = renderHook(() => useCoverBackfill(biblioteca([juego(1, 'Max Paine 3')])));
    await waitFor(() => expect(fetchSimulado).toHaveBeenCalledTimes(1), { timeout: 4000 });
    await waitFor(() => expect(sabemosQueNoTiene(coverUrl('Max Paine 3', ['Steam']))).toBe(true));
    await waitFor(() => expect(localStorage.getItem('mis-listas-covers-done-v2')).toContain('Max Paine 3'), {
      timeout: 4000,
    });
    primera.unmount();

    // El mismo juego, con el nombre arreglado, y esta vez IGDB sí lo tiene.
    fetchSimulado.mockClear();
    fetchSimulado.mockImplementation(async () => new Response(null, { status: 204 }));
    renderHook(() => useCoverBackfill(biblioteca([juego(1, 'Max Payne 3')])));

    await waitFor(() => expect(fetchSimulado).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(String(fetchSimulado.mock.calls[0][0])).toContain('Max+Payne');
    // Y el nombre nuevo no arrastra el «no» del viejo, que se queda donde estaba por si se deshace el cambio.
    expect(sabemosQueNoTiene(coverUrl('Max Payne 3', ['Steam']))).toBe(false);
  });

  /* A LOS NOVENTA DÍAS SE REVISA, que es lo que impide que un juego recién salido —el caso en que IGDB tarda en
     tener ficha— se quede sin carátula para siempre en este navegador. Son cuatro preguntas al año por juego sin
     imagen, frente a las cincuenta que costaba revisar cada semana. */
  it('vuelve a preguntar por un juego sin carátula cuando su marca cumple los noventa días', async () => {
    localStorage.setItem('mis-listas-covers', 'on');
    const datos = biblioteca([juego(1, 'Max Paine 3'), juego(2, 'Portal')]);
    const url = coverUrl('Max Paine 3', ['Steam']);
    // Como si otra sesión lo hubiera preguntado hace tres meses y hubiera dado por recorrida la biblioteca.
    localStorage.setItem('mis-listas-covers-none', JSON.stringify({ [url]: Date.now() - 91 * 24 * 3600 * 1000 }));
    guardarHechos(new Set([
      claveDeJuego('Max Paine 3', ['Steam'], false),
      claveDeJuego('Portal', ['Steam'], false),
    ]));
    reiniciarMemoriaDeCaratulas();

    // Y esta vez sí la tiene: la ficha ya existe en IGDB.
    fetchSimulado.mockImplementation(async () => new Response(null, { status: 204 }));
    renderHook(() => useCoverBackfill(datos));

    // Solo se repregunta ESE, no la biblioteca entera: Portal sigue dado por hecho.
    await waitFor(() => expect(fetchSimulado).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(String(fetchSimulado.mock.calls[0][0])).toContain('Max+Paine');
    // Y al aparecer la carátula, la marca se borra: a partir de aquí el listado la pinta.
    await waitFor(() => expect(sabemosQueNoTiene(url)).toBe(false));
  });

  /* Lo apuntado con el formato anterior —la URL entera de cada juego, dentro de un JSON— se traduce al leerlo.
     Sin esto, cambiar cómo se apunta obligaría a cada dispositivo a recorrer su biblioteca otra vez: cinco
     minutos de peticiones en segundo plano para volver a aprender lo que ya sabía. */
  it('no repite lo que ya estaba apuntado con el formato anterior', async () => {
    localStorage.setItem('mis-listas-covers', 'on');
    localStorage.setItem(
      'mis-listas-covers-done',
      JSON.stringify([coverUrl('Celeste', ['Steam']), coverUrl('Portal', ['Steam'])]),
    );

    renderHook(() => useCoverBackfill(biblioteca([juego(1, 'Celeste'), juego(2, 'Portal')])));
    await new Promise((listo) => setTimeout(listo, 600));

    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  /* El cupo del proxy lo levanta el SERVIDOR, que es quien comprueba el rango de verdad; el cliente solo
     pregunta, y solo cuando tiene sentido preguntarlo. */
  it('solo el rango más alto pide que le levanten el cupo', async () => {
    localStorage.setItem('mis-listas-covers', 'on');
    renderHook(() => useCoverBackfill(biblioteca([juego(1, 'Celeste')])));
    await waitFor(() => expect(fetchSimulado).toHaveBeenCalled(), { timeout: 4000 });
    expect(cupo.pedido).toBe(0);

    cleanup();
    admin.manda = true;
    localStorage.clear();
    localStorage.setItem('mis-listas-covers', 'on');
    renderHook(() => useCoverBackfill(biblioteca([juego(2, 'Portal')])));
    await waitFor(() => expect(cupo.pedido).toBe(1), { timeout: 4000 });
  });

  /* LO QUE NO SE PUDO PREGUNTAR NO ES UNA RESPUESTA. El 429 dice que se acabó el cupo de la hora, no que este
     juego no tenga carátula, y apuntarlo como hecho es la misma confusión que el servidor tiene prohibida (ver
     `consultar`, en `_lib/igdbCover.ts`). Muerde de verdad al importar una biblioteca grande: pasados los 500
     juegos de la hora, todo el resto del recorrido quedaba marcado para siempre en ese navegador, y esos juegos
     acababan resolviéndose en ráfaga al pintar el mosaico — el escenario que este recorrido existe para evitar. */
  it('no da por hecho lo que el cupo no dejó preguntar', async () => {
    localStorage.setItem('mis-listas-covers', 'on');
    // El primero pasa; a partir del segundo, esta IP ya ha gastado su cupo de la hora.
    fetchSimulado.mockImplementation(async () =>
      fetchSimulado.mock.calls.length === 1
        ? new Response(null, { status: 204 })
        : new Response(null, { status: 429 }),
    );
    const datos = biblioteca([juego(1, 'Celeste'), juego(2, 'Portal'), juego(3, 'Hades 2')]);

    const primera = renderHook(() => useCoverBackfill(datos));
    await waitFor(() => expect(fetchSimulado).toHaveBeenCalledTimes(2), { timeout: 4000 });
    // Y AHÍ SE PARA: lo que queda recibiría el mismo 429 durante el resto de la hora, así que el tercero ni se
    // pide. Antes eran cientos de peticiones que no resolvían nada.
    await new Promise((listo) => setTimeout(listo, 600));
    expect(fetchSimulado).toHaveBeenCalledTimes(2);

    await waitFor(() => expect(localStorage.getItem('mis-listas-covers-done-v2')).toContain('Celeste'), {
      timeout: 4000,
    });
    expect(localStorage.getItem('mis-listas-covers-done-v2')).not.toContain('Portal');
    primera.unmount();

    // En la visita siguiente se retoma justo por los dos que quedaron sin preguntar.
    fetchSimulado.mockClear();
    fetchSimulado.mockImplementation(async () => new Response(null, { status: 204 }));
    renderHook(() => useCoverBackfill(datos));
    await waitFor(() => expect(fetchSimulado).toHaveBeenCalledTimes(2), { timeout: 4000 });
    const pedidas = fetchSimulado.mock.calls.map(([url]) => String(url));
    expect(pedidas.some((url) => url.includes('Portal'))).toBe(true);
    expect(pedidas.some((url) => url.includes('Celeste'))).toBe(false);
  });

  /* El 501 dice que ESTE ENTORNO no tiene credenciales de IGDB, así que no hay ninguna carátula que resolver:
     recorrer la biblioteca entera de una en una con su pausa es gasto puro. Se para, como con el 429. */
  it('no recorre la biblioteca contra un entorno sin carátulas', async () => {
    localStorage.setItem('mis-listas-covers', 'on');
    fetchSimulado.mockImplementation(async () => new Response(null, { status: 501 }));
    renderHook(() => useCoverBackfill(biblioteca([juego(1, 'Celeste'), juego(2, 'Portal'), juego(3, 'Hades 2')])));

    await waitFor(() => expect(fetchSimulado).toHaveBeenCalledTimes(1), { timeout: 4000 });
    await new Promise((listo) => setTimeout(listo, 600));
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('mis-listas-covers-done-v2') ?? '').not.toContain('Celeste');
  });

  /* Lo mismo con una avería: un 500 no dice nada del juego. Pero este NO para el recorrido — puede ser de un
     título concreto, y los demás merecen su intento. */
  it('tampoco da por hecho lo que falló en el servidor', async () => {
    localStorage.setItem('mis-listas-covers', 'on');
    fetchSimulado.mockImplementation(async () => new Response(null, { status: 500 }));
    const datos = biblioteca([juego(1, 'Celeste')]);

    const primera = renderHook(() => useCoverBackfill(datos));
    await waitFor(() => expect(fetchSimulado).toHaveBeenCalledTimes(1), { timeout: 4000 });
    await new Promise((listo) => setTimeout(listo, 400));
    expect(localStorage.getItem('mis-listas-covers-done-v2') ?? '').not.toContain('Celeste');
    // Y tampoco se apunta como «este juego no tiene carátula», que es la otra forma de perderlo.
    expect(sabemosQueNoTiene(coverUrl('Celeste', ['Steam']))).toBe(false);
    primera.unmount();

    fetchSimulado.mockClear();
    renderHook(() => useCoverBackfill(datos));
    await waitFor(() => expect(fetchSimulado).toHaveBeenCalledTimes(1), { timeout: 4000 });
  });

  /* EL RECORRIDO Y EL LISTADO TIENEN QUE HACER LA MISMA PREGUNTA. El modo ampliado vive en un espacio de claves
     aparte —en KV y en la memoria de «este no tiene»—, así que un recorrido hecho en modo normal no calienta lo
     que el mosaico ampliado va a pedir ni le sirve sus «no»: la cuenta de administración pagaba el recorrido
     entero para nada y repetía los mismos 404 en cada visita. */
  it('recorre en el mismo modo en que el listado pide las carátulas', async () => {
    admin.manda = true;
    localStorage.setItem('mis-listas-covers', 'on');
    fetchSimulado.mockImplementation(async () => new Response(null, { status: 404 }));
    renderHook(() => useCoverBackfill(biblioteca([juego(1, 'Max Paine 3')])));

    await waitFor(() => expect(fetchSimulado).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(String(fetchSimulado.mock.calls[0][0])).toContain('x=1');
    // Y lo aprendido queda bajo la clave que `coverSrc` consulta para ese mismo modo.
    await waitFor(() => expect(sabemosQueNoTiene(coverUrl('Max Paine 3', ['Steam'], true))).toBe(true));
  });
});
