/**
 * EL NOMBRE DEL JUEGO QUE ALGUIEN HA COMPARTIDO CON LA APLICACIÓN, desde el menú «Compartir» de Android (el
 * `share_target` del manifiesto, que abre `/compartir?title=…&text=…&url=…`).
 *
 * Cada aplicación comparte a su manera y ninguna manda el nombre limpio:
 *   · la de Steam, el texto de la tienda: «Save 50% on Hades on Steam https://store.steampowered.com/app/…»
 *     (o «Ahorra un 50 % en Hades en Steam», en castellano);
 *   · Chrome, el `<title>` de la página en `title` y la dirección en `url`: «Hades on Steam», «Hades - Wikipedia»;
 *   · quien escribe a mano, el nombre a secas.
 *
 * Así que se quita lo que sobra alrededor —direcciones, la oferta, «en Steam», el nombre del sitio— y, si no queda
 * nada, se tira del trozo legible de la dirección de la tienda de Steam (`/app/1145360/Hades/`).
 *
 * La plataforma NO se deduce: son etiquetas libres (hay quien pone «Steam» y quien pone «PC») y elegir una por la
 * persona le dejaría una que tendría que corregir. El nombre se puede retocar en el formulario antes de guardar,
 * y el aviso de duplicado del formulario hace el resto.
 */

export interface SharedPayload {
  title?: string | null;
  text?: string | null;
  url?: string | null;
}

const URL_SUELTA = /https?:\/\/\S+/gi;
/** La misma, sin `g`: con `g`, `.test` guarda la posición entre llamadas y la segunda contestaría mal. */
const LLEVA_URL = /https?:\/\/\S+/i;

/** La oferta de la tienda de Steam, delante del nombre: «Save 50% on …», «Ahorra un 50 % en …». */
const OFERTA = /^(?:save|ahorra(?:\s+un)?)\s+\d+\s?%\s+(?:on|en)\s+/i;

/** «… on Steam» / «… en Steam», detrás del nombre. */
const EN_STEAM = /\s+(?:on|en)\s+Steam$/i;

/**
 * El nombre del sitio que los navegadores dejan en el título de la página. Solo los conocidos y separados por un
 * guion, una barra o un punto medio: cortar por cualquier guion se llevaría por delante juegos que lo llevan en
 * el nombre.
 */
const SITIO = /\s+[-–—|·]\s+(?:Wikipedia\b.*|Metacritic\b.*|IGDB\b.*|HowLongToBeat\b.*|GOG\.com\b.*|Epic Games Store\b.*|PlayStation\b.*|Xbox\b.*|Nintendo\b.*|Steam\b.*)$/i;

/** La desambiguación de Wikipedia: «Hades (video game)», «Prey (videojuego de 2017)». */
const DESAMBIGUACION = /\s*\((?:\d{4}\s+)?(?:video\s?game|videojuego)(?:\s+de)?(?:\s+\d{4})?\)$/i;

/** Comillas de cualquier tipo alrededor del nombre entero. */
const COMILLAS = /^["'«“‘]+|["'»”’]+$/g;

function limpiar(candidato: string): string {
  return candidato
    .replace(URL_SUELTA, ' ')
    .split('\n')
    .map((linea) => linea.trim())
    .find(Boolean)
    ?.replace(/\s+/g, ' ')
    .replace(OFERTA, '')
    .replace(SITIO, '')
    .replace(EN_STEAM, '')
    .replace(DESAMBIGUACION, '')
    .replace(COMILLAS, '')
    .replace(/[\s:–—-]+$/, '')
    .trim() ?? '';
}

/** El trozo legible de una ficha de la tienda de Steam: `/app/1145360/Hollow_Knight/` → «Hollow Knight». */
function nombreDeLaTiendaDeSteam(direccion: string): string {
  const coincide = /store\.steampowered\.com\/app\/\d+\/([^/?#\s]+)/i.exec(direccion);
  if (!coincide) return '';
  try {
    return decodeURIComponent(coincide[1]).replace(/_/g, ' ').trim();
  } catch {
    return '';
  }
}

/** El nombre del juego compartido, o `null` si de lo que ha llegado no se saca ninguno. */
export function sharedGameName({ title, text, url }: SharedPayload): string | null {
  for (const candidato of [title, text]) {
    const nombre = limpiar(String(candidato ?? ''));
    if (nombre) return nombre;
  }
  const direccion = [url, text, title].map((valor) => String(valor ?? '')).find((valor) => LLEVA_URL.test(valor));
  return (direccion && nombreDeLaTiendaDeSteam(direccion)) || null;
}
