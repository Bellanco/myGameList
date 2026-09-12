import { isValidHttpUrl } from '../security/sanitize';

/**
 * EL AVISO DEL ADMINISTRADOR: un texto, un enlace y una cápsula que lo dice.
 *
 * QUÉ ES Y QUÉ NO ES. No es una notificación del sistema: esta app no tiene Web Push (el service worker no
 * lleva manejador `push` y no hay FCM), así que el aviso se ve CUANDO SE ABRE LA APP y en ningún otro momento.
 * Decirlo así no es una limitación escondida: es lo que hace que no haga falta pedir permisos, ni guardar un
 * token por dispositivo, ni montar una cola de envíos.
 *
 * SE REUTILIZA LA CÁPSULA DEL LOGRO (`AchievementToast`, §7.4 del plan de logros) porque el canal ya está
 * resuelto ahí: el carril de abajo a la izquierda, la pausa al leer, la convivencia con el banner de
 * consentimiento y los tres skins de paleta. Lo que cambia son tres cosas y solo tres:
 *
 *   · el DISCO de la izquierda es un icono del sprite, no una medalla —un aviso no se ha conseguido—;
 *   · el HALO es el acento del tema (`--steam-rgb`) y no la rareza, que aquí no significa nada;
 *   · al pulsar se va a OTRA WEB, así que el cuerpo es un `<a>` de verdad y no un botón.
 *
 * ESTE MÓDULO NO SABE DE RED NI DE REACT a propósito: es el saneado y la política de repetición, que es justo
 * lo que hay que poder probar sin navegador. Quien lo trae es `model/repository/announcementRepository`; quien
 * lo pinta, `view/components/AnnouncementToast`.
 *
 * ⚑ Y LO IMPORTA TAMBIÉN EL SERVIDOR. El aviso se guarda y se sirve desde una Pages Function del propio origen
 * (`functions/api/announcement.ts`, sobre KV) y no desde Firestore: lo lee todo el mundo al abrir la app, y
 * pedirlo a `firestore.googleapis.com` rompería la promesa de que una visita sin sesión no contacta con nadie
 * de fuera. Esa función importa ESTE saneado en vez de reimplementarlo, así que cliente y servidor no pueden
 * discrepar sobre qué es un aviso válido — y por eso aquí no puede entrar nada del navegador.
 */

/**
 * Se acaba de publicar un aviso DESDE ESTA MISMA APP (el panel). Sin detalle: solo la noticia de que hay algo
 * nuevo que mirar.
 *
 * ⚑ POR QUÉ HACE FALTA: el panel y la cápsula viven en la misma pestaña, y `useAnnouncement` decide al abrir la
 * app y al volver a ella. Publicar desde `/admin` y navegar a las listas no es ninguna de las dos cosas —no hay
 * recarga ni cambio de pestaña—, así que lo recién publicado no salía hasta recargar a mano. Es justo lo que
 * hace quien acaba de escribirlo: publicar y mirar si sale.
 *
 * ⚑ Y VIVE AQUÍ, en el núcleo, y no junto a la escritura que lo emite: el hook lo escucha desde `App`, que es el
 * arranque, e importar el repositorio para leer una cadena se llevaría por delante el `import()` dinámico y
 * metería el SDK de Firebase en el bundle inicial. Este módulo no depende de nada.
 */
export const ANNOUNCEMENT_PUBLISHED_EVENT = 'mygamelist:announcement';

/**
 * El mismo aviso, pero para LAS DEMÁS PESTAÑAS del navegador.
 *
 * ⚑ POR QUÉ NO BASTA EL EVENTO DE ARRIBA: un `CustomEvent` en `window` no sale de su pestaña, así que publicar en
 * una y mirar en otra —que es exactamente cómo se prueba esto— dejaba a la segunda sin enterarse hasta recargar
 * o hasta volver a ella pasados cinco minutos. Comprobado en Firefox con dos pestañas.
 *
 * `BroadcastChannel` lo reparte a todas las pestañas del mismo origen y está en todos los navegadores que
 * soporta la app. Donde no esté, no pasa nada: se sigue enterando al recargar o al volver pasado el rato.
 */
export const ANNOUNCEMENT_CHANNEL = 'mygamelist:announcement';

/**
 * LOS LÍMITES SON ESPEJO DE `firestore.rules` (`announcementIsValid()`): si se cambian aquí, hay que cambiarlos
 * allí y desplegar las reglas. Hay un test que los ata, igual que con `PUBLIC_NAME_MAX_LENGTH`.
 *
 * No son caprichosos: la cápsula mide lo que mide su disco (64 px) y el texto va en tres filas de una y dos
 * líneas. Un título de 200 caracteres no se recorta con elegancia, se recorta a mitad de palabra.
 */
