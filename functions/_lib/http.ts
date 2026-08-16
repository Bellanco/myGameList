// Utilidades de respuesta comunes a los endpoints de compartir reseñas.
//
// Esta carpeta la compila Cloudflare Pages, no Vite: queda fuera del tsconfig y del eslint del proyecto (lo mismo
// que ya pasaba con `functions/api/github-oauth.ts`). Por eso aquí no se importa nada del bundle salvo módulos
// SIN dependencias, como `src/core/constants/tiers.ts`.

/** Respuesta JSON. `no-store` por defecto: casi todo lo de esta API es privado o revocable. */
export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

/**
 * Error de API con forma estable `{ error, ...extra }`. El `extra` lleva lo que el cliente necesita para decir
 * algo útil en pantalla en vez de "ha fallado": cuántos enlaces activos hay, cuándo caduca el más antiguo, el
 * motivo de un veto.
 */
export function fail(status: number, error: string, extra: Record<string, unknown> = {}): Response {
  return json({ error, ...extra }, status);
}

/** El cuerpo JSON de la petición, o `null` si no es JSON válido o excede el tope. */
export async function readJson(request: Request, maxBytes = 200_000): Promise<Record<string, unknown> | null> {
  const raw = await request.text();
  if (raw.length > maxBytes) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Token opaco de 128 bits en base64url (22 caracteres). Aleatorio: nunca derivado del uid ni del juego. */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Un token con la forma que emitimos. Filtra basura antes de tocar KV. */
export function isValidToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(value);
}
