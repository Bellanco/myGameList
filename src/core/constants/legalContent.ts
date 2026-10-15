// Texto íntegro de los documentos legales: aviso y condiciones, privacidad y cookies.
//
// VIVE APARTE DE `legal.ts` POR PESO, no por orden. Son ~20 kB de prosa, y mientras estuvieron en el mismo módulo
// que `LEGAL_ROUTES` viajaban en el chunk de ARRANQUE: `App.tsx` y `ConsentBanner` importan las tres rutas para
// enrutar y enlazar, y un módulo entra entero o no entra. Todo el mundo se descargaba las condiciones de uso para
// ver su lista de juegos.
//
// Quien lee esto SÍ los necesita —`LegalScreen` y `AccountHub`—, y los dos son perezosos, así que aquí el texto
// solo se descarga cuando alguien va a leerlo.
//
// La dependencia va en un solo sentido (este módulo importa de `legal.ts`, nunca al revés) para que no se forme
// un ciclo con `constants/routes`, que también toma `LEGAL_ROUTES` de allí.
import { LEGAL_CONTACT_EMAIL, LEGAL_CONTROLLER, type LegalDocId, type LegalDocument } from './legal';

// LENGUAJE CLARO (2026-10-12, a petición del usuario). Los documentos se reescribieron hablando de tú, con frases
// cortas y sin contar cómo funciona la app por dentro (ficheros, cachés, seudónimos, registros internos). Sustituye a
// la redacción formal del 2026-10-05 («el Usuario», «el Responsable»), que se leía como un contrato.
//
// Dicen LO MISMO que antes: ningún tratamiento, dato ni destinatario entra o sale, así que `LEGAL_VERSION` no sube por
// esto (ver `legal.ts`). Al reescribir, la regla fue quitar el CÓMO y dejar siempre el QUÉ y el QUIÉN: qué se guarda,
// dónde, quién lo ve, cuánto tiempo y qué puedes hacer. Todo acceso de otra persona a tus datos sigue dicho, en
// particular lo que ve la cuenta de administración y que un gist secreto no es privado.
//
// Lo que se quitó en 2026-10-05 por caducar solo sigue fuera, y conviene no reintroducirlo:
//   · cifras de producto que cambian solas: la caducidad de un enlace, el largo del fragmento de una reseña, cuántos
//     puestos dan trofeo, las fechas del aviso del resumen del año. Esas se dicen en el momento, en la propia app;
//   · rutas de menú: se dice «desde los ajustes»;
//   · el NOMBRE de los rangos: se declara «una categoría de perfil de uso interno» (decisión del 05-10-2026).
// Lo que NO se generaliza, porque la ley o una licencia lo exigen tal cual: la identidad del Responsable, los
// proveedores por su nombre, la edad mínima, las atribuciones de iconos y fuentes y la frase de TMDB en inglés.

