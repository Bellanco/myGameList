// Cloudflare Pages Function — intercambio del `code` de GitHub OAuth por un access token.
//
// Por qué existe: el flujo web de OAuth exige un `client_secret` para canjear el `code`, y ese secreto NO puede
// vivir en el navegador (quedaría expuesto en el bundle). Esta Function corre en el edge de Cloudflare (mismo
// hosting que la app), guarda el secreto en variables de entorno del proyecto y devuelve solo el token al cliente.
//
// Endpoint: POST /api/github-oauth  Body JSON: { code: string, redirect_uri: string, state?: string }
// Respuesta: 200 { token } | 4xx/5xx { error }
//
// Variables de entorno (Cloudflare Pages → Settings → Environment variables, o .dev.vars en local):
//   GITHUB_CLIENT_ID      (mismo valor público que VITE_GITHUB_CLIENT_ID del build)
//   GITHUB_CLIENT_SECRET  (secreto; nunca en el cliente)
//
// Esta carpeta `functions/` la compila Cloudflare Pages, no Vite: queda fuera de tsconfig/eslint del proyecto.

interface Env {
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
}

type RequestBody = {
  code?: unknown;
  redirect_uri?: unknown;
};

// Un `code` de GitHub son unas decenas de caracteres. El tope solo está para no reenviar a GitHub un cuerpo
// arbitrariamente grande que llegue por aquí.
const MAX_CODE_LENGTH = 512;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    // `no-store` + `Vary: Origin`: la respuesta lleva un token de usuario, así que no puede quedar en ninguna
    // caché intermedia ni compartirse entre orígenes.
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' },
  });
}

// Cloudflare Pages invoca este handler para POST /api/github-oauth.
export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;

  const clientId = (env.GITHUB_CLIENT_ID || '').trim();
  const clientSecret = (env.GITHUB_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    return json({ error: 'OAuth no configurado en el servidor' }, 500);
  }

  // Este endpoint solo debe servir a la propia app. Sin la comprobación era un canjeador de códigos abierto:
  // cualquier página podía usarlo para convertir un `code` en un token con NUESTRO client_secret. No se responde
  // con cabeceras CORS a propósito (el navegador ya impide leer la respuesta desde otro origen), pero eso no
  // evita que la petición se ejecute, y el canje es de un solo uso: si otro lo gasta, el flujo del usuario
  // legítimo falla. Comparar contra el origen de la propia petición vale para producción y para cada despliegue
  // de vista previa sin tener que listar dominios.
  //
  // El navegador SIEMPRE manda `Origin` en un POST, así que exigirlo no rompe al cliente legítimo.
  const selfOrigin = new URL(request.url).origin;
  const origin = request.headers.get('Origin');
  if (origin !== selfOrigin) {
    return json({ error: 'Origen no permitido' }, 403);
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return json({ error: 'Cuerpo JSON inválido' }, 400);
  }

  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const redirectUri = typeof body.redirect_uri === 'string' ? body.redirect_uri.trim() : '';
  if (!code || code.length > MAX_CODE_LENGTH) {
    return json({ error: 'Falta el parámetro code' }, 400);
  }

  // El `redirect_uri` que se reenvía a GitHub tiene que ser de esta misma app. GitHub ya lo valida contra lo
  // registrado en la OAuth App, pero esa comprobación admite cualquier callback registrado: verificarlo aquí
  // evita que este endpoint sirva para completar un flujo iniciado en otro sitio.
  if (redirectUri) {
    let parsed: URL;
    try {
      parsed = new URL(redirectUri);
    } catch {
      return json({ error: 'redirect_uri inválido' }, 400);
    }
    if (parsed.origin !== selfOrigin) {
      return json({ error: 'redirect_uri no permitido' }, 403);
    }
  }

  let ghResponse: Response;
  try {
    ghResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        ...(redirectUri ? { redirect_uri: redirectUri } : {}),
      }),
    });
  } catch {
    return json({ error: 'No se pudo contactar con GitHub' }, 502);
  }

  if (!ghResponse.ok) {
    return json({ error: 'GitHub rechazó el intercambio del código' }, 502);
  }

  const data = (await ghResponse.json()) as { access_token?: string; error_description?: string; error?: string };
  if (data.error || !data.access_token) {
    return json({ error: data.error_description || data.error || 'No se recibió token de GitHub' }, 400);
  }

  return json({ token: data.access_token });
}
