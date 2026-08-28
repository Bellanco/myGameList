// L4 — Documentos legales del SERVICIO (no del código: el código va bajo GPL-3.0, ver LICENSE).
//
// El texto vive como datos (mismo patrón que `labels.ts`) para que `LegalScreen` lo pinte sin depender de
// ficheros estáticos: así hereda tema, tipografía y navegación de la app, y entra en el bundle perezoso de la
// pantalla legal. Cada documento es una lista de secciones con párrafos y, opcionalmente, viñetas.
//
// `LEGAL_VERSION` sella la aceptación (`publicConfig.consent.version`): al cambiarla, la puerta del hub social
// vuelve a pedir la conformidad. Súbela SOLO cuando cambie algo sustantivo de los términos o del tratamiento.

// 2026-08-16: COMPARTIR UNA RESEÑA CON ENLACE PÚBLICO. Es el cambio más sustantivo desde que existe la parte
// social, y por eso vuelve a pedirse la conformidad: hasta ahora el texto completo de una reseña NUNCA salía del
// ámbito privado —el canal social publica un fragmento de 160 caracteres— y ahora el usuario puede publicar una
// reseña concreta en una página abierta a cualquiera. Es siempre una acción suya, reseña a reseña, con caducidad
// según su rango y revocable. Aparece un destinatario nuevo (cualquiera con el enlace), un lugar nuevo donde se
// guardan datos (Cloudflare, mientras el enlace viva) y una salvedad que hay que decir sin adornos: retirar un
// enlace lo deja inaccesible, pero no recoge las copias que ya circulen.
//
// 2026-08: (a) el canal social pasa de Gist público a NO LISTADO, y los antiguos se migran y se retiran — la
// única excepción a que la app no toque tus Gists, declarada en las condiciones; (b) se corrige el aviso que
// aconsejaba usar «Gists privados», que GitHub no tiene: solo públicos y secretos, y los secretos son legibles
// por id. Cambian los destinatarios y lo que la app hace con tus Gists, así que la puerta del hub vuelve a pedir
// la conformidad.
//
// 2026-08-02: los documentos se ponen al día con lo que la app YA hacía sin declararlo. El tratamiento no cambia;
// lo que cambia es lo que se cuenta, y se vuelve a pedir conformidad porque la marca de última actividad del perfil
// la ve cualquier usuario con sesión —es un "última vez visto"— y no estaba declarada entre los datos que otros ven.
// Se corrige además una contradicción: la política decía que el perfil publica el identificador del canal social
// dos párrafos después de declarar que ya no lo publica.
//
// El RANGO se menciona solo como dato: qué es y quién lo asigna. Lo que hace (frescura del feed, quién puede
// publicar noticias y con qué longitud) es funcionamiento del servicio, no una obligación de transparencia, y
// detallarlo además chocaría con la decisión de producto de que un rango sin permiso de publicación no muestre
// aviso alguno. Pero el dato en sí no puede omitirse: `profiles.tier` vive en un documento que lee cualquier
// usuario autenticado (Firestore no filtra por campo) y su nombre se expone en la ficha del perfil.
// 2026-08-12: se declara el alcance de la cuenta de administración sobre los ajustes de visibilidad. El panel de
// estadísticas pasa a ser UNO para tu perfil y para el de otra persona, y con él la administración ve de sus
// amistades lo mismo que ve de sí misma, incluidas las listas escondidas y las marcas de «rejugable» y «merece otra
// oportunidad»; el tiempo de juego queda fuera de la excepción. El tono del párrafo es a propósito tranquilo: es un
// dato que hay que dar, no una advertencia. Cambia lo que otros ven de ti, así que se vuelve a pedir conformidad.
// 2026-08-22: ACTIVIDAD DE LISTAS. El canal social empieza a publicar, además de las reseñas, un aviso por cada
// vez que un juego entra en una de tus listas —«comenzó», «finalizó», «abandonó», «añadió»— con su fecha y su hora.
// Hay que decirlo y hay que reabrir la aceptación, porque es un dato NUEVO sobre ti que ven tus amistades y de una
// naturaleza distinta a la de una reseña: una reseña la escribes, esto lo registra la app sola al usarla. Se acota
// a lo que el feed necesita —solo la primera entrada a cada lista, nunca las listas que tengas ocultas— y el
// registro interno del que sale (a qué hora mueves cada juego, cuándo cambias una nota) sigue sin salir del
// dispositivo. El ajuste del perfil que filtra estos avisos NO se menciona: solo cambia lo que ves tú, no lo que
// se publica, así que no es una obligación de transparencia sino funcionamiento del servicio.
//
// 2026-08-26: la actividad de listas se acota MÁS —solo el paso de una lista a otra, y de un mismo día un solo
// aviso por juego (el último); dar de alta un juego en la biblioteca ya no publica nada— y los verbos del aviso
// cambian de palabra («comenzó», «finalizó», «abandonó», «añadió»).
// La versión NO sube y no se vuelve a pedir conformidad: lo que se publica de ti es un subconjunto de lo ya
// declarado y aceptado, así que reabrir la aceptación por publicar menos sería ruido. El texto sí se corrige, que
// es la obligación que queda. El cupo de avisos por persona y día tampoco se menciona: recorta lo que TÚ ves en tu
// actividad, no lo que se publica de ti (mismo criterio que el filtro del perfil).
export const LEGAL_VERSION = '2026-08-22';

