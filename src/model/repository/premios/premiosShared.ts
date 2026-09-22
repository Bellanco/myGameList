// Piezas comunes de los repositorios de la porra: dónde vive cada cosa y cómo se habla con Firestore.
//
// LOS NOMBRES DE COLECCIÓN ESTÁN AQUÍ Y EN NINGÚN OTRO SITIO. Vienen prefijados a propósito: la aplicación de
// origen usaba `categories`, `config`, `results` y `winners`, que son palabras que esta app puede querer para lo
// suyo cualquier día —`categories` suena mucho más a géneros de juego que a categorías de premio— y una colección
// mal llamada no se renombra después sin migrar datos.
//
// El SDK se importa de forma ESTÁTICA, no por la fachada perezosa (`firebaseGateway`): estos módulos solo los
// carga la sección de premios, que ya es un chunk `lazy`, así que Firebase no entra en el grafo del arranque. Es
// el mismo criterio que sigue `firebaseAdminRepository`.
import { initializeFirebaseServices } from '../firebaseClient';

/** Categorías y sus nominados. Lectura para cualquiera con sesión; escritura, solo el administrador. */
export const CATEGORIES_COLLECTION = 'premiosCategories';

/** Calendario y estado de la edición. Lectura PÚBLICA: hace falta antes de que nadie inicie sesión. */
export const CONFIG_COLLECTION = 'premiosConfig';
export const CONFIG_VOTING_DOC = 'voting';

/** Las papeletas, una por cuenta. La lee su dueño y el administrador. */
export const BALLOTS_COLLECTION = 'premiosBallots';

/** Ediciones archivadas. Lectura PÚBLICA (ver `docs/plan-unificar-premios.md` §4.2). */
export const RESULTS_COLLECTION = 'premiosResults';

/** Documentos que solo toca el administrador: los ganadores antes de publicarse. */
export const ADMIN_COLLECTION = 'premiosAdmin';
export const ADMIN_WINNERS_DOC = 'winners';

/**
 * Prefijo del registro de trofeos de cada edición: `premiosAdmin/palmares-<seasonId>`.
 *
 * Guarda A QUIÉN se le concedió el trofeo, que es el dato que el archivo publicado NO puede llevar —es público—
 * y que las papeletas dejan de tener —se retiran al publicar—. Sin él, quitar el logro de una edición sería
 * irreversible: no habría forma de saber a quién devolvérselo.
 */
export const ADMIN_PALMARES_PREFIX = 'palmares-';

/** El documento de registro de una edición. */
export function palmaresDocId(seasonId: string): string {
  return `${ADMIN_PALMARES_PREFIX}${seasonId}`;
}

/**
 * Tope de operaciones por lote que admite Firestore.
 *
 * Estaba escrito a mano en cada repositorio que lotea. Es un límite del servicio, no una preferencia: si se
 * cambia (o si Firestore lo cambia), tiene que cambiar en todos a la vez.
 */
export const BATCH_LIMIT = 500;

/**
 * Servicios de Firebase, o error si no hay configuración.
 *
 * Mismo ayudante que usa el panel de administración: sin esto, cada función tendría que decidir por su cuenta qué
 * hacer con un entorno sin Firebase, y la mitad lo haría distinto.
 */
export async function requireServices() {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }
  return services;
}