const TERMS: LegalDocument = {
  id: 'terms',
  title: 'Aviso legal y condiciones de uso',
  // Fecha PROPIA del documento y no `LEGAL_VERSION`, que es lo que `legal.ts` distingue: un documento puede aclararse
  // sin que nadie tenga que volver a aceptar nada. Historia de los cambios con efecto: ver `LEGAL_VERSION`.
  // 2026-10-12: lenguaje claro (ver la cabecera), sin cambio de contenido; y los «me gusta» (`legal.ts`).
  updated: '2026-10-12',
  intro:
    'myGameList es un proyecto personal y gratuito para llevar tus listas de videojuegos. Si lo usas, aceptas estas condiciones.',
  sections: [
    {
      heading: 'Quién está detrás',
      paragraphs: [
        `El servicio lo gestiona ${LEGAL_CONTROLLER}. Puedes escribir a ${LEGAL_CONTACT_EMAIL}.`,
        'Es gratis y no tiene publicidad. Usarlo no supone ningún contrato ni pago.',
      ],
    },
    {
      heading: 'Edad mínima',
      paragraphs: [
        'Para usar el espacio social necesitas tener al menos 14 años. Es la edad a partir de la cual la ley española te permite dar tu propio consentimiento para el uso de tus datos (artículo 7 de la Ley Orgánica 3/2018, LOPDGDD).',
      ],
    },
    {
      heading: 'Lo que publicas',
      paragraphs: [
        'Lo que escribes (reseñas, publicaciones, notas y nombres) es tuyo. Nos autorizas a guardarlo y a enseñárselo a tus amigos dentro de la app, solo para eso y mientras mantengas tu cuenta.',
        'Si activas el espacio social, la app también comparte con tus amigos cosas que no escribes tú: cuándo añades, empiezas, terminas o abandonas un juego, tus logros y los «me gusta» que das. La política de privacidad explica qué ve cada uno.',
        'Tu biblioteca y tus reseñas completas se guardan en tu cuenta de GitHub, en gists secretos. Un gist secreto no aparece en tu perfil de GitHub ni en los buscadores, pero no es privado: quien tenga su enlace puede verlo. La app solo se lo da a tus amigos.',
        'Puedes compartir una reseña con un enlace público, que puede abrir cualquiera, tenga cuenta o no. El enlace muestra el juego, la nota, la reseña completa, las plataformas, los géneros, los puntos fuertes y débiles, tu nombre de perfil y la fecha. No muestra tu correo, tu foto, tus horas de juego ni el resto de tu biblioteca.',
        'Al cerrar el año también puedes compartir tu resumen anual con un enlace público. Muestra los juegos que terminaste ese año, con su nota, plataformas, géneros, puntos fuertes y débiles y el mes en que los acabaste; la comparación con el año anterior; tu resultado en los premios de ese año, y tu nombre de perfil. No muestra el texto de tus reseñas, tus horas de juego, tu foto ni el resto de tu biblioteca. Al crearlo, tus amigos ven un aviso en su actividad.',
        'Los enlaces son una copia de lo que compartes en ese momento: si después cambias algo, el enlace no cambia hasta que lo vuelvas a compartir. Caducan solos (la app te dice cuándo al crearlos) y puedes retirarlos antes desde los ajustes. Retirar un enlace no borra las copias que otras personas o webs hayan guardado. Podemos retirar cualquier enlace y, si se abusa, impedir que se creen más.',
        'Solo hay un caso en el que la app toca tus gists. Las versiones antiguas creaban tu canal social como gist público. Al entrar en el espacio social, la app lo copia a un gist secreto y borra el antiguo, para que deje de estar a la vista, después de comprobar que la copia está completa. Si algo falla, no borra nada y te avisa. Tu biblioteca no se toca nunca.',
      ],
    },
    {
      heading: 'Lo que no está permitido',
      bullets: [
        'Contenido ilegal, que incite al odio o que acose a otras personas.',
        'Datos personales de otras personas sin su permiso.',
        'Material protegido por derechos de autor si no tienes permiso para difundirlo.',
        'Hacerte pasar por otra persona.',
      ],
      paragraphs: [
        `Si ves algo así, escribe a ${LEGAL_CONTACT_EMAIL} indicando el perfil y la publicación. Lo revisaremos y podremos ocultar el contenido o cerrar la cuenta.`,
      ],
    },
    {
      heading: 'Sin garantías',
      paragraphs: [
        'El servicio se ofrece tal cual. Puede fallar, perder datos o dejar de existir en cualquier momento.',
        'Te recomendamos exportar tu biblioteca de vez en cuando. En lo que permita la ley, no respondemos de la pérdida de datos ni de daños indirectos por usar la app.',
      ],
    },
    {
      heading: 'Servicios de terceros',
      paragraphs: [
        'La app usa servicios de otras empresas, cuyas condiciones también se te aplican: GitHub (gists), Google (inicio de sesión, base de datos y analítica), Cloudflare (alojamiento), IGDB/Twitch (datos de videojuegos, solo si activas las carátulas) y TMDB (pósters de series y películas y fotos de intérpretes en los premios). Los datos de videojuegos proceden de IGDB.com. This product uses the TMDB API but is not endorsed or certified by TMDB. Las carátulas, pósters, fotos y marcas pertenecen a sus dueños y solo se muestran para identificar cada obra.',
      ],
    },
    {
      heading: 'Propiedad intelectual y licencias',
      paragraphs: [
        'El código de la app se publica con la licencia GNU GPL-3.0-or-later, que permite usarlo, estudiarlo y modificarlo en sus términos. Estas condiciones regulan el servicio, no limitan lo que esa licencia permite hacer con el código.',
        /* ATRIBUCIÓN OBLIGATORIA, no un agradecimiento. Los iconos de Font Awesome Free van bajo CC BY 4.0, y
           esa licencia EXIGE citar la fuente en un sitio visible para quien usa la obra: por eso esta frase
           está en el aviso legal y no en un comentario del código. Los sprites lo dan por hecho y apuntan aquí
           (ver `view/components/IconSprite`). Al añadir un icono de una procedencia nueva, esta lista es la que
           hay que revisar. */
        'Algunos elementos de la interfaz son de terceros y mantienen su propia licencia. Los iconos proceden de Font Awesome Free (© Fonticons, Inc.), publicados bajo la licencia CC BY 4.0, de Material Symbols (© Google, Apache 2.0) y de Carbon (© IBM, Apache 2.0); los de las medallas de logros y el de «me gusta», de Lucide (© Lucide Contributors, ISC). Las fuentes tipográficas se sirven desde el propio dominio de la app bajo la SIL Open Font License 1.1, cuyo aviso acompaña a los ficheros.',
      ],
    },
    {
      heading: 'Cambios y ley aplicable',
      paragraphs: [
        'Podemos cambiar estas condiciones. Si el cambio es importante, te pediremos que las vuelvas a aceptar al entrar en el espacio social. Se rigen por la ley española.',
      ],
    },
  ],
};