export const ANNOUNCEMENT_LIMITS = {
  id: 40,
  kicker: 28,
  title: 60,
  /** Dos líneas a .82rem dentro de una cápsula de 30rem. Más que esto no cabe sin romper el círculo. */
  body: 120,
  url: 500,
  /** Veces que se insiste como MÁXIMO si nadie pulsa. Diez ya es pesado; el tope está para que no se pase de ahí. */
  repeats: 10,
  /** Espera entre dos avisos, en horas. 720 = un mes. */
  intervalHours: 720,
} as const;

/**
 * LOS ICONOS QUE PUEDE ELEGIR EL PANEL, y solo estos. Ocupan el sitio de la medalla en la cápsula.
 *
 * SALEN DE DOS SPRITES y da igual cuál: los ocho primeros los trae `AnnouncementSprite` (Material Symbols,
 * pensados para avisos) y los ocho últimos ya estaban en el sprite general de la app. Los dos usan el prefijo
 * `icon-`, así que quien pinta no tiene que saber de dónde viene cada dibujo.
 *
 * La lista es CERRADA por dos motivos: el disco es pequeño y no todo dibujo se lee a ese tamaño, y un nombre
 * escrito a mano en el documento sería un `<use>` roto que nadie ve hasta tenerlo delante.
 *
 * ⚑ AÑADIR UNO: pegar su `symbol` en `AnnouncementSprite`, su `id` aquí y su nombre en `ADMIN_ANNOUNCEMENT_UI.
 * iconNames`. Hay un test que exige que los tres pasos estén dados.
 */
export const ANNOUNCEMENT_ICONS = [
  'megafono',
  'votar',
  'fiesta',
  'novedad',
  'fecha',
  'rayo',
  'regalo',
  'info',
  'bell',
  'star',
  'rocket',
  'trophy',
  'dice-d20',
  'checkered-flag',
  'share-nodes',
  'signature',
] as const;

export type AnnouncementIcon = (typeof ANNOUNCEMENT_ICONS)[number];

/** El megáfono: un aviso es un anuncio, y es el dibujo que lo dice sin leer nada. */
export const DEFAULT_ANNOUNCEMENT_ICON: AnnouncementIcon = 'megafono';

/** Lo que se insiste y cada cuánto, si el panel no dice otra cosa. Tres veces, una al día. */
export const DEFAULT_REPEATS = 3;
export const DEFAULT_INTERVAL_HOURS = 24;

export interface Announcement {
  /**
   * LA CAMPAÑA. Es lo que distingue «el mismo aviso de siempre» de «uno nuevo»: la cuenta de veces vistas del
   * dispositivo cuelga de este `id`, así que cambiarlo se lo vuelve a enseñar a TODO EL MUNDO, incluido quien ya
   * lo pulsó. Por eso el panel tiene dos botones distintos (guardar / volver a publicar) y no uno.
   */
  id: string;
  /** El rótulo en versalitas de la primera fila: «Ya puedes votar». */
  kicker: string;
  /** El nombre, en la fila gorda. Una línea. */
  title: string;
  /** La descripción, hasta dos líneas. */
  body: string;
  /** A dónde lleva. http(s) absoluto, se abre en otra pestaña. */
  url: string;
  icon: AnnouncementIcon;
  /** Apagado = no se le enseña a nadie, sin borrar el documento ni la redacción. */
  active: boolean;
  /** Cuántas veces se insiste como máximo mientras no se pulse. */
  repeats: number;
  /** Horas de espera entre dos avisos del mismo aviso. */
  intervalHours: number;
  /** Cuándo se guardó por última vez (ms). Solo informativo, lo pinta el panel. */
  updatedAt: number;
}

/** Lo que este dispositivo recuerda del aviso que tiene delante. Ver `ANNOUNCEMENT_SEEN_KEY`. */
export interface AnnouncementSeen {
  /** A qué `id` se refiere la cuenta. Si no coincide con el del documento, la cuenta empieza de cero. */
  id: string;
  /** Veces que se ha PINTADO de verdad (no las que se han decidido pintar). */
  shown: number;
  /** Cuándo se pintó la última vez (ms). */
  lastAt: number;
  /** Se pulsó el enlace: no se vuelve a decir nada nunca más de este aviso. */
  clicked: boolean;
}

export const NO_SEEN: AnnouncementSeen = { id: '', shown: 0, lastAt: 0, clicked: false };

