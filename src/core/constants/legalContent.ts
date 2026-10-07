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
import { LEGAL_CONTACT_EMAIL, LEGAL_CONTROLLER, type LegalDocId, type LegalDocument } from './legal';

// REDACCIÓN FORMAL Y DURADERA (2026-10-05). Los cuatro documentos se reescribieron en el registro habitual de
// estos textos —tercera persona: «el Usuario», «el Responsable», «la Aplicación»— y con las referencias normativas
// que les corresponden (RGPD, LOPDGDD, LSSI). Dicen LO MISMO que antes: ningún tratamiento, dato ni destinatario
// entra o sale, y por eso `LEGAL_VERSION` no sube (ver `legal.ts`).
//
// Lo que sí se quitó es lo que obligaba a reescribirlos cada poco, y conviene no reintroducirlo:
//   · cifras de producto que cambian solas: la caducidad de un enlace («entre 7 y 90 días»), el largo del fragmento
//     de una reseña, cuántos puestos dan trofeo, las fechas y la duración del aviso del resumen del año. Lo que el
//     Usuario necesita saber de esas cifras se le dice en el momento (el plazo del enlace, en el diálogo de compartir);
//   · rutas de menú («Cuenta → Analítica»): la pantalla Cuenta ya no existía y el texto seguía mandando a ella. Ahora
//     se dice «desde los ajustes de la Aplicación»;
//   · el NOMBRE de los rangos. Se declara el dato —es un campo del perfil que cualquiera con sesión puede leer— como
//     «categoría de perfil de uso interno», sin nombrarlos ni decir qué dan (decisión del 05-10-2026: de cara al
//     usuario los rangos no se nombran).
// Lo que NO se generaliza, porque la ley o una licencia lo exigen tal cual: la identidad del Responsable, los
// proveedores por su nombre, la edad mínima, las atribuciones de iconos y fuentes y la frase de TMDB en inglés.

