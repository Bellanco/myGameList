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

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
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

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return json({ error: 'Cuerpo JSON inválido' }, 400);
  }

  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const redirectUri = typeof body.redirect_uri === 'string' ? body.redirect_uri.trim() : '';
  if (!code) {
    return json({ error: 'Falta el parámetro code' }, 400);
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
