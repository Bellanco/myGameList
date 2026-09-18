// LA VUELTA A DONDE SE EMPEZÓ.
//
// GitHub devuelve SIEMPRE a `/ajustes`: es el `redirect_uri` registrado en la OAuth App y no se improvisa desde
// el cliente. Pero conectar ya no se pide solo desde Integración —la pasarela del hub social monta la misma
// tarjeta—, así que quien empieza en `/social` acabaría en otra pantalla con su alta a medias y sin camino de
// vuelta. Se apunta el camino de salida al salir y se consume al volver.
import { describe, it, expect, beforeEach } from 'vitest';
import { takeGithubOAuthOrigin } from '../../src/model/repository/githubOAuthRepository';

const CLAVE = 'mis-listas-github-oauth-origin';

/** Deja apuntado un origen como lo deja `beginGithubOAuth`, con la antigüedad que se quiera. */
function apuntado(camino: string, hace = 0): void {
  localStorage.setItem(CLAVE, JSON.stringify({ v: camino, t: Date.now() - hace }));
}

beforeEach(() => {
  localStorage.clear();
});

describe('el origen de «Conectar con GitHub»', () => {
  it('devuelve el camino apuntado y no lo deja para un segundo uso', () => {
    apuntado('/social');

    expect(takeGithubOAuthOrigin()).toBe('/social');
    // De un solo uso: si quedara, el siguiente arranque de la aplicación se iría a la pantalla de la vez anterior.
    expect(localStorage.getItem(CLAVE)).toBeNull();
    expect(takeGithubOAuthOrigin()).toBe('');
  });

  it('sin nada apuntado devuelve vacío, y entonces se sigue donde nos deje GitHub', () => {
    expect(takeGithubOAuthOrigin()).toBe('');
  });

  // La misma caducidad que el `state`, y por el mismo motivo: un origen colgado de un intento abandonado mandaría
  // a quien conecte la semana que viene a la pantalla de la semana pasada.
  it('un origen caducado no cuenta: media hora es todo lo que vale', () => {
    apuntado('/social', 31 * 60 * 1000);

    expect(takeGithubOAuthOrigin()).toBe('');
  });

  it('un valor corrupto no revienta el arranque', () => {
    localStorage.setItem(CLAVE, 'no es json');

    expect(takeGithubOAuthOrigin()).toBe('');
  });
});