const TERMS: LegalDocument = {
  id: 'terms',
  title: 'Aviso legal y condiciones de uso',
  // Fecha PROPIA del documento y no `LEGAL_VERSION`, que es lo que `legal.ts` distingue: al declarar las
  // carátulas (2026-09-15) se añade un tratamiento NUEVO pero OPT-IN y apagado por defecto, que no envía ningún
  // dato personal —solo el título del juego, y desde el servidor—. Revisar el texto sí; obligar a todo el mundo
  // a volver a aceptar por algo que no ha empezado a ocurrir todavía, no.
  // TMDB (2026-09-29): un proveedor más para los premios que no recibe ningún dato de quien usa la app; se
  // revisa el texto sin volver a pedir la aceptación, por lo mismo que las carátulas.
  // 2026-10-05: redacción formal (ver la cabecera de arriba), sin cambio de contenido.
  // 2026-10-07: la actividad de las listas ocultas se publica aparte para la cuenta de administración (`legal.ts`).
  updated: '2026-10-07',
  intro:
    'myGameList (en adelante, «la Aplicación») es un proyecto personal, gratuito y sin ánimo de lucro destinado a la gestión de listas de videojuegos. El acceso a la Aplicación y su utilización implican la aceptación de las presentes condiciones por parte de quien la utiliza (en adelante, «el Usuario»).',
  sections: [
    {
      heading: 'Titularidad del servicio',
      paragraphs: [
        `El responsable del servicio es ${LEGAL_CONTROLLER} (en adelante, «el Responsable»), con quien puede contactarse en la dirección ${LEGAL_CONTACT_EMAIL}.`,
        'El servicio se presta de forma gratuita, con carácter personal y sin publicidad. Su utilización no conlleva contratación ni pago de ningún tipo.',
      ],
    },
    {
      heading: 'Edad mínima',
      paragraphs: [
        'La utilización del espacio social requiere tener al menos catorce (14) años, edad a partir de la cual el artículo 7 de la Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD), admite el consentimiento propio para el tratamiento de datos personales.',
      ],
    },
    {
      heading: 'Contenido del Usuario',
      paragraphs: [
        'Las reseñas, publicaciones, notas y nombres que el Usuario introduce en la Aplicación son de su titularidad. El Usuario autoriza al Responsable a almacenarlos y a mostrarlos a las personas con las que mantenga una relación de amistad en la Aplicación, con esa única finalidad y mientras conserve la cuenta y el contenido publicado.',
        'Además del contenido que redacta, el espacio social publica la actividad de listas del Usuario: cuando un juego se incorpora a la biblioteca o pasa de una lista a otra, sus amistades reciben un aviso (que lo ha añadido, comenzado, finalizado o abandonado), con su fecha y hora. Esta actividad la registra la Aplicación durante su uso, sin que el Usuario la redacte. La Política de Privacidad detalla su alcance. La actividad de las listas que el Usuario mantenga ocultas no se muestra a sus amistades; se publica aparte, y la Aplicación solo la muestra a la cuenta de administración.',
        'Asimismo, se publican los logros del Usuario. La Aplicación determina automáticamente, a partir del uso de la biblioteca (juegos finalizados, puntuados o reseñados, entre otros), las distinciones obtenidas, sin que haga falta activar nada más que el espacio social. De cada logro se publica la fecha de obtención, sin la hora, junto con los indicadores que se derivan de ellos: el nivel y el grado de avance sobre el catálogo. Los logros se calculan sobre la totalidad de la biblioteca y solo publican su nivel, sin incluir dato alguno de los juegos que los originan, como sus títulos, sus puntuaciones o las listas en las que se encuentran.',
        'La biblioteca completa y las reseñas extensas se almacenan en Gists de la cuenta de GitHub del propio Usuario. La Aplicación los crea como Gists secretos, que no aparecen en el perfil de GitHub ni en los buscadores, pero no son privados: cualquier persona que conozca su identificador puede consultarlos. La Aplicación únicamente comparte dichos identificadores con las personas con las que el Usuario mantiene una relación de amistad.',
        'El Usuario puede publicar una reseña concreta mediante un enlace público, accesible para cualquier persona, disponga o no de cuenta en la Aplicación. Se trata de una acción voluntaria y referida a cada reseña individual. Se publican el juego, la puntuación, el texto íntegro de la reseña, las plataformas, los géneros, los puntos fuertes y débiles, el nombre de perfil y la fecha; no se publican el correo electrónico, el identificador de usuario, los identificadores de los Gists, las horas de juego, la fotografía ni el resto de la biblioteca. El enlace caduca automáticamente una vez transcurrido el plazo del que se informa al Usuario en el momento de crearlo, y puede retirarse con anterioridad desde los ajustes de la Aplicación. La retirada impide el acceso al enlace, pero no alcanza a las copias que se hayan compartido ni a las vistas previas que otras plataformas hayan almacenado.',
        'Lo publicado mediante enlace es una copia de la reseña en el momento de compartirla: las modificaciones posteriores no se reflejan en el enlace hasta que vuelva a compartirse. El Responsable podrá retirar cualquier enlace y, en caso de uso abusivo, impedir la creación de otros nuevos.',
        'La Aplicación solo interviene sobre los Gists del Usuario en un caso excepcional, para mejorar su privacidad. Las versiones anteriores creaban el canal social como Gist público, visible en el perfil de GitHub y en los buscadores. Al acceder al espacio social, la Aplicación copia dicho canal a un Gist no listado y elimina el anterior, por ser el único modo de retirar de circulación lo ya publicado. Solo se elimina ese canal antiguo, nunca la biblioteca, y únicamente después de comprobar que la copia conserva el contenido; si la comprobación no resulta satisfactoria, no se elimina nada y se informa al Usuario.',
      ],
    },
    {
      heading: 'Contenido no permitido',
      bullets: [
        'Contenido ilícito, que incite al odio o que suponga acoso a otras personas.',
        'Datos personales de terceros sin su consentimiento.',
        'Material protegido por derechos de propiedad intelectual cuya difusión no esté autorizada.',
        'La suplantación de la identidad de otra persona.',
      ],
      paragraphs: [
        `Cualquier persona que advierta contenido contrario a estas normas puede comunicarlo a ${LEGAL_CONTACT_EMAIL}, indicando el perfil y la publicación afectados. El Responsable examinará la comunicación y podrá ocultar el contenido o cerrar la cuenta responsable.`,
      ],
    },
    {
      heading: 'Exclusión de garantías y limitación de responsabilidad',
      paragraphs: [
        'El servicio se presta «tal cual», sin garantía de disponibilidad, de ausencia de errores ni de conservación de los datos, y puede interrumpirse o dejar de prestarse en cualquier momento.',
        'Se recomienda al Usuario conservar copias de seguridad de su información mediante la exportación periódica de la biblioteca. En la medida permitida por la legislación aplicable, el Responsable no asume responsabilidad alguna por la pérdida de datos, el lucro cesante ni los daños indirectos derivados del uso de la Aplicación.',
      ],
    },
    {
      heading: 'Servicios de terceros',
      paragraphs: [
        'La Aplicación se apoya en servicios de terceros, cuyas condiciones resultan igualmente aplicables al Usuario: GitHub (Gists), Google (inicio de sesión, base de datos y analítica), Cloudflare (alojamiento), IGDB/Twitch (datos de videojuegos, únicamente si se activan las carátulas) y TMDB (pósters de series y películas y fotografías de intérpretes en los premios). Los datos de videojuegos proceden de IGDB.com. This product uses the TMDB API but is not endorsed or certified by TMDB. Las carátulas, pósters, fotografías y marcas pertenecen a sus respectivos titulares y se muestran con fines exclusivamente identificativos.',
      ],
    },
    {
      heading: 'Propiedad intelectual y licencias',
      paragraphs: [
        'El código fuente de la Aplicación se distribuye bajo la licencia GNU GPL-3.0-or-later, que permite usarlo, estudiarlo y modificarlo en los términos de dicha licencia. Las presentes condiciones regulan el servicio alojado y no limitan los derechos que esa licencia concede sobre el código.',
        /* ATRIBUCIÓN OBLIGATORIA, no un agradecimiento. Los iconos de Font Awesome Free van bajo CC BY 4.0, y
           esa licencia EXIGE citar la fuente en un sitio visible para quien usa la obra: por eso esta frase
           está en el aviso legal y no en un comentario del código. Los sprites lo dan por hecho y apuntan aquí
           (ver `view/components/IconSprite`). Al añadir un icono de una procedencia nueva, esta lista es la que
           hay que revisar. */
        'Determinados elementos de la interfaz pertenecen a terceros y conservan su propia licencia, independiente de la del código. Los iconos proceden de Font Awesome Free (© Fonticons, Inc.), cuyos diseños se publican bajo la licencia CC BY 4.0, de Material Symbols (© Google, Apache 2.0) y de Carbon (© IBM, Apache 2.0); los de las medallas de logros, de Lucide (© Lucide Contributors, ISC). Las fuentes tipográficas se sirven desde el propio dominio de la Aplicación bajo la SIL Open Font License 1.1, cuyo aviso completo acompaña a los ficheros que las contienen.',
      ],
    },
    {
      heading: 'Modificaciones y legislación aplicable',
      paragraphs: [
        'El Responsable podrá actualizar las presentes condiciones. Cuando la modificación sea sustancial, se solicitará nuevamente la conformidad del Usuario al acceder al espacio social. Estas condiciones se rigen por la legislación española.',
      ],
    },
  ],
};

