// Metadatos de previsualización para la página pública de una reseña (o un resumen del año) compartida.
//
// AQUÍ ESTÁ EL ÚNICO PUNTO PELIGROSO DE TODA LA FUNCIONALIDAD: el texto lo escribe un usuario y acaba dentro de
// atributos HTML que leen X, WhatsApp y compañía. Por eso la sustitución se hace con **HTMLRewriter**, que es un
// parser de verdad y escapa los valores al asignar atributos, en vez de con reemplazos de cadena sobre el shell
// (que es como se cuelan comillas y se inyectan etiquetas).
//
// La página en sí la pinta la SPA: aquí solo se reescriben `<title>` y las etiquetas `og:` / `twitter:` que ya
// existen en `index.html`.

export interface ShareMeta {
  gameName: string;
  grade: number | null;
  rating: number | null;
  review: string;
  authorNick: string;
}

const DESCRIPTION_MAX = 200;
const SITE_NAME = 'My Game List';

/**
 * Deja el texto en texto PLANO antes de meterlo en un metadato.
 *
 * HTMLRewriter ya escapa comillas y ampersands al asignar un atributo, así que un `<script>` dentro del valor no
 * es inyectable: el parser no abre etiquetas dentro de un valor de atributo. Esto es limpieza de PRESENTACIÓN —
 * lo que se ve en la tarjeta de un chat—, no la frontera de seguridad.
 *
 * Solo se quita lo que de verdad tiene forma de etiqueta (`<algo …>`). Borrar todos los ángulos sería peor que
 * el problema: una reseña puede decir "el jefe final se mata en <3 minutos" o "cuesta 5 < 10 horas", y ese texto
 * es legítimo y tiene que llegar entero.
 */
function plainText(value: string): string {
  return value
    .replace(/<\/?[a-zA-Z][^<>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nota en formato legible, o cadena vacía si la reseña no lleva. `grade` (0–100) manda sobre el espejo 0–5. */
function scoreLabel(meta: ShareMeta): string {
  if (typeof meta.grade === 'number') {
    return `${Math.round(meta.grade)}/100`;
  }
  if (typeof meta.rating === 'number') {
    return `${meta.rating}/5`;
  }
  return '';
}

/** Título de la tarjeta: juego, nota y autor. Es lo que se lee en el chat antes de decidir si se abre. */
export function shareTitle(meta: ShareMeta): string {
  const score = scoreLabel(meta);
  const name = plainText(meta.gameName);
  const nick = plainText(meta.authorNick);
  const head = score ? `${name} · ${score}` : name;
  return nick ? `${head} (reseña de ${nick})` : head;
}

/**
 * Descripción: el arranque del texto, en una línea y recortado por palabra. Se recorta por palabra y no a hueso
 * porque estas dos líneas son el único adelanto que ve quien recibe el enlace.
 */
export function shareDescription(review: string): string {
  const flat = plainText(review);
  if (flat.length <= DESCRIPTION_MAX) {
    return flat;
  }
  const cut = flat.slice(0, DESCRIPTION_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > DESCRIPTION_MAX * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Lo justo del resumen del año compartido para su tarjeta en un chat. */
export interface YearShareMeta {
  year: number;
  count: number;
  authorNick: string;
  best: { name: string; grade: number } | null;
}

/** Título de la tarjeta de un resumen: de quién, qué año y cuántos juegos. */
export function yearShareTitle(meta: YearShareMeta): string {
  const nick = plainText(meta.authorNick);
  const games = meta.count === 1 ? '1 juego terminado' : `${meta.count} juegos terminados`;
  return nick ? `El ${meta.year} de ${nick}: ${games}` : `Resumen de ${meta.year}: ${games}`;
}

/** Descripción de la tarjeta de un resumen: su juego del año, que es lo que invita a abrirlo. */
export function yearShareDescription(meta: YearShareMeta): string {
  if (!meta.best) {
    return `Los juegos, géneros y meses de su ${meta.year} en ${SITE_NAME}.`;
  }
  return `Su juego del año: ${plainText(meta.best.name)} · ${Math.round(meta.best.grade)}/100. Los juegos, géneros y meses de su ${meta.year}.`;
}

/** Reescribe los metadatos del shell con los de esta reseña. Devuelve una respuesta HTML lista para servir. */
export function withShareMeta(shell: Response, meta: ShareMeta, url: string): Response {
  return withPreviewMeta(shell, { title: shareTitle(meta), description: shareDescription(meta.review) }, url);
}

/** Lo mismo para un resumen del año compartido. */
export function withYearShareMeta(shell: Response, meta: YearShareMeta, url: string): Response {
  return withPreviewMeta(shell, { title: yearShareTitle(meta), description: yearShareDescription(meta) }, url);
}

function withPreviewMeta(shell: Response, { title, description }: { title: string; description: string }, url: string): Response {

  const setContent = (value: string) => ({
    element(element: { setAttribute(name: string, value: string): void }) {
      element.setAttribute('content', value);
    },
  });

  return new HTMLRewriter()
    .on('title', {
      element(element: { setInnerContent(value: string): void }) {
        // `setInnerContent` escapa el texto por defecto; no pasar `{ html: true }` aquí jamás.
        element.setInnerContent(`${title} · ${SITE_NAME}`);
      },
    })
    .on('meta[name="description"]', setContent(description))
    .on('meta[property="og:title"]', setContent(title))
    .on('meta[property="og:description"]', setContent(description))
    .on('meta[property="og:type"]', setContent('article'))
    .on('meta[property="og:url"]', setContent(url))
    .on('meta[name="twitter:title"]', setContent(title))
    .on('meta[name="twitter:description"]', setContent(description))
    .transform(shell);
}

/** Tipos mínimos de HTMLRewriter (el runtime lo trae; no se depende de @cloudflare/workers-types). */
declare const HTMLRewriter: {
  new (): {
    on(selector: string, handlers: unknown): typeof HTMLRewriter.prototype;
    transform(response: Response): Response;
  };
};
