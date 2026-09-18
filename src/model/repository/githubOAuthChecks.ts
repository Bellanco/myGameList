// LAS TRES PREGUNTAS BARATAS DEL FLUJO «Conectar con GitHub», y por qué viven aparte del resto.
//
// Estas tres las hace la aplicación AL ARRANCAR o al pintar, siempre, aunque nadie vaya a conectar nada:
// ¿está configurada la OAuth App?, ¿venimos de un retorno de GitHub?, ¿de qué pantalla salió el viaje? Son una
// lectura de variable de entorno, una de la barra de direcciones y una de `localStorage`.
//
// El TRABAJO de verdad —montar la autorización, generar y verificar el `state`, canjear el `code` contra la
// Function del edge— vive en `githubOAuthRepository` y solo hace falta al pulsar el botón o al volver de GitHub.
// Separarlos es lo que permite que ese trabajo entre por `import()` y no pese en el chunk de arranque, donde
// estaba aunque la inmensa mayoría de las aperturas de la app no tocan OAuth.
//
// LAS DOS CONSTANTES COMPARTIDAS VIVEN AQUÍ a propósito: `beginGithubOAuth` escribe el origen y esto lo lee, así
// que si cada módulo tuviera su copia de la clave o del plazo, el viaje de vuelta se rompería en silencio el día
// que alguien cambiara una de las dos.

const GITHUB_CLIENT_ID = String(import.meta.env.VITE_GITHUB_CLIENT_ID || '').trim();

/**
 * DE DÓNDE SALIÓ EL VIAJE. El `redirect_uri` es fijo —`/ajustes`, que es el callback registrado en la OAuth App
 * de GitHub y no se puede improvisar—, así que quien empieza a conectar desde el hub social volvería a otra
 * pantalla y tendría que buscar el camino de vuelta a mano. Se apunta el camino de salida y se vuelve a él.
 */
export const ORIGIN_STORAGE_KEY = 'mis-listas-github-oauth-origin';

/**
 * CUÁNTO VALE UN `state`. Es el hueco entre pulsar «Conectar con GitHub» y volver autorizado: lo normal son
 * segundos, pero quien no tenga sesión abierta en GitHub pasa antes por su login y su segundo factor. Media hora
 * cubre eso de sobra y sigue acotando la ventana en la que un `code` ajeno podría colarse.
 */
export const STATE_TTL_MS = 30 * 60 * 1000;

/**
 * ¿Hay OAuth App configurada en este build? Si no, la interfaz no ofrece el botón y solo queda el flujo manual
 * de pegar un token (nada cambia para quien no configure la OAuth App).
 */
export function isGithubOAuthConfigured(): boolean {
  return GITHUB_CLIENT_ID.length > 0;
}

/** ¿La URL actual es un retorno de GitHub con `code` + `state`? */
export function hasGithubOAuthRedirect(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has('code') && params.has('state');
}

/**
 * El camino desde el que se inició la conexión, UNA SOLA VEZ (se borra al leerlo). Cadena vacía si no hay nada
 * apuntado, si caducó o si el almacenamiento no está disponible: entonces se sigue donde nos deje GitHub.
 *
 * La caducidad es la misma que la del `state` por el mismo motivo: un origen colgado de un intento abandonado
 * mandaría a quien conecte la semana que viene a la pantalla de la semana pasada.
 */
export function takeGithubOAuthOrigin(): string {
  try {
    const crudo = localStorage.getItem(ORIGIN_STORAGE_KEY);
    localStorage.removeItem(ORIGIN_STORAGE_KEY);
    if (!crudo) return '';
    const guardado = JSON.parse(crudo) as { v?: unknown; t?: unknown };
    const vigente = typeof guardado.t === 'number' && Date.now() - guardado.t < STATE_TTL_MS;
    return vigente && typeof guardado.v === 'string' ? guardado.v : '';
  } catch {
    return '';
  }
}