function text(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

function whole(value: unknown, fallback: number, max: number): number {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.min(number, max);
}

/**
 * LO QUE VENGA RARO DEL DOCUMENTO NO SE PROPAGA: o sale un aviso entero y bien formado, o sale `null`.
 *
 * Es más estricto que el saneado de la configuración de logros y tiene que serlo: aquí hay una URL que se va a
 * pintar como enlace, y una URL que no sea http(s) es la frontera anti-XSS de siempre (`isValidHttpUrl`, la
 * misma que usan las publicaciones del feed). Sin `id`, sin título o sin enlace válido no hay aviso: un aviso a
 * medias sería una cápsula que no lleva a ninguna parte.
 */
export function sanitizeAnnouncement(raw: unknown): Announcement | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;

  const id = text(data.id, ANNOUNCEMENT_LIMITS.id);
  const title = text(data.title, ANNOUNCEMENT_LIMITS.title);
  const url = text(data.url, ANNOUNCEMENT_LIMITS.url);
  if (!id || !title || !isValidHttpUrl(url)) return null;

  const icon = ANNOUNCEMENT_ICONS.find((name) => name === data.icon) || DEFAULT_ANNOUNCEMENT_ICON;

  return {
    id,
    kicker: text(data.kicker, ANNOUNCEMENT_LIMITS.kicker),
    title,
    body: text(data.body, ANNOUNCEMENT_LIMITS.body),
    url,
    icon,
    // Ausente = apagado. El lado seguro de un canal que habla a todo el mundo es callar.
    active: data.active === true,
    repeats: whole(data.repeats, DEFAULT_REPEATS, ANNOUNCEMENT_LIMITS.repeats),
    intervalHours: whole(data.intervalHours, DEFAULT_INTERVAL_HOURS, ANNOUNCEMENT_LIMITS.intervalHours),
    updatedAt: Number.isFinite(Number(data.updatedAt)) ? Number(data.updatedAt) : 0,
  };
}

/** Lo mismo para lo que este dispositivo tenga guardado: un JSON viejo o a medias vale como «no he visto nada». */
export function parseSeen(raw: string | null): AnnouncementSeen {
  if (!raw) return NO_SEEN;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const id = text(data.id, ANNOUNCEMENT_LIMITS.id);
    if (!id) return NO_SEEN;
    return {
      id,
      shown: Math.max(0, Math.floor(Number(data.shown)) || 0),
      lastAt: Math.max(0, Math.floor(Number(data.lastAt)) || 0),
      clicked: data.clicked === true,
    };
  } catch {
    return NO_SEEN;
  }
}

/**
 * ¿TOCA DECIRLO AHORA MISMO? La política entera, en una función pura, que es lo que permite probar «la tercera
 * vez ya no» sin abrir un navegador.
 *
 * Cuatro condiciones, y las cuatro tienen su porqué:
 *
 *   1. **Encendido.** Un aviso apagado no existe para nadie.
 *   2. **No se ha pulsado.** Quien ya entró en la web no necesita que se le siga diciendo; ESE es el gesto que
 *      lo apaga para siempre en este dispositivo, y no cerrarlo ni ignorarlo.
 *   3. **Queda cupo.** Se insiste como mucho `repeats` veces. Sin tope, un aviso encendido y olvidado se
 *      convierte en una cápsula perpetua, que es la forma más rápida de que la gente deje de leer los avisos.
 *   4. **Ha pasado el rato.** `intervalHours` desde la última vez. Sin esto, abrir y cerrar la app tres veces
 *      seguidas gastaría las tres veces en un minuto.
 *
 * La cuenta es de ESTE DISPOSITIVO (localStorage, como la marca de agua de los logros): quien use móvil y
 * ordenador lo verá en los dos. Es el precio de no escribir en Firestore una vez por usuario y por aviso.
 */
export function isAnnouncementDue(
  announcement: Announcement | null,
  seen: AnnouncementSeen,
  now: number,
): boolean {
  if (!announcement || !announcement.active) return false;
  // Una campaña nueva empieza de cero aunque el aparato recuerde la anterior.
  const mine = seen.id === announcement.id ? seen : NO_SEEN;
  if (mine.clicked) return false;
  if (mine.shown >= announcement.repeats) return false;
  return now - mine.lastAt >= announcement.intervalHours * 3600_000;
}

/** La cuenta después de pintarlo una vez. Sin efectos: quien la guarda es el hook. */
export function afterShown(announcement: Announcement, seen: AnnouncementSeen, now: number): AnnouncementSeen {
  const mine = seen.id === announcement.id ? seen : NO_SEEN;
  return { id: announcement.id, shown: mine.shown + 1, lastAt: now, clicked: mine.clicked };
}

/** La cuenta después de pulsar el enlace: se acabó para este aviso. */
export function afterClicked(announcement: Announcement, seen: AnnouncementSeen): AnnouncementSeen {
  const mine = seen.id === announcement.id ? seen : NO_SEEN;
  return { id: announcement.id, shown: mine.shown, lastAt: mine.lastAt, clicked: true };
}
