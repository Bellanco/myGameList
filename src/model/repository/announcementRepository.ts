// EL AVISO A LOS USUARIOS, contra la API del PROPIO ORIGEN (`/api/announcement`, una Pages Function sobre KV).
//
// ⚑ Y NO CONTRA FIRESTORE, que es donde vive el resto de lo que decide el panel (`appConfig/achievements`). El
// motivo es de privacidad y está comprobado: este documento lo lee TODO EL MUNDO al abrir la app —también quien
// usa sus listas sin cuenta— y una lectura de Firestore desde el navegador es una petición a
// `firestore.googleapis.com`. La política de cookies promete que abrir la app sin sincronizar y sin sesión no
// contacta con ningún servidor ajeno, y hay un test de extremo a extremo que lo verifica («una visita anónima no
// contacta con terceros», `tests/e2e/smoke.test.ts`): la primera versión de esto, que leía Firestore, lo rompía.
// Sirviéndolo desde el mismo origen no hay terceros, no hay cookies y no hay una lectura de Firestore por
// usuario y sesión. Ver `functions/api/announcement.ts`.
//
// UNA LECTURA POR SESIÓN, cacheada en este módulo, y la segunda red la pone la propia respuesta: la función la
// sirve con `Cache-Control: public, max-age=300`, así que abrir y cerrar la app varias veces seguidas no vuelve
// a pedir nada. Un aviso recién publicado tarda esos minutos en llegar a quien ya tenía la app abierta hoy, que
// para algo que se toca dos veces al año es exactamente lo que hay que cambiar por no pedirlo en cada apertura.
//
// NUNCA LANZA AL LEER. Sin red, con la función sin desplegar o con la respuesta rota, devuelve `null`: no hay
// aviso y no pasa nada. Al ESCRIBIR sí lanza, porque ahí hay un administrador esperando saber si se guardó.
import {
  ANNOUNCEMENT_PUBLISHED_EVENT,
  sanitizeAnnouncement,
  type Announcement,
} from '../../core/announcement/announcement';
import { shareAuthHeaders } from './shareRepository';

const API = '/api/announcement';


/** Lo leído en esta sesión (o `null` si se leyó y no había nada). `undefined` = todavía no se ha leído. */
let cached: Announcement | null | undefined;

/** La lectura EN VUELO, para que dos pantallas pidiéndolo a la vez sean una sola petición. */
let inFlight: Promise<Announcement | null> | null = null;

/**
 * EL AVISO EN CURSO, o `null` si no hay ninguno (o si el que hay está mal formado, que para el caso es lo mismo).
 *
 * @param force salta la caché de sesión y la del navegador. Lo usa el PANEL, que es el único sitio donde ver una
 *              versión de hace unos minutos sería un fallo: se está a punto de reescribirla encima.
 */
export function loadAnnouncement(force = false): Promise<Announcement | null> {
  if (!force) {
    if (cached !== undefined) return Promise.resolve(cached);
    if (inFlight) return inFlight;
  }

  const request = (async (): Promise<Announcement | null> => {
    try {
      const response = await fetch(API, force ? { cache: 'no-store' } : undefined);
      if (!response.ok) return null;
      return sanitizeAnnouncement(await response.json());
    } catch {
      // Sin red o con la función sin desplegar: no hay aviso. No se recuerda el fallo — la próxima apertura
      // reintenta.
      return null;
    }
  })();

  if (!force) inFlight = request;
  return request.then((value) => {
    cached = value;
    inFlight = null;
    return value;
  });
}

/**
 * GUARDA EL AVISO. Quién puede NO lo decide este fichero: lo decide la Pages Function, comprobando en el ID
 * token verificado que quien llama es el administrador (`requireAdmin`). Cualquier comprobación que se hiciera
 * aquí sería cosmética — es el mismo reparto que en la moderación de enlaces.
 *
 * Devuelve lo que de verdad ha quedado guardado (la función responde con el aviso ya saneado), para que el panel
 * pinte eso y no lo que creía. Si falla, LANZA.
 */
export async function saveAnnouncement(next: Announcement): Promise<Announcement> {
  // EN LOCAL NO HAY SESIÓN QUE MANDAR, y no es una excepción de seguridad: en `npm run dev` no hay Firebase
  // configurado (las claves viven en el entorno de despliegue), así que pedir el token aquí lanzaría «Necesitas
  // iniciar sesión» y el aviso sería lo único del proyecto imposible de probar en la propia máquina. Quien
  // atiende esta petición en desarrollo es el plugin de Vite, que escribe un fichero ignorado por git y no mira
  // ninguna cabecera; en producción, la Pages Function EXIGE el token y comprueba que eres el administrador
  // (`requireAdmin`), y esta rama ni siquiera se compila.
  const headers = import.meta.env.DEV
    ? { 'Content-Type': 'application/json' }
    : await shareAuthHeaders(() => new Error('Necesitas iniciar sesión'));

  const response = await fetch(API, {
    method: 'PUT',
    headers,
    body: JSON.stringify(next),
  });

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(body.error || 'No se ha podido guardar el aviso'));
  }

  const saved = sanitizeAnnouncement(body);
  if (!saved) throw new Error('El aviso guardado ha llegado incompleto');
  cached = saved;
  // La caché de sesión ya lleva lo guardado, así que quien escuche esto no necesita pedir nada a la red.
  window.dispatchEvent(new CustomEvent(ANNOUNCEMENT_PUBLISHED_EVENT));
  return saved;
}
