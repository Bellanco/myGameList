// LA FOTO GENÉRICA DE GOOGLE NO ES UNA FOTO.
//
// Quien no sube foto a su cuenta de Google no se queda sin `photoURL`: Google le genera un MONOGRAMA —su inicial en
// blanco sobre un círculo de color plano— y lo sirve desde el mismo sitio y con el mismo formato de URL que una foto
// de verdad:
//
//   https://lh3.googleusercontent.com/a/<identificador>=s96-c
//
// Por la URL no se distinguen: mismo host, mismo prefijo `/a/`, mismo sufijo de tamaño, e identificadores de la
// misma pinta. (No se transcriben ejemplos reales: son avatares de cuentas concretas.) Y eso rompía dos cosas a la
// vez. En el hub se pintaba el monograma de Google —justo la inicial-sobre-color que `HubAvatar` dejó de hacer a
// propósito— en lugar de la silueta de la web. Y peor: `Boolean(photoURL)` daba `true`, así que esa cuenta pasaba
// por "tiene foto", podía encender el interruptor y VEÍA LAS CARAS DE SUS AMIGOS sin poner la suya, que es
// exactamente el trato que la reciprocidad de `photoVisibility` deshace.
//
// CÓMO SE DISTINGUEN. Por lo que devuelve el servidor, que sí es concluyente. Medido sobre tres avatares reales
// —dos monogramas y una foto subida—, todos servidos con `access-control-allow-origin: *`, así que la app puede
// mirarlos sin proxy ni CORS de por medio:
//
//                    | monograma        | monograma        | foto real
//   content-type     | image/png        | image/png        | image/jpeg
//   bytes            | 1.580            | 478              | 3.985
//   colores (RGB>>4) | 23               | 12               | miles
//
// De ahí las dos cribas, en orden de coste. La primera es la que hace casi todo el trabajo: una foto subida se
// recodifica a JPEG, así que **un JPEG nunca se marca como genérico** y las fotos reales ni llegan a decodificarse.
// La segunda solo corre sobre PNG pequeños y cuenta colores: un monograma es color plano más el antialias de la
// letra; una fotografía, aunque venga en PNG, se va a cientos.
//
// LO QUE NO CUBRE, dicho claro: un PNG pequeño y de color plano subido a propósito como foto (un logo, un dibujo
// liso) se marcaría como genérico y su dueño se quedaría sin ver las caras de sus amigos. Es el falso positivo
// asumido: se acota exigiendo PNG **y** poco peso **y** pocos colores, y el remedio está a mano —subir una foto de
// verdad—. Al revés no falla, que es lo que importa: nada real se cuela como genérico por accidente.
//
// ANTE LA DUDA, FOTO REAL. Cualquier fallo —red caída, `canvas` no disponible (el entorno de pruebas), formato
// inesperado— resuelve `false`. Equivocarse hacia "es real" deja las cosas como estaban; equivocarse hacia
// "es genérica" le quita la cara a alguien que sí la tiene.

/** Peso máximo de un PNG que aún merece la pena mirar. Los monogramas medidos no pasan de 1,6 KB. */
const GENERIC_PNG_MAX_BYTES = 8 * 1024;

/**
 * Colores distintos (RGB cuantizado a 16 niveles por canal) que separan "color plano" de "imagen". Los monogramas
 * medidos dan 12 y 23; el margen hasta 48 cubre letras con más antialias sin acercarse a una fotografía.
 */
const GENERIC_MAX_COLORS = 48;

/** Lado máximo que se decodifica. Los avatares llegan a 96 px; recortarlo acota el coste del peor caso. */
const SAMPLE_MAX_SIDE = 96;

/**
 * Avatares por defecto que SÍ se reconocen por la URL, sin pedir nada. Son los de antes del monograma actual: la
 * silueta gris (`default-user`), el avatar clásico de gstatic y el `photo.jpg` del perfil sin foto de Google+.
 */
const DEFAULT_PHOTO_PATTERNS = [
  /\/a\/default-user\b/i,
  /gstatic\.com\/accounts\/ui\/avatar/i,
  /\/AAAAAAAAAAA\/.*\/photo\.jpg/i,
];

/**
 * ¿La URL delata por sí sola un avatar por defecto? Síncrono y gratis: no cubre el monograma actual (indistinguible
 * por URL), solo los defaults antiguos.
 */
