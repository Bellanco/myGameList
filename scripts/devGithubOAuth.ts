/**
 * GEMELO DE `/api/github-oauth` EN EL SERVIDOR DE DESARROLLO (lo monta `localGithubOAuthApi` en `vite.config.ts`).
 *
 * «Conectar con GitHub» termina canjeando el `code` que devuelve GitHub por un token, y ese canje necesita el
 * `client_secret`, así que lo hace una Pages Function. `npm run dev` no ejecuta Functions: sin esto el botón
 * llevaba a GitHub y volvía a un 404. Aquí se llama a la MISMA `onRequestPost` que corre en Cloudflare, con sus
 * mismas comprobaciones de origen y de `redirect_uri`; lo único que cambia es de dónde salen las credenciales.
 *
 * LAS CREDENCIALES SON LAS DE UNA OAUTH APP DE DESARROLLO, no las de producción. La de producción tiene
 * registrado su callback en `https://mygamelist.pages.dev/ajustes`, GitHub solo admite uno por OAuth App y
 * rechaza cualquier `redirect_uri` de otro origen: con su `client_id` en local, GitHub contesta «redirect_uri is
 * not associated with this application» antes de llegar aquí. Ver `.env.example` y `.dev.vars.example`.
 *
 * Vive fuera de `vite.config.ts` para poder probarlo (`tests/unit/githubOAuthDev.test.ts`).
 */
import { onRequestPost } from '../functions/api/github-oauth';

export const GITHUB_OAUTH_ROUTE = '/api/github-oauth';

/** Lo que usa el gemelo de la petición de Node (`IncomingMessage`), sin atarse a sus tipos. */
export interface DevRequest extends AsyncIterable<Uint8Array | string> {
  url?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}

/** Lo que usa de la respuesta de Node (`ServerResponse`). */
export interface DevResponse {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string): unknown;
}

export interface GithubOAuthDevOptions {
  /** `client_id` de la OAuth App de desarrollo (el `VITE_GITHUB_CLIENT_ID` del modo desarrollo). */
  clientId: () => string;
  /** Su secreto (`GITHUB_DEV_CLIENT_SECRET` en `.dev.vars`). Se lee en cada canje: cambiarlo no pide reiniciar. */
  clientSecret: () => string;
  /** Aviso por consola, una sola vez, si falta algo. */
  warn?: (message: string) => void;
}

const header = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] ?? '' : value ?? '');

export function githubOAuthDevMiddleware(options: GithubOAuthDevOptions) {
  let warned = false;

  return (req: DevRequest, res: DevResponse, next: (error?: unknown) => void): void => {
    if (req.url?.split('?')[0] !== GITHUB_OAUTH_ROUTE) {
      next();
      return;
    }
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end();
      return;
    }

    void (async () => {
      const clientId = options.clientId().trim();
      const clientSecret = options.clientSecret().trim();
      if ((!clientId || !clientSecret) && !warned) {
        warned = true;
        options.warn?.(
          '[github-oauth] Falta la OAuth App de desarrollo: pon su client id en VITE_GITHUB_CLIENT_ID de ' +
          '`.env.development.local` y su secreto en GITHUB_DEV_CLIENT_SECRET de `.dev.vars` (ver `.env.example`).',
        );
      }

      const chunks: Uint8Array[] = [];
      for await (const chunk of req) chunks.push(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
      const body = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
      }

      // El origen de la petición es el del propio servidor, como en Cloudflare: así la comprobación de origen de
      // la Function vale tal cual (el navegador manda `Origin: http://localhost:8000`).
      const request = new Request(`http://${header(req.headers.host) || 'localhost'}${GITHUB_OAUTH_ROUTE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: header(req.headers.origin) },
        body,
      });
      const response = await onRequestPost({ request, env: { GITHUB_CLIENT_ID: clientId, GITHUB_CLIENT_SECRET: clientSecret } });
      res.statusCode = response.status;
      response.headers.forEach((value, name) => {
        res.setHeader(name, value);
      });
      res.end(await response.text());
    })().catch(next);
  };
}
