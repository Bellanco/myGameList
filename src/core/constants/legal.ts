// L4 — Documentos legales del SERVICIO (no del código: el código va bajo GPL-3.0, ver LICENSE).
//
// El texto vive como datos (mismo patrón que `labels.ts`) para que `LegalScreen` lo pinte sin depender de
// ficheros estáticos: así hereda tema, tipografía y navegación de la app, y entra en el bundle perezoso de la
// pantalla legal. Cada documento es una lista de secciones con párrafos y, opcionalmente, viñetas.
//
// `LEGAL_VERSION` sella la aceptación (`publicConfig.consent.version`): al cambiarla, la puerta del hub social
// vuelve a pedir la conformidad. Súbela SOLO cuando cambie algo sustantivo de los términos o del tratamiento.

export const LEGAL_VERSION = '2026-07';

// Correo de CONTACTO publicado en los documentos. A propósito distinto del de la cuenta de administración de
// `firestore.rules` (`isAdmin`): son la misma persona, pero separar buzones evita mezclar avisos legales y
// solicitudes de usuarios con el correo que da acceso a la base de datos. No unificar sin querer.
export const LEGAL_CONTACT_EMAIL = 'bellancoxv@gmail.com';
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
}

export interface LegalDocument {
  id: LegalDocId;
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}

const TERMS: LegalDocument = {
  id: 'terms',
  title: 'Aviso legal y condiciones de uso',
  updated: LEGAL_VERSION,
  intro:
    'myGameList es un proyecto personal y sin ánimo de lucro para gestionar listas de videojuegos. Al usarlo aceptas estas condiciones.',
  sections: [
    {
      heading: 'Quién presta el servicio',
      paragraphs: [
        `Responsable: ${LEGAL_CONTROLLER}. Contacto: ${LEGAL_CONTACT_EMAIL}.`,
        'El servicio se ofrece de forma gratuita, personal y sin publicidad. No hay contratación ni pagos de ningún tipo.',
      ],
    },
    {
      heading: 'Edad mínima',
      paragraphs: [
        'Para usar la parte social hay que tener al menos 14 años, que es la edad a partir de la cual la ley española (art. 7 LOPDGDD) admite el consentimiento propio para el tratamiento de datos.',
      ],
    },
    {
      heading: 'Tu contenido',
      paragraphs: [
        'Las reseñas, publicaciones, notas y nombres que escribes son tuyos. Para poder mostrarlos a las personas con las que tienes amistad en la app, nos autorizas a almacenarlos y mostrarlos con esa única finalidad, mientras mantengas la cuenta y el contenido publicado.',
        'Tu biblioteca completa y tus reseñas largas se guardan en Gists de TU cuenta de GitHub. Si el Gist es público, cualquiera con el enlace puede leerlo: usa Gists privados si no quieres que sea así.',
      ],
    },
    {
      heading: 'Qué no puedes publicar',
      bullets: [
        'Contenido ilícito, que incite al odio o acose a otras personas.',
        'Datos personales de terceros sin su permiso.',
        'Material protegido por derechos de autor que no puedas compartir.',
        'Suplantación de identidad de otra persona.',
      ],
      paragraphs: [
        `Si ves contenido que incumple estas normas, escríbenos a ${LEGAL_CONTACT_EMAIL} indicando el perfil y la publicación. Revisaremos el aviso y podremos ocultar el contenido o cerrar la cuenta responsable.`,
      ],
    },
    {
      heading: 'Sin garantías y límite de responsabilidad',
      paragraphs: [
        'El servicio se presta «tal cual», sin garantía de disponibilidad, ausencia de errores ni conservación de los datos. Puede dejar de funcionar o interrumpirse en cualquier momento.',
        'Haz copias de seguridad de lo que te importe: exporta tu biblioteca con regularidad. En la medida que permite la ley, no se asume responsabilidad por pérdida de datos, lucro cesante ni daños indirectos derivados del uso de la app.',
      ],
    },
    {
      heading: 'Servicios de terceros',
      paragraphs: [
        'La app se apoya en GitHub (Gists), Google (inicio de sesión, base de datos y analítica) y Cloudflare (alojamiento). Al usarla, también te aplican sus propias condiciones. Las carátulas y marcas de videojuegos pertenecen a sus titulares.',
      ],
    },
    {
      heading: 'Licencia del software',
      paragraphs: [
        'El código fuente se publica bajo GNU GPL-3.0-or-later y puedes usarlo, estudiarlo y modificarlo según esa licencia. Estas condiciones regulan el SERVICIO alojado, no la licencia del código, que no se ve limitada por ellas.',
      ],
    },
    {
      heading: 'Cambios y ley aplicable',
      paragraphs: [
        'Estas condiciones pueden actualizarse; si el cambio es sustancial se te pedirá la conformidad de nuevo al entrar en la parte social. Se aplica la legislación española.',
      ],
    },
  ],
};