const PRIVACY: LegalDocument = {
  id: 'privacy',
  title: 'Política de privacidad',
  // Fecha PROPIA del documento y no `LEGAL_VERSION`: ver la nota de `TERMS`. Qué cambios han reabierto la aceptación
  // y cuáles no, con su porqué, está junto a `LEGAL_VERSION` en `legal.ts`.
  // 2026-10-12: lenguaje claro (ver la cabecera), sin cambio de contenido; y los «me gusta» (`legal.ts`).
  // 2026-10-15: plazos de conservación de las cuentas sin uso y el correo en el panel (ver `legal.ts`).
  updated: '2026-10-15',
  intro:
    'Aquí te contamos qué datos tuyos usa myGameList, para qué, quién los ve y qué puedes hacer con ellos, según el Reglamento General de Protección de Datos (RGPD) y la ley española (LOPDGDD).',
  sections: [
    {
      heading: 'Responsable',
      paragraphs: [
        `El responsable de tus datos es ${LEGAL_CONTROLLER}. Para cualquier cosa sobre tu privacidad, escribe a ${LEGAL_CONTACT_EMAIL}.`,
      ],
    },
    {
      heading: 'Qué datos guardamos',
      bullets: [
        'En tu dispositivo: tus listas, reseñas y preferencias, y tu token de GitHub cifrado.',
        'En tu cuenta de GitHub: tu biblioteca y tu canal social, en gists que son tuyos.',
        'En Google (Firebase), si activas el espacio social: tu identificador de usuario; tu nombre de perfil (o el de tu cuenta de Google, si no eliges otro); tu foto de Google, salvo que la quites; tus amistades; una categoría de perfil de uso interno que asigna el administrador; la fecha de alta; cuándo usaste la app por última vez; tus preferencias, y tus logros con su fecha.',
        'En Google (Firebase), en una parte que solo puedes leer tú: los identificadores de tus gists y tu token de GitHub cifrado.',
        'En Cloudflare, si compartes una reseña o tu resumen anual con un enlace público: una copia de lo que compartes, mientras el enlace siga activo. Se borra cuando caduca, cuando lo retiras o cuando borras tu cuenta. No incluye tu correo ni tus identificadores.',
        'En Google (Firebase), si votas en los premios: tu papeleta, con tu voto en cada categoría, el nombre que eliges para la clasificación, el nombre de tu cuenta de Google, la fecha y cuántas veces la corriges. Solo la podéis ver tú y el administrador. Al publicarse la edición, la papeleta se retira y se guarda una lista de quién participó (tu identificador de usuario), que solo ve el administrador y se borra cuando empieza la edición siguiente o cuando borras tu cuenta.',
        'Si votas en los premios sin tener perfil social, se crea un perfil mínimo con tu nombre, tu foto de Google y un seudónimo. No aparece en el directorio ni publica nada: solo sirve para unir tu puesto en la clasificación con tu perfil cuando lo completes.',
        'Si quedas en un puesto premiado, tu perfil recibe un trofeo (edición, premio, puesto y fecha). Lo concede el administrador y no puedes quitarlo tú.',
        'Si aceptas la analítica: datos de uso y errores en Google Analytics, con un identificador aleatorio.',
      ],
    },
    {
      heading: 'Quién ve qué',
      bullets: [
        'Cualquier persona con sesión en la app ve tu nombre de perfil, tu foto (si la muestras), tu categoría de perfil, cuándo usaste la app por última vez y tus logros. Nunca tu correo ni tus identificadores.',
        'Tus amigos ven además tu actividad: tus reseñas, tus publicaciones, tus listas y tus horas de juego (salvo lo que ocultes en tu perfil), tu resumen anual (con el mes en que terminaste cada juego, nunca el día) y avisos de cuándo añades, empiezas, terminas o abandonas un juego. Cada aviso se ve durante treinta días.',
        'Los «me gusta» que das los ven, con tu nombre de perfil, tus amigos que también pueden ver esa reseña o publicación. Si quitas un «me gusta» o dejas de ser amigo de su autor, desaparece.',
        'Quien tenga el enlace de uno de tus gists puede verlo, porque un gist secreto no es privado. Por eso esos enlaces no aparecen en tu perfil, y la app solo se los da a tus amigos.',
        'Cualquiera que tenga un enlace público que hayas creado (de una reseña o de tu resumen anual), hasta que caduque o lo retires.',
        'En los premios, el archivo de cada edición publicada es público: muestra el nombre que elegiste para la clasificación, tus puntos y tu puesto, pero no tu correo, tu foto ni tu identificador. Quienes votaron en la misma edición ven también tus votos, con ese mismo nombre, hasta que empiece la edición siguiente o hasta que el administrador los borre. Después, de tu papeleta solo queda la clasificación. Si borras tu cuenta, tu fila desaparece de la clasificación y de los votos.',
        'El administrador puede consultar los perfiles y el correo de tu cuenta de Google, asignar tu categoría, desactivar o borrar un espacio social y borrar las cuentas que llevan tiempo sin usarse. No puede leer tu token ni los identificadores de tus gists.',
      ],
      paragraphs: [
        'Si ocultas una lista, tus amigos no la ven ni reciben avisos de ella. Tus logros sí cuentan todos tus juegos, también los de listas ocultas, pero solo muestran el nivel, nunca qué juegos.',
        'Hay una excepción, para poder mantener el servicio y dar soporte: la cuenta de administración, si es amiga tuya, ve tus listas completas, también las ocultas y sus avisos, y el día en que terminaste cada juego. Tus horas de juego, si las ocultas, no las ve nadie.',
      ],
    },
    {
      heading: 'Para qué y con qué base legal',
      paragraphs: [
        'Usamos tus datos para darte el servicio que pides: guardar tus listas, sincronizarlas entre tus dispositivos y, si lo activas, compartir con tus amigos. La base legal es tu consentimiento (artículo 6.1.a del RGPD), que das al iniciar sesión y al aceptar estas condiciones. Puedes retirarlo cuando quieras borrando tu cuenta.',
        'La analítica solo se activa si la aceptas, y puedes desactivarla en cualquier momento desde los ajustes.',
      ],
    },
    {
      heading: 'Empresas que tratan tus datos',
      bullets: [
        'Google (Firebase Authentication, Cloud Firestore y Google Analytics): inicio de sesión, perfil social y analítica.',
        'GitHub: guarda tus gists, en tu propia cuenta.',
        'Cloudflare: aloja y sirve la web.',
        'IGDB (Twitch), solo si activas las carátulas: recibe el título del juego para buscar su portada. La consulta la hace nuestro servidor, así que IGDB no recibe tu IP ni nada que te identifique.',
        'TMDB, para los premios: proporciona pósters y fotos de intérpretes. No recibe ningún dato tuyo.',
      ],
      paragraphs: [
        'Algunas de estas empresas pueden tratar datos fuera del Espacio Económico Europeo, con las garantías que prevé el RGPD (decisiones de adecuación o cláusulas contractuales tipo, artículos 45 y 46).',
      ],
    },
    {
      heading: 'Cuánto tiempo',
      paragraphs: [
        'Mientras mantengas tu cuenta. Si la borras desde la app, se elimina todo lo que guardamos de ti: tu perfil, tus amistades, tu configuración en la nube, tus enlaces públicos, tu rastro en los premios (tu papeleta, tu fila en la clasificación y en los votos de cada edición, y tu identificador en sus registros), lo que el registro de administración apuntó sobre ti y tu cuenta de Google en nuestro servicio de inicio de sesión, y se borran los datos de ese dispositivo. Tus gists no se tocan, porque son tuyos: puedes borrarlos en GitHub.',
        'Si dejas de usar la app, borramos tu cuenta de la misma forma: a los dos meses sin abrirla con la sesión iniciada si no llegaste a crear tu espacio social, y al año si lo tienes o has votado en los premios. Tus listas siguen en tus gists y en tus dispositivos; si vuelves, puedes empezar de nuevo con la misma cuenta de Google.',
      ],
    },
    {
      heading: 'Seguridad',
      paragraphs: [
        'Tu token de GitHub se guarda cifrado en tu navegador. Para que puedas recuperarlo en otro dispositivo, también se guarda en la nube, cifrado con una clave que depende de tu identificador de usuario. Como ese identificador no es secreto, lo que de verdad protege esa copia son las reglas que impiden a otras personas leerla.',
        'Por eso te recomendamos usar un token «fine-grained», limitado a gists y con fecha de caducidad. El acceso a la base de datos está limitado por reglas que se comprueban con pruebas automáticas.',
      ],
    },
    {
      heading: 'Tus derechos',
      paragraphs: [
        'Puedes pedir el acceso, la rectificación, la supresión, la limitación y la portabilidad de tus datos, y oponerte a su uso. Puedes borrar tu cuenta desde la app y exportar tus listas desde los ajustes.',
        `Para todo lo demás, escribe a ${LEGAL_CONTACT_EMAIL}. Si no estás conforme con la respuesta, puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).`,
      ],
    },
  ],
};

