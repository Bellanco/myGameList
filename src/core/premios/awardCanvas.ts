/**
 * Dibujo de la lámina premiada: el cartel del puesto con el nombre encima.
 *
 * TODO OCURRE EN EL NAVEGADOR, sobre un `<canvas>`. No hay servicio que componga la imagen ni nada que guardar:
 * el premio se deriva entero del archivo publicado (puesto + nombre), así que generarlo al vuelo sale más barato
 * que almacenar cinco imágenes por edición.
 *
 * Se dibuja a la RESOLUCIÓN NATIVA de la lámina y se muestra escalado por CSS: lo que se descarga sirve para
 * imprimir aunque en pantalla se esté viendo a 600 px.
 *
 * ⚠️ LA LÁMINA TIENE QUE VENIR DEL PROPIO ORIGEN. Con una imagen de otro dominio el canvas queda contaminado y
 * `toBlob` devuelve null: la descarga no falla, simplemente no ocurre. Es lo mismo que exige la CSP
 * (`img-src 'self'`).
 */
import { getAward } from './awards';

/**
 * La tipografía del título IMPRESO en la lámina, para que el nombre parezca parte del mismo cartel: Comic Sans MS
 * en negrita cursiva. NO es la tipografía del tema, y es deliberado — aquí manda el arte, no el sistema.
 *
 * Comic Sans MS va primera porque quien la tenga instalada verá exactamente la del cartel. El resto cae en Comic
 * Neue, su equivalente libre.
 */
const FONT_FAMILY = "'Comic Sans MS', 'Comic Neue', 'Chalkboard SE', cursive";
/** El título de la lámina va en negrita cursiva; el nombre lo acompaña. */
const FONT_STYLE = 'italic bold';
/** El título impreso lleva las letras sueltas; sin esto el nombre va más prieto que el cartel. */
const LETTER_SPACING = '0.04em';
/** Interlineado relativo al cuerpo, cuando el nombre no cabe en una línea. */
const LINE_HEIGHT = 1.18;
/** Más de dos líneas deja de leerse como un título y pasa a ser un párrafo. */
const MAX_LINES = 2;

/**
 * Parte un texto en líneas que quepan en el ancho dado.
 *
 * Corta por palabras y, solo si una palabra suelta no cabe entera, por caracteres: un nombre de cincuenta
 * caracteres sin espacios es legítimo y sin ese respaldo se saldría de la lámina.
 */
export function wrapText(
  measure: (text: string) => number,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let current = '';

  const flush = () => {
    if (current) lines.push(current);
    current = '';
  };

  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }

    flush();
    if (measure(word) <= maxWidth) {
      current = word;
      continue;
    }

    // La palabra no cabe ni sola: se trocea por caracteres.
    let chunk = '';
    for (const char of word) {
      if (chunk && measure(chunk + char) > maxWidth) {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk += char;
      }
    }
    current = chunk;
  }

  flush();
  return lines;
}

/** Caja de texto en píxeles, ya resuelta contra el tamaño de la lámina. */
export interface AwardTextBox {
  width: number;
  height: number;
}

/**
 * Mayor cuerpo de letra con el que el nombre cabe en la caja.
 *
 * Se prueba de grande a pequeño porque lo que manda es LLENAR el hueco: la lámina tiene una zona concreta y un
 * nombre corto debe verse grande, no del mismo tamaño que uno largo.
 *
 * La medición se INYECTA para poder probar esto sin un canvas real: en jsdom `measureText` devuelve siempre 0 y
 * cualquier cálculo daría falsos verdes.
 */
export function layoutAwardName(
  measureAt: (text: string, fontSize: number) => number,
  name: string,
  box: AwardTextBox,
): { fontSize: number; lines: string[] } {
  const text = String(name || '').trim();
  // El techo es el alto de la caja; el suelo, el cuerpo por debajo del cual el nombre ya no se lee impreso.
  const maxFontSize = Math.floor(box.height);
  const minFontSize = Math.max(12, Math.floor(box.height * 0.18));

  for (let fontSize = maxFontSize; fontSize > minFontSize; fontSize -= 1) {
    const lines = wrapText((chunk) => measureAt(chunk, fontSize), text, box.width);
    if (lines.length <= MAX_LINES && lines.length * fontSize * LINE_HEIGHT <= box.height) {
      return { fontSize, lines };
    }
  }

  // Suelo: mejor un nombre pequeño y recortado a dos líneas que ningún nombre.
  const lines = wrapText((chunk) => measureAt(chunk, minFontSize), text, box.width).slice(0, MAX_LINES);
  return { fontSize: minFontSize, lines };
}

