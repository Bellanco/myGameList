// Lectura del artículo público de una reseña compartida. SIN dependencias a propósito.
//
// Este módulo lo carga la pantalla que ve alguien que abre un enlace y puede no tener cuenta ni conocer la app.
// Por eso no importa nada: ni Firebase, ni el gateway, ni el resto de repositorios. Añadir aquí un import que
// arrastre el SDK convertiría una página de lectura en una carga de app entera, que es justo lo que se evita.
//
// La escritura (publicar, retirar, cuota) vive en `shareRepository.ts`, que sí necesita sesión.
import type { SharedReview } from '../types/share';

/** El artículo, o `null` si el enlace no existe, ha caducado o lo retiraron. No lanza: no hay nada que reintentar. */
export async function readSharedReview(token: string): Promise<SharedReview | null> {
  if (!token) {
    return null;
  }
  try {
    const response = await fetch(`/api/share/${encodeURIComponent(token)}`);
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as Partial<SharedReview> | null;
    // Comprobación mínima, sin Zod a propósito: meter el esquema aquí arrastraría la librería entera al chunk de
    // una página que se quiere mínima. Basta con confirmar que es un objeto de la versión que esta pantalla sabe
    // pintar; lo demás lo toleran los componentes (`MetaSection` ya ignora listas ausentes).
    if (!body || typeof body !== 'object' || body.v !== 1) {
      return null;
    }
    return body as SharedReview;
  } catch {
    return null;
  }
}

/**
 * Token de la ruta `/r/:token`, o cadena vacía si la ruta no es esa.
 *
 * Se resuelve mirando el `pathname` en crudo, sin el enrutador: lo usa el arranque para decidir si monta la app
 * entera o solo la página del artículo, y esa decisión se toma antes de que exista ningún enrutador.
 */
export function readPublicShareToken(pathname: string): string {
  const match = pathname.match(/^\/r\/([A-Za-z0-9_-]{16,64})\/?$/);
  return match ? match[1] : '';
}
