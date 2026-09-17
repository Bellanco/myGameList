// La vuelta de «Conectar con GitHub», y lo único que impide que un `code` ajeno se canjee por un token tuyo.
//
// El `code` que llega en la URL se cambia por un token con permiso sobre TUS gists, así que la pregunta que se
// protege aquí es una sola: ¿este retorno lo empezaste tú? La respuesta es el `state` que se guardó al salir. Sin
// él no hay nada que comparar, y lo que se comprueba abajo es que en ese caso NO se canjea nada.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { completeGithubOAuth } from '../../src/model/repository/githubOAuthRepository';

const CLAVE = 'mis-listas-github-oauth-state';

/** Coloca la URL de retorno de GitHub (`code` + `state`) sin recargar, como hace el navegador al volver. */
function vuelveDeGithub(code: string, state: string): void {
  window.history.replaceState({}, '', `/ajustes?code=${code}&state=${state}`);
}

/** Deja guardado un `state` como lo deja `beginGithubOAuth`, con la antigüedad que se quiera. */
function guardado(state: string, hace = 0): void {
  localStorage.setItem(CLAVE, JSON.stringify({ v: state, t: Date.now() - hace }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('la vuelta de GitHub solo se canjea si la empezamos nosotros', () => {
  it('sin nada guardado NO se canjea: antes bastaba con que el state viniera informado', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    vuelveDeGithub('c0d3', 'inventado-por-otro');

    await expect(completeGithubOAuth()).rejects.toThrow(/no se pudo verificar/i);
    // Lo que de verdad importa: no se llegó a pedir el token.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('con un state caducado tampoco: media hora es todo lo que vale', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    guardado('mio', 31 * 60 * 1000);
    vuelveDeGithub('c0d3', 'mio');

    await expect(completeGithubOAuth()).rejects.toThrow(/no se pudo verificar/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('si el state no coincide, se rechaza aunque haya uno guardado', async () => {
    guardado('mio');
    vuelveDeGithub('c0d3', 'otro');

    await expect(completeGithubOAuth()).rejects.toThrow(/no coincide/i);
  });

  it('con el state bueno se canjea, y la clave no queda para un segundo uso', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ token: 'ghu_token' }), { status: 200 }),
    );
    guardado('mio');
    vuelveDeGithub('c0d3', 'mio');

    await expect(completeGithubOAuth()).resolves.toBe('ghu_token');
    expect(localStorage.getItem(CLAVE)).toBeNull();
  });

  /* La ventana del despliegue: quien salió hacia GitHub con la versión que guardaba en `sessionStorage` vuelve
     con esta. Sin este rescate, su conexión fallaría sin que hubiera hecho nada mal. */
  it('acepta el formato anterior de sessionStorage, que es lo que trae un flujo en vuelo', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ token: 'ghu_viejo' }), { status: 200 }),
    );
    sessionStorage.setItem(CLAVE, 'del-formato-viejo');
    vuelveDeGithub('c0d3', 'del-formato-viejo');

    await expect(completeGithubOAuth()).resolves.toBe('ghu_viejo');
    expect(sessionStorage.getItem(CLAVE)).toBeNull();
  });
});