const PRIVACY: LegalDocument = {
  id: 'privacy',
  title: 'Política de privacidad',
  // Fecha PROPIA del documento y no `LEGAL_VERSION`, que es lo que `legal.ts` distingue: al declarar las
  // carátulas (2026-09-15) se añadió un tratamiento NUEVO pero OPT-IN y apagado por defecto, que no envía ningún
  // dato personal —solo el título del juego, y desde el servidor—. Revisar el texto sí; obligar a todo el mundo
  // a volver a aceptar por algo que no ha empezado a ocurrir todavía, no.
  //
  // CON LOS PREMIOS (2026-09-20) sí se sube `LEGAL_VERSION`, y por tres cosas que no son opt-in ni invisibles:
  // el archivo de una edición publicada es de LECTURA PÚBLICA con su enlace, votar crea una cuenta mínima aunque
  // no se tuviera perfil, y quien queda en los puestos premiados recibe un trofeo en su perfil que él no puede
  // retirar. Son tratamientos nuevos con efectos hacia fuera: toca volver a pedir la aceptación.
  // TMDB (2026-09-29) no sube `LEGAL_VERSION`: no recibe ningún dato de quien usa la app (ver «Destinatarios»).
  // EL RESUMEN DEL AÑO (2026-10-01) tampoco: enseña a tus amistades el MES en que terminaste cada juego, que es
  // menos de lo que la actividad de listas ya les publica de cada fin (fecha y hora). Se declara, sin re-aceptar.
  // Y el aviso de que lo has visto (`profiles/{uid}.yearSummary`: año y fecha, sin una cifra), por lo mismo.
  // LOS VOTOS A LA VISTA (2026-10-04) sí suben `LEGAL_VERSION`: lo que votaste, que leía solo su dueño, lo ven
  // también quienes votaron en la misma edición. El 05-10-2026 el plazo pasa a «hasta que se abre la siguiente»,
  // sin volver a subirla: ver `legal.ts`.
  // LA LISTA DE DESEOS (2026-10-05) no la sube: publica un aviso de ENTRADA en una de tus listas, que es lo que se
  // aceptó el 2026-08-22 («un aviso por cada vez que un juego entra en una de tus listas») antes de acotarlo. Se
  // corrige el texto, que es la obligación que queda. Ver `LEGAL_VERSION`.
  // 2026-10-05: redacción formal (ver la cabecera de arriba), sin cambio de contenido.
  // LA ACTIVIDAD DE LAS LISTAS OCULTAS (2026-10-07) sí la sube: se publica aparte y la ve la administración.
  // Y el plazo de treinta días de cada aviso (el mismo día) no la sube: es publicar MENOS (ver `legal.ts`).
  updated: '2026-10-07',
  intro:
    'La presente Política de Privacidad informa, de conformidad con el Reglamento (UE) 2016/679, General de Protección de Datos (RGPD), y con la LOPDGDD, de los datos personales que trata la Aplicación, de la finalidad y la base jurídica del tratamiento y del modo de ejercer los derechos que la normativa reconoce. Su contenido se ajusta al funcionamiento efectivo de la Aplicación.',
  sections: [
    {
      heading: 'Responsable del tratamiento',
      paragraphs: [
        `El responsable del tratamiento es ${LEGAL_CONTROLLER} (en adelante, «el Responsable»). Para cualquier cuestión relativa a la privacidad, el Usuario puede dirigirse a ${LEGAL_CONTACT_EMAIL}.`,
      ],
    },
    {
      heading: 'Datos tratados',
      bullets: [
        'En el dispositivo del Usuario: las listas de juegos, las reseñas y las preferencias (mediante localStorage e IndexedDB), así como el token de GitHub cifrado.',
        'En la cuenta de GitHub del Usuario: la biblioteca y el canal social, en Gists de su titularidad.',
        'En Cloud Firestore, si se activa el espacio social: el identificador de usuario; el nombre de perfil elegido o, en su defecto, el nombre de la cuenta de Google; la fotografía de perfil de Google, que el Usuario puede retirar; las relaciones de amistad; una categoría de perfil de uso interno, asignada por el Responsable; la fecha de alta; la marca de última actividad; las preferencias de la Aplicación, y los logros obtenidos, con la fecha de cada uno y la de su última publicación. El identificador del Gist social no figura en el perfil: se conserva en un documento privado al que solo accede su titular y, de forma replicada, en los documentos de amistad.',
        'En Cloud Firestore, en un documento privado al que solo accede su titular: los identificadores de los Gists y el token de GitHub cifrado.',
        'En Cloudflare, si el Usuario comparte una reseña mediante enlace público: una copia de dicha reseña (juego, puntuación, texto, metadatos, nombre de perfil y fechas) mientras el enlace permanezca activo. La copia caduca automáticamente y se elimina al retirar el enlace o al suprimir la cuenta. No incluye el correo electrónico, el identificador de usuario ni los identificadores de los Gists.',
        'En Cloud Firestore, si el Usuario participa en las votaciones de los premios: la papeleta, que comprende el voto emitido en cada categoría, el nombre elegido para la clasificación, el nombre de la cuenta de Google, la fecha de envío y el número de correcciones realizadas. Acceden a ella su titular y el Responsable, y se retira al publicarse la edición. En ese momento, el voto emitido en cada categoría, junto con el nombre elegido para la clasificación (nunca el de la cuenta de Google), se conserva por separado para que puedan consultarlo quienes participaron en la misma edición, hasta la apertura de la edición siguiente o hasta su eliminación anticipada por el Responsable. Se conserva además un registro de participación (el identificador de usuario), al que solo accede el Responsable y que se retira en el mismo momento. Concluido el proceso, de la papeleta únicamente subsiste la clasificación. La papeleta no incluye el correo electrónico.',
        'En Cloud Firestore, si el Usuario vota sin disponer de perfil social: se crea un perfil mínimo con su nombre, su fotografía de Google y un seudónimo. Este perfil no figura en el directorio ni publica contenido alguno, y su única finalidad es que la fila de la clasificación quede vinculada al perfil cuando el Usuario lo complete.',
        'En Cloud Firestore, si el Usuario obtiene uno de los puestos premiados de una edición: el trofeo correspondiente (edición, denominación, puesto y fecha), que se conserva en su perfil y se muestra en él como un logro. Lo concede el Responsable al publicar la edición, y el Usuario no puede asignárselo ni retirarlo.',
        'Si el Usuario acepta la analítica: eventos de uso y errores, registrados en Google Analytics con un identificador aleatorio.',
      ],
      paragraphs: [
        'El perfil visible para otros usuarios contiene el nombre de perfil (o, si no se ha elegido ninguno, el nombre de la cuenta de Google), la fotografía (salvo que el Usuario la haya retirado), la categoría de perfil antes indicada, la marca de última actividad (que la Aplicación utiliza para ordenar el directorio y determinar qué canales conviene actualizar) y los logros obtenidos. No contiene el correo electrónico ni los identificadores del canal social o de la biblioteca.',
      ],
    },
    {
      heading: 'Finalidad y base jurídica',
      paragraphs: [
        'Los datos se tratan con la finalidad de prestar el servicio que el Usuario solicita: sincronizar sus listas entre dispositivos y, si lo activa, permitirle compartir reseñas con sus amistades. La base jurídica del tratamiento es el consentimiento del Usuario (artículo 6.1.a del RGPD), prestado al iniciar sesión y al aceptar estas condiciones, que puede retirarse en cualquier momento mediante la supresión de la cuenta.',
        'Los datos de analítica se tratan únicamente con el consentimiento previo del Usuario, que puede revocarse en cualquier momento desde los ajustes de la Aplicación.',
      ],
    },
    {
      heading: 'Destinatarios',
      bullets: [
        'Google (Firebase Authentication, Cloud Firestore y Google Analytics), como proveedor de la identificación, del perfil social y de la analítica.',
        'GitHub, como proveedor del alojamiento de los Gists, en la propia cuenta del Usuario.',
        'Cloudflare, como proveedor del alojamiento y la entrega de la web.',
        'IGDB (Twitch), únicamente si el Usuario activa las carátulas: recibe el título del juego para localizar su portada. La consulta la realiza el servidor de la Aplicación y no el navegador del Usuario, por lo que IGDB no conoce su dirección IP ni ningún otro dato que lo identifique, sino únicamente el nombre de un juego, sin saber a qué lista pertenece ni cuántas existen. Los resultados se conservan en una caché común a todos los usuarios, de modo que un título ya consultado no vuelve a solicitarse.',
        'TMDB (The Movie Database), en relación con los premios: proporciona los pósters de las series y películas nominadas y las fotografías de los intérpretes. No recibe ningún dato del Usuario: las búsquedas las realiza el Responsable al preparar cada edición y las imágenes las obtiene el servidor de la Aplicación, no el navegador del Usuario, por lo que TMDB no conoce su dirección IP ni su participación en las votaciones.',
        'Cualquier persona que disponga del enlace, una vez publicada una edición de los premios en la que el Usuario haya participado: el archivo de la edición es de acceso público y contiene el nombre elegido para la clasificación, los puntos y el puesto de cada participante. No contiene el identificador de usuario, el correo electrónico ni la fotografía, sino únicamente el nombre elegido y un seudónimo que permite a la Aplicación reconocer la fila propia. Permanece accesible mientras la edición siga publicada.',
        'Las personas que participaron en la misma edición de los premios, con sesión iniciada, desde su publicación hasta la apertura de la edición siguiente: el voto emitido en cada categoría y su acierto, junto con el nombre elegido para la clasificación, los puntos y el puesto. No acceden al identificador de usuario, al correo electrónico ni al nombre de la cuenta de Google. El Responsable puede retirar esta información con anterioridad.',
        'Los demás usuarios con sesión iniciada: el nombre de perfil, la fotografía, la categoría de perfil, la fecha de última actividad, los logros y la actividad social, en los términos aquí descritos. Respecto de los logros, la Aplicación solo muestra la vitrina de medallas en las fichas de las amistades, pero el dato forma parte del perfil, que puede consultar cualquier usuario con sesión iniciada, mantenga o no una relación de amistad con el Usuario.',
        'Cualquier persona que conozca el identificador del Gist social del Usuario. La Aplicación crea este Gist (y migra los anteriores) como Gist no listado, de modo que no aparece en el perfil de GitHub ni en los buscadores. Aun así, no es privado: quien disponga del identificador puede consultarlo sin iniciar sesión en la Aplicación, que solo lo comparte con las amistades del Usuario.',
        'Cualquier persona, si el Usuario comparte una reseña mediante enlace público: dicha reseña queda accesible en internet para quien disponga del enlace, sin necesidad de cuenta, hasta su caducidad o retirada. Se trata siempre de una acción del Usuario, referida a cada reseña individual.',
        'El Responsable, que por necesidades técnicas dispone de acceso de administración a la base de datos y puede consultar los perfiles, asignar su categoría, desactivar el espacio social de un perfil y eliminarlo. No puede acceder al documento privado en el que se conservan el token cifrado y los identificadores de los Gists, reservado a su titular.',
      ],
      paragraphs: [
        'Los ajustes de visibilidad del Usuario (ocultar una lista o las marcas de «rejugable» y «merece otra oportunidad») se aplican a todas sus amistades. Ocultar una lista oculta también su actividad: las amistades no reciben ningún aviso de entrada en una lista oculta. La única excepción es la cuenta desde la que se administra el servicio, por cuanto desde ella se realizan el mantenimiento y el soporte: en los perfiles de sus amistades accede a las listas completas, y en su actividad recibe también los avisos de las listas ocultas. Para ello, la actividad de las listas ocultas se publica en un apartado separado del canal social del Usuario, que la Aplicación no muestra a nadie más. Las horas de juego quedan fuera de esta excepción: si el Usuario decide ocultarlas, no son visibles para nadie.',
        'El resumen anual del perfil muestra a las amistades, respecto de los juegos completados en el año, el mes en que se finalizaron (nunca el día ni la hora), deducido de la fecha en que cada juego se incorporó a la lista de completados; no se computan las fechas en las que se incorporaron muchos juegos a la vez, como ocurre en una importación. La cuenta de administración accede también al día, en virtud de la misma excepción. Si el Usuario oculta su lista de completados, el resumen tampoco es visible, salvo para dicha cuenta. Cuando el Usuario consulta su propio resumen al cierre del año, su perfil registra que lo ha consultado (el año y la fecha, sin cifra alguna) para que sus amistades reciban un aviso temporal en su actividad.',
        'Los logros constituyen una excepción a dicho filtrado: se calculan sobre la totalidad de la biblioteca, incluidas las listas ocultas, porque solo reflejan cuántos juegos hay. De una lista oculta no se muestra a las amistades ningún dato (títulos, puntuaciones ni avisos de entrada); lo único que puede variar es el nivel de una medalla.',
        'El canal social contiene el nombre de perfil, las preferencias de visibilidad y, por cada reseña, el nombre del juego, la puntuación y un fragmento breve del texto. Incluye además la actividad de listas: por cada juego, la lista a la que se incorporó y la fecha y la hora en que lo hizo, para que las amistades puedan ver en su actividad que el Usuario ha comenzado, finalizado, abandonado o añadido un juego. La biblioteca completa, las reseñas íntegras y las horas de juego no forman parte del canal: se conservan en otro Gist, que la Aplicación crea como secreto y cuyo identificador solo se comparte con las amistades.',
        'De la actividad de listas se publican la incorporación de un juego a la biblioteca, con la lista por la que entra, y su paso posterior de una lista a otra. La incorporación a la biblioteca solo se publica desde el 7 de octubre de 2026: la anterior a esa fecha no se publica. La actividad de las listas ocultas se publica aparte y solo la recibe la cuenta de administración, y de cada lista solo se publica la primera entrada de cada juego. La incorporación de un juego a la lista de deseos se publica con independencia de su fecha, y su traslado posterior a la lista de próximos se publica como su incorporación a la biblioteca. Si el Usuario oculta la lista de deseos, lo que incorpore a ella sigue esa misma regla. De un mismo día se conserva, además, un único aviso por juego: el último. Cada aviso permanece publicado durante treinta días desde que se produce; transcurrido ese plazo, se retira. El registro interno del que procede esta actividad (la hora a la que se mueve cada juego o se modifica una puntuación) no se publica ni sale del dispositivo, y tampoco accede a él la cuenta de administración.',
        'Un Gist secreto de GitHub no aparece en el perfil de GitHub ni en los buscadores, pero no es privado: quien disponga de su identificador puede consultarlo. Por ello, ni el identificador de la biblioteca ni el del canal social figuran en el perfil del Usuario, y únicamente se comparten con sus amistades.',
        'Los proveedores indicados pueden tratar los datos fuera del Espacio Económico Europeo, al amparo de las decisiones de adecuación o de las cláusulas contractuales tipo previstas en los artículos 45 y 46 del RGPD.',
      ],
    },
    {
      heading: 'Plazo de conservación',
      paragraphs: [
        'Los datos se conservan mientras el Usuario mantenga su cuenta. La supresión de la cuenta desde la Aplicación elimina el perfil, las relaciones de amistad, la configuración en la nube y los enlaces públicos de reseñas que estuvieran activos, y borra los datos almacenados en ese dispositivo. Los Gists no se modifican, por ser de titularidad del Usuario, que puede eliminarlos desde GitHub. La única excepción es la retirada del canal social antiguo descrita en las condiciones de uso, cuya finalidad es poner fin a su exposición pública.',
      ],
    },
    {
      heading: 'Seguridad y sus limitaciones',
      paragraphs: [
        'El token de GitHub se almacena cifrado en el navegador con una clave no exportable y, para permitir su recuperación en otros dispositivos, también en la nube, ofuscado con una clave derivada del identificador de usuario. Dado que ese identificador no es secreto, la protección efectiva de esa copia reside en las reglas que impiden a cualquier otra persona acceder al documento; el cifrado constituye una medida adicional y no una garantía por sí solo.',
        'Por este motivo, se recomienda utilizar un token de tipo «fine-grained», limitado a Gists y con fecha de caducidad. El acceso a la base de datos está restringido mediante reglas de seguridad verificadas con pruebas automatizadas.',
      ],
    },
    {
      heading: 'Derechos del Usuario',
      paragraphs: [
        'El Usuario puede ejercer los derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad de sus datos. La supresión puede realizarla directamente mediante la opción de borrado de cuenta de la Aplicación, y la exportación de sus listas está disponible en los ajustes.',
        `Para el ejercicio de cualquier otro derecho, o en caso de incidencia, puede dirigirse a ${LEGAL_CONTACT_EMAIL}. Asimismo, tiene derecho a presentar una reclamación ante la Agencia Española de Protección de Datos (www.aepd.es).`,
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
  // 2026-10-05: redacción formal (ver la cabecera de arriba), sin cambio de contenido.
  updated: '2026-10-05',
  intro:
    'La Aplicación no utiliza cookies publicitarias ni de seguimiento entre sitios. Cuando se utiliza únicamente para gestionar las listas (sin sincronización, sin inicio de sesión y sin aceptar la analítica), no establece comunicación con servidores de terceros ni almacena cookies: toda la información necesaria se conserva en el navegador. A continuación se detallan el almacenamiento y las comunicaciones que se producen al activar cada funcionalidad.',
  sections: [
    {
      heading: 'Almacenamiento necesario',
      bullets: [
        'localStorage e IndexedDB: las listas, las preferencias (como el tema o la escala de puntuación) y la configuración de sincronización. Sin este almacenamiento, la Aplicación no puede funcionar sin conexión.',
        'El token de GitHub cifrado, con la clave correspondiente almacenada en IndexedDB.',
        'La sesión de Google (Firebase Authentication), para no solicitar las credenciales en cada visita.',
      ],
      paragraphs: [
        'Este almacenamiento es estrictamente necesario para prestar el servicio solicitado por el Usuario y, conforme al artículo 22.2 de la Ley 34/2002, de 11 de julio, de servicios de la sociedad de la información y de comercio electrónico (LSSI), no requiere consentimiento. Se elimina al suprimir la cuenta o al borrar los datos del navegador.',
      ],
    },
    {
      heading: 'Inicio de sesión con Google',
      paragraphs: [
        'El inicio de sesión lo gestiona Google, no el Responsable. Cuando el Usuario lo utiliza, ya sea para acceder al espacio social o para recuperar su Gist desde su cuenta, el navegador carga scripts de Google: los de identificación (apis.google.com) y los de reCAPTCHA (www.google.com y www.gstatic.com), que verifican que las peticiones proceden de la Aplicación y no de un programa que la suplante. Google puede almacenar cookies propias en sus dominios con fines de prevención del abuso y de mantenimiento de la sesión, entre ellas «_GRECAPTCHA».',
        'Estas cookies son de Google, que decide cuáles se instalan. El Responsable no las instala ni las lee, y por eso no puede facilitar una relación cerrada de ellas. Son necesarias para el servicio de autenticación que el Usuario solicita, por lo que no dependen del consentimiento de analítica. El Usuario decide si utiliza o no el inicio de sesión; si no lo hace, no se produce ninguna de estas comunicaciones.',
      ],
      links: [
        { label: 'Privacidad de Google', href: 'https://policies.google.com/privacy' },
        { label: 'Cómo usa Google las cookies', href: 'https://policies.google.com/technologies/cookies' },
      ],
    },
    {
      heading: 'Sincronización con GitHub',
      paragraphs: [
        'Si el Usuario vincula un Gist, la Aplicación se comunica con la API de GitHub (api.github.com) para leer y escribir sus listas. Se trata de una comunicación con un servidor de terceros, necesaria para la sincronización solicitada, que no almacena cookies en el navegador: la autorización se incluye en la propia petición mediante el token del Usuario.',
      ],
    },
    {
      heading: 'Carátulas de los juegos',
      paragraphs: [
        'Las carátulas están desactivadas por defecto. Mientras el Usuario no las active en los ajustes de la Aplicación, no se solicita ninguna imagen ni se consulta ningún catálogo.',
        'Una vez activadas, el servidor de la Aplicación busca en IGDB la portada de cada juego de las listas a partir únicamente de su título. El navegador del Usuario no se comunica con IGDB: solicita las imágenes al propio dominio de la Aplicación, que las obtiene y las sirve. Por ello, IGDB no recibe la dirección IP del Usuario, y la navegación por las listas no implica comunicación alguna del navegador con servidores de terceros.',
        'Solo se transmite el nombre del juego, nunca la puntuación, la reseña, las horas de juego ni la identidad del Usuario. Las correspondencias obtenidas se conservan en una caché compartida para evitar consultas repetidas, y el navegador conserva las imágenes para que la biblioteca pueda consultarse también sin conexión. Las carátulas pueden desactivarse en cualquier momento desde el mismo lugar.',
      ],
    },
    {
      heading: 'Analítica',
      bullets: [
        'Google Analytics (GA4): identificadores almacenados en el dispositivo para medir el uso y los errores de forma agregada.',
      ],
      paragraphs: [
        'La analítica no se carga hasta que el Usuario la acepta en el aviso correspondiente. Si la rechaza, no se inicializa ni se envía dato alguno. La decisión puede modificarse en cualquier momento desde los ajustes de la Aplicación.',
      ],
    },
    {
      heading: 'Medición sin cookies',
      paragraphs: [
        'El proveedor de alojamiento (Cloudflare) puede registrar métricas agregadas de tráfico sin almacenar información en el dispositivo ni identificar al Usuario, por lo que no requiere consentimiento.',
      ],
    },
    {
      heading: 'Revocación del consentimiento',
      paragraphs: [
        'El consentimiento de analítica puede retirarse en cualquier momento desde los ajustes de la Aplicación. Asimismo, el Usuario puede eliminar los datos del sitio desde la configuración de su navegador.',
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
  updated: '2026-10-05',
  intro: 'Procedencia de los datos y las imágenes de terceros que muestra la Aplicación.',
  sections: [
    {
      heading: 'Videojuegos',
      paragraphs: ['Los datos y las carátulas de videojuegos proceden de IGDB.com.'],
    },
    {
      heading: 'Series, películas e intérpretes',
      logo: { src: '/credits/tmdb.svg', alt: 'TMDB', width: 96, height: 12 },
      paragraphs: [
        'Los pósters de series y películas y las fotografías de intérpretes que se utilizan en los premios proceden de TMDB.',
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
