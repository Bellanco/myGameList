// Flujo "Conectar con GitHub" (OAuth web) en el cliente. Sustituye la fricción de crear/pegar un PAT a mano por
// un botón: redirige a GitHub, el usuario autoriza el scope `gist`, y volvemos con un `code` que la Function del
// edge (functions/api/github-oauth.ts) canjea por un token usando el client_secret (que nunca toca el navegador).
//
// Gated: si no hay VITE_GITHUB_CLIENT_ID en el build, `isGithubOAuthConfigured()` es false y la UI no muestra el
// botón → solo queda el flujo manual de PAT (nada cambia para quien no configure la OAuth App).

const GITHUB_CLIENT_ID = String(import.meta.env.VITE_GITHUB_CLIENT_ID || '').trim();
const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const OAUTH_EXCHANGE_ENDPOINT = '/api/github-oauth';
const OAUTH_SCOPE = 'gist';
const STATE_STORAGE_KEY = 'mis-listas-github-oauth-state';
/**
 * CUÁNTO VALE UN `state`. Es el hueco entre pulsar «Conectar con GitHub» y volver autorizado: lo normal son
 * segundos, pero quien no tenga sesión abierta en GitHub pasa antes por su login y su segundo factor. Media hora
 * cubre eso de sobra y sigue acotando la ventana en la que un `code` ajeno podría colarse.
 */
const STATE_TTL_MS = 30 * 60 * 1000;

/** El scope `gist` da acceso de lectura/escritura a los gists del usuario (crear, listar y actualizar). */
export function isGithubOAuthConfigured(): boolean {
  return GITHUB_CLIENT_ID.length > 0;
}

/** URI de retorno = pantalla de ajustes del origen actual. Debe coincidir con el callback registrado en la OAuth App. */
function getRedirectUri(): string {
  return `${window.location.origin}/ajustes`;
}

function generateState(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fallback abajo */
  }
  // Fallback no criptográfico solo si randomUUID no existe; el state es una defensa CSRF, no un secreto.
  return `s_${Date.now().toString(36)}_${Math.abs(Math.floor((performance.now() % 1) * 1e9)).toString(36)}`;
}

/** Inicia el flujo: guarda el `state` para verificarlo a la vuelta y redirige a la pantalla de autorización de GitHub. */
export function beginGithubOAuth(): void {
  if (!isGithubOAuthConfigured()) {
    throw new Error('GitHub OAuth no está configurado');
  }
  const state = generateState();
  /* EN `localStorage` Y NO EN `sessionStorage`, y no es un detalle: el retorno de GitHub no siempre aterriza en
     el mismo contexto que inició el viaje —una app instalada puede devolverlo a una pestaña nueva—, y
     `sessionStorage` no cruza esa frontera. Cuando no cruzaba, el `state` guardado era `null` a la vuelta y la
     defensa CSRF se caía sola justo en el caso raro, que es precisamente cuando hace falta.
     Con la fecha al lado para poder caducarlo: una clave que se quedara colgada de un intento abandonado
     serviría para validar un retorno de la semana que viene. */
  try {
    localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify({ v: state, t: Date.now() }));
  } catch {
    /* Sin almacenamiento no hay forma de verificar el retorno, y a la vuelta se rechazará el intercambio. No se
       aborta aquí: la app entera guarda en local, así que este caso ya viene roto de antes y el mensaje de la
       vuelta explica mejor lo que pasa que un error sin contexto antes de salir. */
  }
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: getRedirectUri(),
    scope: OAUTH_SCOPE,
    state,
    allow_signup: 'true',
  });
  window.location.assign(`${GITHUB_AUTHORIZE_URL}?${params.toString()}`);
}

/** ¿La URL actual es un retorno de GitHub con `code` + `state`? */
export function hasGithubOAuthRedirect(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has('code') && params.has('state');
}

/** Quita `code`/`state`/`error` de la URL sin recargar, para que un refresco no reintente el intercambio. */
function stripOAuthParamsFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    ['code', 'state', 'error', 'error_description'].forEach((key) => url.searchParams.delete(key));
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* no bloqueante */
  }
}

/**
 * Completa el retorno de OAuth: valida el `state`, canjea el `code` por un token vía la Function del edge y
 * limpia la URL. Devuelve el token. Lanza si el state no coincide o el intercambio falla.
 */
export async function completeGithubOAuth(): Promise<string> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code') || '';
  const returnedState = params.get('state') || '';
  const oauthError = params.get('error');

  let storedState: string | null = null;
  try {
    const crudo = localStorage.getItem(STATE_STORAGE_KEY);
    localStorage.removeItem(STATE_STORAGE_KEY);
    if (crudo) {
      const guardado = JSON.parse(crudo) as { v?: unknown; t?: unknown };
      const vigente = typeof guardado.t === 'number' && Date.now() - guardado.t < STATE_TTL_MS;
      storedState = vigente && typeof guardado.v === 'string' ? guardado.v : null;
    }
    /* FORMATO ANTERIOR (`sessionStorage`, texto pelado). Solo se mira si arriba no había nada, y existe por la
       ventana del despliegue: quien salió hacia GitHub con la versión de antes vuelve con esta, y sin esto su
       conexión fallaría sin que hubiera hecho nada mal. */
    if (!storedState) {
      storedState = sessionStorage.getItem(STATE_STORAGE_KEY);
      sessionStorage.removeItem(STATE_STORAGE_KEY);
    }
  } catch {
    /* sin almacenamiento no podemos verificar el state; se rechaza abajo */
  }

  stripOAuthParamsFromUrl();

  if (oauthError) {
    throw new Error('Autorización de GitHub cancelada o denegada');
  }
  if (!code) {
    throw new Error('Falta el código de autorización de GitHub');
  }
  /* DEFENSA CSRF, y aquí se para de verdad. Antes, cuando no había nada guardado con qué comparar, bastaba con
     que el `state` viniera informado para seguir adelante y canjear el `code`: o sea, cualquier valor servía, que
     es tanto como no tener defensa. Lo que se protege no es un detalle —el `code` se canjea por un token con
     permiso sobre TUS gists—, así que sin state guardado no se canjea nada. */
  if (!returnedState) {
    throw new Error('Falta el parámetro de seguridad (state)');
  }
  if (!storedState) {
    throw new Error('No se pudo verificar la vuelta de GitHub (el parámetro de seguridad se perdió o caducó). Inicia la conexión otra vez.');
  }
  if (returnedState !== storedState) {
    throw new Error('El parámetro de seguridad (state) no coincide');
  }

  const response = await fetch(OAUTH_EXCHANGE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: getRedirectUri(), state: returnedState }),
  });

  const data = (await response.json().catch(() => null)) as { token?: string; error?: string } | null;
  if (!response.ok || !data?.token) {
    throw new Error(data?.error || 'No se pudo obtener el token de GitHub');
  }
  return data.token;
}