/** Caché de láminas ya descargadas: la pantalla de resultados abre varias. */
const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  if (!imageCache.has(src)) {
    imageCache.set(
      src,
      new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`No se pudo cargar la lámina ${src}`));
        image.src = src;
      }).catch((error: unknown) => {
        // Un fallo no puede quedar cacheado: el siguiente intento debe reintentar.
        imageCache.delete(src);
        throw error;
      }),
    );
  }
  return imageCache.get(src) as Promise<HTMLImageElement>;
}

/**
 * Espera a que la tipografía del cartel esté lista ANTES de medir y pintar.
 *
 * LA DIFERENCIA CON LA APLICACIÓN DE ORIGEN: allí se inyectaba un `<link>` a Google Fonts. Aquí eso no vale —la
 * CSP declara `font-src 'self' data:` y las fuentes se sirven del propio origen (`scripts/vendor-fonts.mjs`)—, y
 * tampoco conviene: cargar una fuente desde un tercero transmite la IP del visitante, que es justo lo que se
 * quitó de esta app. La declaración `@font-face` de Comic Neue vive en la hoja de la sección; aquí solo se
 * ESPERA, porque un canvas no se repinta solo cuando la fuente termina de llegar y el premio se quedaría con la
 * letra de respaldo para siempre.
 *
 * Si el navegador no expone `document.fonts`, se sigue adelante: la lámina sale igual, con otra letra.
 */
async function ensureFont(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  try {
    await document.fonts.load(`${FONT_STYLE} 100px ${FONT_FAMILY}`);
    await document.fonts.ready;
  } catch {
    // Sin la fuente, la lámina sale igual.
  }
}

/**
 * Fija la fuente del contexto para un cuerpo dado.
 *
 * El espaciado se asigna DESPUÉS de `font` a propósito: va en `em`, así que se resuelve contra el tamaño que el
 * contexto tenga en ese momento. Al revés quedaría calculado sobre el cuerpo anterior.
 */
function applyFont(ctx: CanvasRenderingContext2D, fontSize: number): void {
  ctx.font = `${FONT_STYLE} ${fontSize}px ${FONT_FAMILY}`;
  // `letterSpacing` no existe en navegadores antiguos ni en jsdom; asignarlo de más no rompe nada.
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = LETTER_SPACING;
}

/** Pinta la lámina del puesto con el nombre encima. */
export async function drawAward(
  canvas: HTMLCanvasElement | null,
  { rank, name }: { rank: number; name: string },
): Promise<void> {
  const award = getAward(rank);
  if (!canvas || !award) return;

  const [image] = await Promise.all([loadImage(award.image), ensureFont()]);

  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(image, 0, 0);

  const box = {
    x: award.box.x * canvas.width,
    y: award.box.y * canvas.height,
    width: award.box.w * canvas.width,
    height: award.box.h * canvas.height,
  };

  const measureAt = (text: string, fontSize: number) => {
    applyFont(ctx, fontSize);
    return ctx.measureText(text).width;
  };
  const { fontSize, lines } = layoutAwardName(measureAt, name, box);

  applyFont(ctx, fontSize);
  ctx.fillStyle = award.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Un halo del propio color: sobre negro puro el texto queda plano, y este resplandor lo asienta como si
  // estuviera grabado en la lámina.
  ctx.shadowColor = award.color;
  ctx.shadowBlur = fontSize * 0.22;

  const lineHeight = fontSize * LINE_HEIGHT;
  const blockHeight = lines.length * lineHeight;
  const centerX = box.x + box.width / 2;
  const firstBaseline = box.y + (box.height - blockHeight) / 2 + lineHeight / 2;

  lines.forEach((line, index) => {
    ctx.fillText(line, centerX, firstBaseline + index * lineHeight);
  });

  ctx.shadowBlur = 0;
}

/**
 * Descarga el contenido del canvas como JPEG.
 *
 * Con un blob y no con un `data:` URI: el de una lámina de 2000 px son cientos de miles de caracteres en el
 * atributo `href`, y Safari se atraganta.
 */
export function downloadCanvas(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  return new Promise<void>((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve();
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        // Liberar de inmediato cancelaría la descarga en Firefox.
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        resolve();
      },
      'image/jpeg',
      0.92,
    );
  });
}