export function isKnownDefaultPhotoURL(url: string | null | undefined): boolean {
  const value = String(url || '').trim();
  if (!value) {
    return true;
  }
  return DEFAULT_PHOTO_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Veredictos ya resueltos, por URL. La misma foto aparece en decenas de avatares (el feed, el directorio, cada
 * tarjeta de actividad de una misma persona): sin esto se repetiría la comprobación en cada uno. Vive en el módulo
 * —no en un estado— para que valga entre pantallas y montajes, y guarda la PROMESA para que las llamadas
 * simultáneas del primer render compartan una sola comprobación.
 */
const verdicts = new Map<string, boolean | Promise<boolean>>();

/** Veredicto ya conocido, si lo hay. Permite decidir en el primer render y no pintar una foto que se va a retirar. */
export function getKnownPhotoVerdict(url: string | null | undefined): boolean | undefined {
  const value = String(url || '').trim();
  if (isKnownDefaultPhotoURL(value)) {
    return true;
  }
  const cached = verdicts.get(value);
  return typeof cached === 'boolean' ? cached : undefined;
}

/** Cuenta colores distintos del bitmap, cuantizados a 16 niveles por canal. `null` si no se puede decodificar. */
async function countColors(blob: Blob): Promise<number | null> {
  // `createImageBitmap`/`OffscreenCanvas` faltan en el entorno de pruebas (jsdom) y en navegadores antiguos: sin
  // ellos no hay segunda criba y manda lo que diga la primera.
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') {
    return null;
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob);
    const width = Math.min(bitmap.width, SAMPLE_MAX_SIDE);
    const height = Math.min(bitmap.height, SAMPLE_MAX_SIDE);
    if (width < 1 || height < 1) {
      return null;
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return null;
    }
    // Sin suavizado: interpolar inventa tonos intermedios entre el círculo y la letra, que es justo lo que se está
    // contando. Un monograma reescalado con suavizado deja de parecer color plano.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const { data } = ctx.getImageData(0, 0, width, height);
    const colors = new Set<number>();
    for (let i = 0; i < data.length; i += 4) {
      colors.add(((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4));
      // Pasado el umbral ya no hace falta seguir: la respuesta es la misma con 49 colores que con 5.000.
      if (colors.size > GENERIC_MAX_COLORS) {
        return colors.size;
      }
    }
    return colors.size;
  } catch {
    return null;
  } finally {
    bitmap?.close?.();
  }
}

/**
 * Mira la imagen. `null` = NO SE HA PODIDO COMPROBAR, que no es lo mismo que "no es genérica": las dos se pintan
 * igual, pero solo la segunda merece cachearse. Sellar un fallo de red dejaría la foto dada por buena el resto de la
 * sesión, y el saneado de los canales —que corre una sola vez— se la saltaría.
 */
async function inspect(url: string): Promise<boolean | null> {
  try {
    // `force-cache` para reutilizar la respuesta que el `<img>` del avatar ya trajo: la comprobación no añade una
    // descarga, solo lee la que hay. `no-referrer` iguala lo que hace el `<img>`.
    const response = await fetch(url, { cache: 'force-cache', referrerPolicy: 'no-referrer' });
    if (!response.ok) {
      return null;
    }

    // CRIBA 1 — el formato. Una foto subida se sirve como JPEG; el monograma, siempre PNG. Aquí se van las fotos
    // reales sin decodificar un solo píxel.
    const type = (response.headers.get('content-type') || '').toLowerCase();
    if (!type.includes('png')) {
      return false;
    }

    const blob = await response.blob();
    if (blob.size > GENERIC_PNG_MAX_BYTES) {
      return false;
    }

    // CRIBA 2 — los colores. Solo llegan aquí los PNG pequeños.
    const colors = await countColors(blob);
    if (colors === null) {
      // Sin `canvas` manda el peso: un PNG de menos de 8 KB a tamaño de avatar no es una fotografía.
      return true;
    }
    return colors <= GENERIC_MAX_COLORS;
  } catch {
    return null;
  }
}

/**
 * ¿Esta `photoURL` es el avatar genérico de Google (o directamente no hay foto)?
 *
 * Cachea el veredicto por URL. Ante cualquier duda devuelve `false` (ver la cabecera del módulo).
 */
export function isGenericGooglePhoto(url: string | null | undefined): Promise<boolean> {
  const value = String(url || '').trim();
  if (isKnownDefaultPhotoURL(value)) {
    return Promise.resolve(true);
  }

  const cached = verdicts.get(value);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  const pending = inspect(value).then((generic) => {
    // Solo se cachea un veredicto de verdad. Lo no concluyente se olvida para que la próxima aparición de esta foto
    // —otro render, otra sesión del hub— vuelva a intentarlo.
    if (generic === null) {
      verdicts.delete(value);
      return false;
    }
    verdicts.set(value, generic);
    return generic;
  }).catch(() => {
    verdicts.delete(value);
    return false;
  });

  verdicts.set(value, pending);
  return pending;
}

/** Solo para pruebas: vacía la caché de veredictos. */
export function resetPhotoVerdicts(): void {
  verdicts.clear();
}