const PRIVACY: LegalDocument = {
  id: 'privacy',
  title: 'Política de privacidad',
  updated: LEGAL_VERSION,
  intro:
    'Esta política explica qué datos trata la app, con qué base y cómo ejercer tus derechos. Está escrita sobre lo que el código hace hoy, no sobre lo que podría hacer.',
  sections: [
    {
      heading: 'Responsable',
      paragraphs: [`${LEGAL_CONTROLLER} — ${LEGAL_CONTACT_EMAIL}. Para cualquier asunto de privacidad, escribe a esa dirección.`],
    },
    {
      heading: 'Qué datos se tratan',
      bullets: [
        'En tu dispositivo: tus listas de juegos, reseñas y preferencias (localStorage e IndexedDB), y tu token de GitHub cifrado.',
        'En tu cuenta de GitHub: la biblioteca y el canal social, en Gists que son tuyos.',
        'En Firestore, si activas lo social: tu identificador de usuario, el nick que elijas, tu foto de perfil de Google (puedes quitarla), el identificador de tu Gist social, tus amistades, el rango de tu perfil y tus preferencias de la app.',
        'En Firestore, en un documento privado que solo tú puedes leer: los identificadores de tus Gists y tu token de GitHub cifrado.',
        'Si aceptas la analítica: eventos de uso y errores en Google Analytics, con un identificador aleatorio.',
      ],
      paragraphs: [
        'El perfil que ven otros usuarios contiene tu nick, tu foto (si la dejas), el identificador de tu Gist social y el rango de tu perfil. No contiene tu correo electrónico ni el identificador de tu biblioteca de juegos.',
        'El rango (bronce, plata, oro) es una etiqueta que asigna quien administra el servicio: no la eliges tú, no puedes cambiarla y lo único que hace es variar cada cuánto la app refresca lo que ves de tus amistades.',
      ],
    },
    {
      heading: 'Para qué y con qué base',
      paragraphs: [
        'Los datos se tratan para prestar el servicio que pides: sincronizar tus listas entre dispositivos y, si lo activas, permitirte compartir reseñas con tus amistades. La base jurídica es tu consentimiento, que das al iniciar sesión y al aceptar estas condiciones, y que puedes retirar borrando la cuenta.',
        'La analítica se trata únicamente con tu consentimiento previo y se puede revocar en cualquier momento desde Cuenta.',
      ],
    },
    {
      heading: 'Quién más los ve',
      bullets: [
        'Google (Firebase Authentication, Cloud Firestore y Analytics): alojamiento de la identidad, del perfil social y de la analítica.',
        'GitHub: alojamiento de tus Gists, en tu propia cuenta.',
        'Cloudflare: alojamiento y entrega de la web.',
        'Otros usuarios con sesión iniciada: tu nick, tu foto y tu actividad social, en los términos descritos arriba.',
        'La persona que administra el servicio, que por necesidad técnica tiene acceso de administración a la base de datos.',
      ],
      paragraphs: [
        'Estos proveedores pueden tratar los datos fuera del Espacio Económico Europeo, amparados en las cláusulas contractuales tipo o los marcos de adecuación de sus respectivos programas.',
      ],
    },
    {
      heading: 'Cuánto tiempo',
      paragraphs: [
        'Mientras mantengas la cuenta. Cuando la borras desde la app, se eliminan tu perfil, tus amistades y tu configuración en la nube, y se limpian los datos de ese dispositivo. Tus Gists no se tocan: son tuyos y los borras desde GitHub.',
      ],
    },
    {
      heading: 'Seguridad, y qué NO se garantiza',
      paragraphs: [
        'El token de GitHub se guarda cifrado en tu navegador con una clave no exportable y, para poder recuperarlo en otro dispositivo, también en la nube ofuscado con una clave derivada de tu identificador de usuario. Como ese identificador no es secreto, la protección real de esa copia es la regla que impide a cualquier otra persona leer ese documento; el cifrado es una capa adicional, no una garantía por sí sola.',
        'Por eso la recomendación es usar un token «fine-grained» limitado a Gists y con caducidad. Los accesos a la base de datos están restringidos por reglas verificadas con pruebas automáticas.',
      ],
    },
    {
      heading: 'Tus derechos',
      paragraphs: [
        'Puedes acceder, rectificar, suprimir, oponerte y solicitar la portabilidad de tus datos. La supresión la puedes ejecutar tú desde Cuenta → Borrar mi cuenta; la exportación de tus listas está en Ajustes.',
        `Para el resto, o si algo no funciona, escribe a ${LEGAL_CONTACT_EMAIL}. También puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).`,
      ],
    },
  ],
};