const COOKIES: LegalDocument = {
  id: 'cookies',
  title: 'Política de cookies y almacenamiento local',
  // Fecha PROPIA del documento: ver la nota de `TERMS`. Ningún cambio de este documento ha reabierto la aceptación:
  // las cookies de Google al iniciar sesión (2026-08-06) y los dominios de reCAPTCHA (2026-08-10) fueron precisiones
  // de lo que ya se declaraba, y reCAPTCHA solo se carga con sesión iniciada, nunca en una visita anónima.
  // 2026-10-12: lenguaje claro (ver la cabecera), sin cambio de contenido.
  updated: '2026-10-12',
  intro:
    'myGameList no usa cookies de publicidad ni de seguimiento entre webs. Si solo la usas para tus listas (sin sincronizar, sin iniciar sesión y sin aceptar la analítica), no se conecta con servidores de terceros ni guarda cookies: todo se queda en tu navegador. Aquí tienes lo que se guarda y con quién se conecta al activar cada función.',
  sections: [
    {
      heading: 'Lo imprescindible',
      bullets: [
        'localStorage e IndexedDB: tus listas, tus preferencias (como el tema o la escala de puntuación) y la configuración de sincronización. Sin esto, la app no funcionaría sin conexión.',
        'Tu token de GitHub cifrado, con su clave guardada en IndexedDB.',
        'Tu sesión de Google (Firebase Authentication), para no pedirte que entres cada vez.',
      ],
      paragraphs: [
        'Esto es estrictamente necesario para darte el servicio que pides, así que no necesita tu consentimiento (artículo 22.2 de la Ley 34/2002, LSSI). Se borra al eliminar tu cuenta o al borrar los datos del navegador.',
      ],
    },
    {
      heading: 'Inicio de sesión con Google',
      paragraphs: [
        'El inicio de sesión lo gestiona Google. Cuando lo usas, tu navegador carga scripts de Google: los de identificación (apis.google.com) y los de reCAPTCHA (www.google.com y www.gstatic.com), que comprueban que las peticiones vienen de la app y no de un programa que se haga pasar por ella. Google puede guardar sus propias cookies en sus dominios para prevenir abusos y mantener la sesión, entre ellas «_GRECAPTCHA».',
        'Esas cookies son de Google, que decide cuáles pone. Nosotros no las ponemos ni las leemos, y por eso no podemos darte una lista cerrada. Son necesarias para el inicio de sesión que pides, así que no dependen de que aceptes la analítica. Si no inicias sesión, no se produce ninguna de estas conexiones.',
      ],
      links: [
        { label: 'Privacidad de Google', href: 'https://policies.google.com/privacy' },
        { label: 'Cómo usa Google las cookies', href: 'https://policies.google.com/technologies/cookies' },
      ],
    },
    {
      heading: 'Sincronización con GitHub',
      paragraphs: [
        'Si vinculas un gist, la app se conecta con GitHub (api.github.com) para leer y guardar tus listas. Es necesario para sincronizar y no guarda cookies en tu navegador: tu token va en cada petición.',
      ],
    },
    {
      heading: 'Carátulas de los juegos',
      paragraphs: [
        'Las carátulas vienen desactivadas. Mientras no las actives en los ajustes, no se pide ninguna imagen.',
        'Si las activas, nuestro servidor busca en IGDB la portada de cada juego usando solo su título, y tu navegador pide las imágenes a nuestro propio dominio. Así, IGDB no recibe tu IP y tu navegador no se conecta con nadie más. Nunca se envían tu nota, tu reseña, tus horas ni quién eres. Las imágenes se guardan en tu navegador para verlas sin conexión. Puedes desactivarlas cuando quieras desde el mismo sitio.',
      ],
    },
    {
      heading: 'Analítica',
      bullets: [
        'Google Analytics (GA4): identificadores guardados en tu dispositivo para medir el uso y los errores de forma agregada.',
      ],
      paragraphs: [
        'La analítica no se carga hasta que la aceptas en el aviso. Si la rechazas, no se activa ni se envía nada. Puedes cambiar de opinión cuando quieras desde los ajustes.',
      ],
    },
    {
      heading: 'Medición sin cookies',
      paragraphs: [
        'Cloudflare, que aloja la web, puede contar visitas de forma agregada sin guardar nada en tu dispositivo ni identificarte, así que no necesita tu consentimiento.',
      ],
    },
    {
      heading: 'Cómo retirar tu consentimiento',
      paragraphs: [
        'Puedes desactivar la analítica en cualquier momento desde los ajustes, y borrar los datos de la web desde la configuración de tu navegador.',
      ],
    },
  ],
};

