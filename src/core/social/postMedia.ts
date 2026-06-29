// F3 (media) — resolución SEGURA de imágenes/vídeos incrustables en las publicaciones del feed social.
//
// El texto de la publicación se guarda tal cual (el enlace no se modifica al publicar). Aquí decidimos, SOLO al
// renderizar, si una URL puede mostrarse como imagen/vídeo en lugar de como enlace. La frontera de seguridad es una
// LISTA BLANCA de orígenes de confianza: nunca se carga media desde dominios arbitrarios (evita píxeles de rastreo
// y fugas de IP a hosts no fiables). Lo que no resuelve aquí se renderiza como el enlace clicable de siempre.

export type PostMedia = { kind: 'image' | 'video'; src: string };

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif)$/i; // SVG excluido a propósito.
const VIDEO_EXT = /\.(mp4|webm|ogg|mov)$/i;

// Hosts de confianza (coincidencia por sufijo de dominio). Solo desde estos se incrusta media.
const TRUSTED_HOST_SUFFIXES = [
  'githubusercontent.com', // GitHub: raw.githubusercontent.com, user-images…, objects… ("repositorio seguro")
  'steamusercontent.com', // Steam: CDN directo de capturas/UGC (images.steamusercontent.com/ugc/…)
  'steamuserimages-a.akamaihd.net', // Steam: CDN antiguo de capturas (UGC)
  'steamstatic.com', // Steam: *.steamstatic.com (cabeceras/capsules de la tienda)
  'steamcommunity.com', // Steam: de confianza, pero /sharedfiles/filedetails/?id=… es una PÁGINA → se queda como enlace
  // (no está en IMAGE_DEFAULT_HOST_SUFFIXES a propósito: tratar la página como imagen mostraría HTML roto).
  'drive.google.com', // Google Drive: enlaces de compartir
  'googleusercontent.com', // Google: lh3.googleusercontent.com (Drive ya directo, fotos…)
  'playstation.net', // PSN (best-effort: sus URLs suelen caducar → fallback a enlace)
  'xboxlive.com', // Xbox (best-effort: idem)
];

// Hosts cuyas URLs de imagen NO llevan extensión de archivo (Steam UGC, googleusercontent): se asumen imagen.
const IMAGE_DEFAULT_HOST_SUFFIXES = [
  'steamusercontent.com',
  'steamuserimages-a.akamaihd.net',
  'googleusercontent.com',
];

function matchesSuffix(hostname: string, suffixes: string[]): boolean {
  const host = hostname.toLowerCase();
  return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/** Convierte un enlace de Google Drive (compartir) a una URL directa de imagen. Devuelve null si no es Drive. */
function resolveDriveImage(url: URL): string | null {
  if (url.hostname !== 'drive.google.com' && !url.hostname.endsWith('.drive.google.com')) {
    return null;
  }
  // Formas habituales: /file/d/{ID}/view  ·  /uc?id={ID}  ·  /open?id={ID}
  const id = url.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/)?.[1] || url.searchParams.get('id');
  return id ? `https://lh3.googleusercontent.com/d/${id}` : null;
}

/**
 * Decide si una URL de una publicación puede incrustarse como imagen/vídeo.
 * Solo http(s) (frontera anti-XSS) + host en la lista blanca. Si no, devuelve null y el render usa un enlace.
 */
export function resolvePostMedia(rawUrl: string): PostMedia | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  if (!matchesSuffix(url.hostname, TRUSTED_HOST_SUFFIXES)) {
    return null;
  }

  // Google Drive: transformar el enlace de compartir a URL directa de imagen.
  const driveImage = resolveDriveImage(url);
  if (driveImage) {
    return { kind: 'image', src: driveImage };
  }

  // Clasificación por extensión del pathname (GitHub raw, Steam/PSN/Xbox con extensión directa).
  if (VIDEO_EXT.test(url.pathname)) {
    return { kind: 'video', src: url.href };
  }
  if (IMAGE_EXT.test(url.pathname)) {
    return { kind: 'image', src: url.href };
  }

  // Hosts de imagen sin extensión (Steam UGC, googleusercontent).
  if (matchesSuffix(url.hostname, IMAGE_DEFAULT_HOST_SUFFIXES)) {
    return { kind: 'image', src: url.href };
  }

  return null;
}

/**
 * Detecta la PÁGINA de una captura de Steam (`steamcommunity.com/sharedfiles/filedetails/?id=…`). No se puede
 * incrustar (es HTML; la URL real de la imagen no se deriva del id y leerla está bloqueado por CORS) → el render
 * la deja como enlace y muestra un aviso para que se pegue la URL directa de la imagen.
 */
export function isSteamSharedFilePage(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const isSteamCommunity = host === 'steamcommunity.com' || host.endsWith('.steamcommunity.com');
  return isSteamCommunity && url.pathname.includes('/sharedfiles/filedetails');
}