const COOKIES: LegalDocument = {
  id: 'cookies',
  title: 'Política de cookies y almacenamiento local',
  updated: LEGAL_VERSION,
  intro:
    'La app no usa cookies publicitarias ni de seguimiento entre sitios. Sí usa almacenamiento en tu navegador, y esto es todo lo que guarda.',
  sections: [
    {
      heading: 'Necesario (siempre activo)',
      bullets: [
        'localStorage e IndexedDB: tus listas, tus preferencias (tema, escala de nota) y la configuración de sincronización. Sin esto la app no funciona sin conexión.',
        'Token de GitHub cifrado, con la clave guardada en IndexedDB.',
        'Sesión de Google (Firebase Authentication), para no pedirte credenciales en cada visita.',
      ],
      paragraphs: [
        'Este almacenamiento es imprescindible para prestar el servicio que pides, así que no requiere consentimiento. Se elimina al borrar la cuenta o al limpiar los datos del navegador.',
      ],
    },
    {
      heading: 'Analítica (solo si la aceptas)',
      bullets: [
        'Google Analytics (GA4): identificadores en tu dispositivo para medir uso y errores de forma agregada.',
      ],
      paragraphs: [
        'No se carga hasta que aceptas en el aviso. Si rechazas, no se inicializa y no se envía ningún dato. Puedes cambiar de idea en Cuenta → Analítica.',
      ],
    },
    {
      heading: 'Medición sin cookies',
      paragraphs: [
        'El alojamiento (Cloudflare) puede registrar métricas agregadas de tráfico sin guardar nada en tu dispositivo ni identificarte, por lo que no depende del consentimiento.',
      ],
    },
    {
      heading: 'Cómo revocar',
      paragraphs: [
        'Desde Cuenta → Analítica puedes desactivarla en cualquier momento. También puedes borrar los datos del sitio desde la configuración de tu navegador.',
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS: Record<LegalDocId, LegalDocument> = {
  terms: TERMS,
  privacy: PRIVACY,
  cookies: COOKIES,
};

/** Textos de la puerta de aceptación previa al espacio social. */
export const LEGAL_CONSENT_UI = {
  title: 'Antes de continuar',
  body: 'La parte social publica tu nick, tu foto y tu actividad a las personas con las que tengas amistad. Para activarla necesitamos que aceptes las condiciones de uso y la política de privacidad.',
  checkbox: 'He leído y acepto las condiciones de uso y la política de privacidad',
  termsLink: 'Condiciones de uso',
  privacyLink: 'Política de privacidad',
  pending: 'Guardando...',
  error: 'No se pudo registrar la aceptación. Inténtalo de nuevo.',
} as const;
