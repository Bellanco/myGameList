// Texto íntegro de los documentos legales: aviso y condiciones, privacidad y cookies.
//
// VIVE APARTE DE `legal.ts` POR PESO, no por orden. Son ~24 kB de prosa, y mientras estuvieron en el mismo módulo
// que `LEGAL_ROUTES` viajaban en el chunk de ARRANQUE: `App.tsx` y `ConsentBanner` importan las tres rutas para
// enrutar y enlazar, y un módulo entra entero o no entra. Todo el mundo se descargaba las condiciones de uso para
// ver su lista de juegos.
//
// Quien lee esto SÍ los necesita —`LegalScreen` y `AccountHub`—, y los dos son perezosos, así que aquí el texto
// solo se descarga cuando alguien va a leerlo.
//
// La dependencia va en un solo sentido (este módulo importa de `legal.ts`, nunca al revés) para que no se forme
// un ciclo con `constants/routes`, que también toma `LEGAL_ROUTES` de allí.
import { LEGAL_CONTACT_EMAIL, LEGAL_CONTROLLER, LEGAL_VERSION, type LegalDocId, type LegalDocument } from './legal';

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
        'Además de lo que escribes, la parte social publica tu ACTIVIDAD DE LISTAS: cuando mueves un juego de una lista a otra, tus amistades ven que lo has comenzado, finalizado, abandonado o añadido a tu cola, con la fecha y la hora. Dar de alta un juego en tu biblioteca no publica nada. Esto no lo escribes tú, lo registra la app al usarla; se detalla en la política de privacidad y no se publica de las listas que tengas ocultas.',
        'Tu biblioteca completa y tus reseñas largas se guardan en Gists de TU cuenta de GitHub. La app los crea como Gists secretos, y «secreto» en GitHub significa NO LISTADO, no privado: no aparecen en tu perfil de GitHub ni en los buscadores, pero quien conozca el identificador de un Gist puede leerlo. La app solo comparte esos identificadores con las personas con las que tienes amistad.',
        'COMPARTIR UNA RESEÑA CON ENLACE PÚBLICO: puedes publicar una reseña concreta en una página abierta a cualquiera, la tenga o no cuenta en la app. Es una acción tuya y para esa reseña: se publica el juego, tu nota, el TEXTO COMPLETO, las plataformas, los géneros, los puntos fuertes y débiles, tu nick y la fecha; no se publica tu correo, tu identificador, los identificadores de tus Gists, tus horas de juego, tu foto ni el resto de tu biblioteca. El enlace caduca solo —según tu rango, entre 7 y 90 días— y puedes retirarlo antes desde Ajustes. Retirarlo lo deja inaccesible, pero NO recoge las copias que ya se hayan compartido ni las previsualizaciones que otras plataformas hayan guardado.',
        'La copia que se publica es una FOTO del momento: si editas la reseña después, el enlace sigue mostrando lo que se publicó hasta que vuelvas a compartirla. Quien administra el servicio puede retirar un enlace y, si hay abuso, impedirte crear otros.',
        'MEJORA DE PRIVACIDAD, y la única excepción a que la app no toque tus Gists: las versiones anteriores creaban tu canal social como Gist PÚBLICO, con lo que aparecía listado en tu perfil de GitHub y en los buscadores. Al entrar en la parte social, la app copia ese canal a un Gist no listado y RETIRA el antiguo, que es lo único que quita de circulación lo ya publicado. Solo se borra ese canal antiguo, nunca tu biblioteca, y solo después de comprobar que la copia conserva tu contenido; si la comprobación falla, no se borra nada y se te avisa.',
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
        'En Firestore, si activas lo social: tu identificador de usuario, el nick que elijas —y si no eliges ninguno, el nombre de tu cuenta de Google—, tu foto de perfil de Google (puedes quitarla), tus amistades, el rango de tu perfil, la fecha de alta, la marca de tu última actividad y tus preferencias de la app. El identificador de tu Gist social ya NO se publica ahí: vive en el documento privado que solo tú lees, y denormalizado en tus documentos de amistad.',
        'En Firestore, en un documento privado que solo tú puedes leer: los identificadores de tus Gists y tu token de GitHub cifrado.',
        'En Cloudflare, si compartes una reseña con enlace público: una copia de esa reseña (juego, nota, texto, metadatos, tu nick y las fechas) mientras el enlace siga vivo. Caduca sola y se borra al retirarla o al eliminar tu cuenta. No lleva tu correo, tu identificador ni los de tus Gists.',
        'Si aceptas la analítica: eventos de uso y errores en Google Analytics, con un identificador aleatorio.',
      ],
      paragraphs: [
        'El perfil que ven otros usuarios contiene tu nick —o, si nunca pusiste uno, el nombre de tu cuenta de Google—, tu foto (si la dejas), el rango de tu perfil —una etiqueta que asigna quien administra el servicio, no tú— y la marca de tu última actividad, con la que la app ordena el directorio y decide de quién merece la pena releer el canal. No contiene tu correo electrónico, ni el identificador de tu canal social, ni el de tu biblioteca de juegos.',
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
        'Otros usuarios con sesión iniciada: tu nick, tu foto, tu rango, cuándo estuviste activo por última vez y tu actividad social, en los términos descritos arriba.',
        'Cualquier persona que conozca el identificador de tu Gist social. Ese Gist ya NO es público: la app lo crea (y migra los antiguos) como Gist no listado, así que no aparece en tu perfil de GitHub ni en los buscadores. Pero «no listado» no es «privado»: quien tenga el identificador puede leerlo sin necesidad de sesión en esta app. La app solo lo comparte con tus amistades.',
        'CUALQUIERA, si compartes una reseña con enlace público: esa reseña concreta queda accesible en internet para quien tenga el enlace, sin necesidad de cuenta, hasta que caduque o la retires. Es siempre una acción tuya, reseña a reseña.',
        'La persona que administra el servicio, que por necesidad técnica tiene acceso de administración a la base de datos: puede consultar los perfiles, asignar el rango, desactivar la parte social de un perfil y eliminarlo. No puede leer el documento privado donde se guardan tu token cifrado y los identificadores de tus Gists, que solo lee su dueño.',
      ],
      paragraphs: [
        'Tus ajustes de visibilidad —esconder una lista, la marca de «rejugable» o la de «merece otra oportunidad»— valen para todas tus amistades. Esconder una lista esconde también su actividad: de una lista oculta no se publica ningún aviso de entrada. La cuenta desde la que se administra el servicio es la única excepción, porque el mantenimiento y el soporte se hacen desde ella: en los perfiles de sus amistades ve las listas completas. Tus horas de juego quedan fuera de esa excepción: si eliges ocultarlas, no las ve nadie.',
        'Conviene entender qué hay en tu canal social y qué no: contiene tu nick, tus preferencias de visibilidad y, por cada reseña, el nombre del juego, la nota y un fragmento de hasta 160 caracteres del texto. Lleva además tu actividad de listas: por cada juego, en qué lista entró y la fecha y la hora en que lo hizo, para que tus amistades vean en su actividad que has comenzado, finalizado, abandonado o añadido algo. Tu biblioteca completa, tus reseñas enteras y tus horas de juego NO están ahí: viven en otro Gist que la app crea como secreto y cuyo identificador solo se comparte con tus amistades.',
        'De esa actividad de listas se publica solo el paso de una lista a OTRA: la lista por la que el juego entró en tu biblioteca no se publica, tampoco la de las listas que tengas ocultas, y de cada lista solo su PRIMERA entrada. De un mismo día queda además un único aviso por juego, el último: si lo empiezas y lo abandonas esa tarde, se publica que lo abandonaste y no que lo empezaste. El registro interno del que sale —a qué hora mueves cada juego, cuándo cambias una nota— no se publica ni sale de tu dispositivo, ni lo ve la cuenta desde la que se administra el servicio.',
        'Ten en cuenta que «secreto» en GitHub no significa privado, sino no listado: quien tenga el identificador de un Gist puede leerlo aunque no aparezca en tu perfil de GitHub ni en los buscadores. Por eso ni el identificador de tu biblioteca ni el de tu canal social se publican ya en tu perfil: solo se comparten con las personas con las que tienes amistad.',
        'Estos proveedores pueden tratar los datos fuera del Espacio Económico Europeo, amparados en las cláusulas contractuales tipo o los marcos de adecuación de sus respectivos programas.',
      ],
    },
    {
      heading: 'Cuánto tiempo',
      paragraphs: [
        'Mientras mantengas la cuenta. Cuando la borras desde la app, se eliminan tu perfil, tus amistades, tu configuración en la nube y los enlaces públicos de reseñas que tuvieras activos, y se limpian los datos de ese dispositivo. Tus Gists no se tocan: son tuyos y los borras desde GitHub. La única excepción es la retirada del canal social antiguo descrita en las condiciones de uso, que existe para dejar de exponerlo públicamente.',
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
  // 2026-08-06: se declara lo que ocurre al iniciar sesión con Google (carga un script suyo y Google guarda
  // cookies propias en sus dominios), que no estaba dicho, y se precisa la entradilla: antes afirmaba que el
  // almacenamiento local era "todo lo que guarda", sin distinguir lo que hace un tercero. No se sube
  // `LEGAL_VERSION`: no cambia el tratamiento ni los términos que el usuario aceptó, así que no procede
  // reabrir la puerta de aceptación a todo el mundo por una aclaración.
  //
  // 2026-08-10: App Check. Se nombran los dominios de reCAPTCHA (www.google.com, www.gstatic.com) y para qué
  // sirve. Sigue siendo una PRECISIÓN y no un tratamiento nuevo: el párrafo ya declaraba scripts de Google y la
  // cookie «_GRECAPTCHA» al iniciar sesión, y reCAPTCHA solo se carga con sesión iniciada —nunca en una visita
  // anónima—, así que la promesa de la entradilla sigue siendo cierta palabra por palabra. Por eso tampoco se
  // sube `LEGAL_VERSION`; si prefieres reabrir la aceptación, es súbirla y ya.
  updated: '2026-08-10',
  intro:
    'La app no usa cookies publicitarias ni de seguimiento entre sitios. Si solo abres la app y usas tus listas —sin sincronizar, sin iniciar sesión y sin aceptar la analítica—, no contacta con ningún servidor ajeno ni guarda cookies: todo lo que necesita vive en tu navegador. Abajo está el detalle completo, incluido lo que ocurre cuando activas cada cosa.',
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
      heading: 'Al iniciar sesión con Google (solo si lo haces)',
      paragraphs: [
        'El inicio de sesión lo gestiona Google, no nosotros. Cuando lo usas —para el espacio social o para recuperar tu Gist desde tu cuenta—, tu navegador carga scripts de Google (apis.google.com para la identificación, y www.google.com y www.gstatic.com para reCAPTCHA, que comprueba que las peticiones vienen de la app de verdad y no de un programa que suplanta a la app). Google puede guardar cookies propias en sus dominios para ese control de abuso y para mantener tu sesión. Una de ellas es «_GRECAPTCHA».',
        'Esas cookies son de Google: no las ponemos, no las leemos y no podemos dar una lista cerrada, porque quién las pone y cuáles son lo decide Google. Son necesarias para el servicio de autenticación que estás pidiendo, así que no dependen del consentimiento de analítica; lo que sí depende de ti es usar o no ese botón. Si no inicias sesión, nada de esto ocurre.',
      ],
      links: [
        { label: 'Privacidad de Google', href: 'https://policies.google.com/privacy' },
        { label: 'Cómo usa Google las cookies', href: 'https://policies.google.com/technologies/cookies' },
      ],
    },
    {
      heading: 'Sincronización con GitHub (solo si la configuras)',
      paragraphs: [
        'Si enlazas un Gist, la app habla con la API de GitHub (api.github.com) para leer y escribir tus listas. Es una petición a un servidor ajeno, necesaria para la sincronización que has pedido, y no guarda cookies en tu navegador: la autorización viaja en la propia petición con tu token.',
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