/**
 * CRÉDITOS: de dónde salen los datos y las imágenes que no son de quien usa la app. No es un documento que se
 * acepte —no cuenta para `LEGAL_VERSION`—, pero vive con los demás porque es donde se busca, y porque TMDB exige su
 * logo y su frase, EXACTA y en inglés, en una sección «Acerca de» o «Créditos» para poder usar su API.
 */
const CREDITS: LegalDocument = {
  id: 'credits',
  title: 'Créditos',
  updated: '2026-10-12',
  intro: 'De dónde salen los datos y las imágenes de terceros que muestra la app.',
  sections: [
    {
      heading: 'Videojuegos',
      paragraphs: ['Los datos y las carátulas de videojuegos proceden de IGDB.com.'],
    },
    {
      heading: 'Series, películas e intérpretes',
      logo: { src: '/credits/tmdb.svg', alt: 'TMDB', width: 96, height: 12 },
      paragraphs: [
        'Los pósters de series y películas y las fotos de intérpretes de los premios proceden de TMDB.',
        'This product uses the TMDB API but is not endorsed or certified by TMDB.',
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS: Record<LegalDocId, LegalDocument> = {
  terms: TERMS,
  privacy: PRIVACY,
  cookies: COOKIES,
  credits: CREDITS,
};