// Correo de CONTACTO publicado en los documentos. A propósito distinto del de la cuenta de administración de
// `firestore.rules` (`isAdmin`): son la misma persona, pero separar buzones evita mezclar avisos legales y
// solicitudes de usuarios con el correo que da acceso a la base de datos. No unificar sin querer.
export const LEGAL_CONTACT_EMAIL = 'bellancoxv@gmail.com';
/** Responsable del tratamiento, tal y como aparece en los documentos (ver `legalContent`). */
export const LEGAL_CONTROLLER = 'Bellanco';

export const LEGAL_ROUTES = {
  terms: '/legal/aviso',
  privacy: '/legal/privacidad',
  cookies: '/legal/cookies',
} as const;

export type LegalDocId = keyof typeof LEGAL_ROUTES;

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  /**
   * Enlaces externos de la sección. Existen porque cuando un documento remite a la política de un TERCERO
   * (Google, en el inicio de sesión), el lector tiene que poder llegar hasta ella: dejar la URL como texto plano
   * cumple de boquilla y no sirve de nada. Los `href` son constantes del código, nunca datos de usuario.
   */
  links?: Array<{ label: string; href: string }>;
}

export interface LegalDocument {
  id: LegalDocId;
  title: string;
  /**
   * Fecha de última revisión DE ESTE documento. No es lo mismo que `LEGAL_VERSION`, que es la versión que el
   * usuario ACEPTA (condiciones + privacidad) y cuyo cambio reabre la puerta del hub social. Un documento puede
   * aclararse sin que eso obligue a nadie a volver a aceptar nada; separarlas evita el falso dilema entre dejar
   * una fecha desactualizada o molestar a todos los usuarios.
   */
  updated: string;
  intro: string;
  sections: LegalSection[];
}

/** Textos de la puerta de aceptación previa al espacio social. */
export const LEGAL_CONSENT_UI = {
  title: 'Antes de continuar',
  // La actividad se detalla un poco —«reseñas y movimientos de listas»— porque es lo que más gente lee de todo el
  // aparato legal, y lo segundo es nuevo: quien lo acepte tiene que saber que la app va a contar sola cuándo
  // empieza o termina un juego, no solo lo que él escriba.
  body: 'La parte social publica tu nick, tu foto y tu actividad —tus reseñas y los movimientos de tus listas, con su fecha— a las personas con las que tengas amistad. Para activarla necesitamos que aceptes las condiciones de uso y la política de privacidad.',
  checkbox: 'He leído y acepto las condiciones de uso y la política de privacidad',
  termsLink: 'Condiciones de uso',
  privacyLink: 'Política de privacidad',
  pending: 'Guardando...',
  error: 'No se pudo registrar la aceptación. Inténtalo de nuevo.',
} as const;
