// GET /r/:token — página pública de una reseña compartida.
//
// QUÉ HACE Y QUÉ NO: no pinta la reseña (eso es cosa de la SPA, que la pide a `/api/share/:token`). Lo único que
// aporta esta Function es reescribir los metadatos del shell para que la previsualización del enlace en un chat
// muestre el juego, la nota y el arranque del texto en vez del reclamo genérico de la app. Los agentes de
// previsualización no ejecutan JavaScript: si esto no existiera, verían el `index.html` sin más.
//
// Se responde SIEMPRE con el shell, también cuando el enlace no existe o ha caducado: la SPA se encarga de
// enseñar "este enlace ya no está disponible". Devolver un 404 dejaría al visitante ante la página de error de
// Cloudflare, que no explica nada y parece que la app está rota.
import { withShareMeta, type ShareMeta } from '../_lib/html';
import { isValidToken } from '../_lib/http';
import { shareKey, type Env } from '../_lib/keys';

interface StoredArticle {
  gameName?: unknown;
  grade?: unknown;
  rating?: unknown;
  review?: unknown;
  authorNick?: unknown;
  expiresAt?: unknown;
}

const asNumber = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export async function onRequestGet(context: {
  request: Request;
  env: Env;
  params: { token: string };
  next: () => Promise<Response>;
}): Promise<Response> {
  // `next()` devuelve el activo estático que corresponde a esta ruta: el shell de la SPA, gracias al
  // `/* /index.html 200` de `public/_redirects`.
  const shell = await context.next();

  const token = String(context.params.token || '');
  if (!isValidToken(token) || !context.env?.SHARES) {
    return shell;
  }

  const article = (await context.env.SHARES.get(shareKey(token), 'json')) as StoredArticle | null;
  if (!article) {
    return shell;
  }
  const expiresAt = asNumber(article.expiresAt);
  if (expiresAt !== null && expiresAt < Date.now()) {
    return shell;
  }

  const meta: ShareMeta = {
    gameName: typeof article.gameName === 'string' ? article.gameName : '',
    grade: asNumber(article.grade),
    rating: asNumber(article.rating),
    review: typeof article.review === 'string' ? article.review : '',
    authorNick: typeof article.authorNick === 'string' ? article.authorNick : '',
  };
  if (!meta.gameName) {
    return shell;
  }

  const url = new URL(context.request.url);
  const response = withShareMeta(shell, meta, `${url.origin}${url.pathname}`);

  // Caché corta y explícita aquí además de en `_headers`: retirar un enlace tiene que notarse enseguida, y no
  // conviene depender de que una regla de fichero se aplique también a las respuestas de las Functions.
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'public, max-age=60');
  return new Response(response.body, { status: response.status, headers });
}
