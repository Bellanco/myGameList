// Textos del panel de administración (`/admin`, ruta oculta) y de la moderación de enlaces compartidos.
//
// APARTE DE `labels.ts` POR PESO. `App.tsx` importa de allí `TAB_TITLES` y `ROUTE_TAB` para arrancar, y un módulo
// entra en un chunk entero o no entra: mientras estos textos vivieron con ellos, los ~20 kB de un panel que ve
// una sola persona viajaban en el arranque de todo el mundo. `AdminHub` y `AdminUserShares` son perezosos, así
// que aquí solo se descargan cuando alguien abre `/admin`.
import type { AdminAnomaly } from '../../model/types/firestore';

// Panel de administración (`/admin`, ruta oculta). Nada que ver con `SETTINGS_UI.admin`, que es la
// administración de ETIQUETAS de la propia biblioteca.
export const ADMIN_PANEL_UI = {
  sectionAria: 'Panel de administración',
  title: 'Administración',
  subtitle: 'Censo de usuarios con perfil social y acciones de moderación.',
  checking: 'Comprobando permisos...',
  loading: 'Cargando usuarios...',
  refresh: 'Actualizar',
  // SIN «volver a mis listas»: la navegación de secciones sigue arriba en `/admin` (la cabecera no se oculta en
  // esta ruta), así que el botón repetía una salida que ya estaba a la vista y ocupaba el sitio de la barra.
  searchLabel: 'Buscar',
  searchPlaceholder: 'Nombre o identificador',
  // Filtro de atención. Se nombra por lo que deja ver, no por lo que esconde: al abrir el panel la pregunta es
  // "¿hay algo que mirar hoy?", y con el censo creciendo eso era un barrido visual de todas las fichas.
  onlyFlaggedLabel: 'Solo perfiles con señales',
  empty: 'No hay ningún perfil todavía.',
  emptyFiltered: 'Ningún perfil coincide con la búsqueda.',
  /** Con el filtro puesto y nada que enseñar, la respuesta no es "no hay perfiles" sino "no hay nada que mirar". */
  emptyFlagged: 'Ningún perfil tiene señales: no hay nada que revisar.',
  resultCount: (count: number) => (count === 1 ? '1 usuario' : `${count} usuarios`),
  // Aviso permanente: el panel enseña `profiles`, que no es el censo real de cuentas.
  scopeNote: 'Solo aparece quien tiene perfil social. Quien usa la app sin crearlo no es visible desde aquí: sus documentos son owner-only y las reglas no dejan leerlos ni al administrador.',
  // El saneado automático hace innecesaria la purga manual en cuanto el usuario vuelve a entrar. Conviene que se
  // vea, para que la purga manual se use solo donde de verdad aporta: en quien ya no vuelve.
  legacyNote: 'Los restos legacy se migran solos: cuando el usuario inicia sesión, su propio navegador pone a salvo el token y el id del gist en su configuración privada y limpia el perfil público. Purga a mano solo a quien lleve mucho sin entrar.',
  truncated: (limitCount: number) => `Se alcanzó el tope de ${limitCount} perfiles: la lista puede estar incompleta.`,
  totals: {
    aria: 'Resumen',
    profiles: 'Perfiles',
    socialEnabled: 'Con social activo',
    friendships: 'Amistades',
    pending: 'Solicitudes pendientes',
    legacy: 'Con restos legacy',
    flagged: 'Con señales',
    // Los dos que NO salen del censo de Firestore sino del Worker de enlaces. Solo se pintan si esa respuesta
    // llegó: enseñar un cero cuando no se ha podido leer sería afirmar que no hay ninguno.
    activeShares: 'Enlaces activos',
    banned: 'Vetados para compartir',
    /** El censo de enlaces viene paginado y el panel pide una página: si hay más, el número lleva un "+". */
    partialCount: (count: number) => `${count}+`,
    partialHint: 'Solo se ha listado la primera página de enlaces: puede haber más.',
  },
  // Ficha completa del usuario: todo lo que las reglas dejan leer de su documento y de sus amistades.
  field: {
    createdAt: 'Alta',
    createdAtEstimated: 'Alta (estimada)',
    createdAtUnknown: 'Sin fecha de alta',
    // Se dice de dónde sale la estimación para que no se confunda con un dato sellado.
    estimatedHint: 'Estimada a partir de su amistad más antigua: los perfiles creados antes de registrar la fecha de alta no la tienen.',
    lastActivity: 'Última actividad',
    friends: 'Amistades',
    pendingOut: 'Peticiones enviadas',
    pendingIn: 'Peticiones recibidas',
    // El id que publica su PERFIL. Solo se pinta cuando existe: las escrituras actuales lo purgan, así que en un
    // perfil al día está vacío y enseñar "—" para todo el mundo hacía pensar que faltaba un dato. El id EN SÍ no
    // se enseña: no se puede hacer nada con él desde aquí, y una ficha llena de cadenas de 32 caracteres esconde
    // los datos que sí se leen. Lo que importa es que lo siga publicando.
    socialGist: 'Gist social (resto legacy)',
    socialGistPresent: 'Lo sigue publicando',
    // Estado del canal SOCIAL según lo que guardan sus amistades. Antes se listaban los ids; no servían para nada
    // —el panel no puede abrir un gist ajeno— y lo único accionable es cuántos hay: con más de uno hay deriva.
    friendGists: 'Canal social',
    /** El gist de JUEGOS denormalizado: con lo que un amigo carga sus listas compartidas. */
    friendGamesGists: 'Listas compartidas',
    /** Un solo canal en circulación: el caso sano. */
    channelSingle: 'Un solo canal',
    /** Más de uno: es exactamente la señal `gist-drift` / `games-gist-drift`, dicha con el número. */
    channelMany: (count: number) => `${count} canales distintos`,
    /** Sin amistades no hay nada denormalizado que mirar. No es un fallo. */
    channelNone: 'Ninguna amistad lo guarda',
    /** Vacío en el canal de LISTAS es lo normal en quien usa el social sin sincronizar sus juegos. */
    listsNone: 'Sin sincronización de listas',
    /**
     * Los dos nombres cuando no coinciden. Se etiquetan por ORIGEN y no por antigüedad: el panel no puede saber cuál
     * es el vigente (ese dato vive en el gist del usuario), y afirmarlo llevaba a propagar el equivocado.
     */
    staleFriendNames: 'Nombre que le ven sus amigos',
    profileNameSource: 'Nombre en su perfil (Firestore)',
    nameMismatchHint: 'No coinciden. El que vale es el de su gist social, que este panel no puede leer: si su último guardado falló a medias, el rancio es el del perfil.',
    /** Estado de la foto denormalizada. No se pinta la URL: ocupa una línea entera y no dice nada de un vistazo. */
    friendPhoto: 'Foto que le ven sus amigos',
    friendPhotoStale: 'Desactualizada',
    friendPhotoFresh: 'Al día',
    /** Solicitudes suyas que llevan mucho esperando, con el detalle de cuántas son ya purgables. */
    stalePending: 'Solicitudes sin respuesta',
    stalePendingDetail: (stale: number, fossil: number) =>
      fossil > 0 ? `${stale} (+90 d), ${fossil} purgables (+180 d)` : `${stale} (+90 d)`,
    schema: 'Esquema',
    /**
     * Estado de la foto, en tres valores en vez de un sí/no.
     *
     * El interruptor de verdad (`showPhoto`) vive en el GIST del usuario y este panel no lo lee, así que el estado
     * se DEDUCE de dos hechos que sí ve: si su perfil publica `photoURL` y si sus amistades guardan alguna foto
     * suya. Que tuviera una y ya no la publique solo puede venir del opt-out, y eso es "oculta"; no haber tenido
     * nunca ninguna es "desactivada". La deducción tiene su punto ciego y se dice en el `title`.
     */
    photo: 'Foto',
    photoOn: 'Activada',
    photoHidden: 'Oculta',
    photoOff: 'Desactivada',
    /**
     * Sin amistades no hay con qué comparar, así que no se afirma nada: era el único de los cuatro casos en los
     * que el panel podía equivocarse, porque quien apagó el interruptor antes de hacer amigos se ve exactamente
     * igual que quien nunca tuvo foto. Decir "sin datos" cuesta lo mismo que decir una cosa que puede ser falsa.
     */
    photoUnknown: 'Sin datos',
    photoOnHint: 'Su perfil publica foto: es la que ven sus amistades y la que sale en el feed.',
    photoHiddenHint: 'Su perfil no publica foto, pero sus amistades guardan una suya de antes: la ha ocultado con el interruptor de su perfil social.',
    photoOffHint: 'No publica foto y ninguna de sus amistades guarda una suya: no llegó a publicarla desde que se hicieron amigos. O su cuenta de Google no tiene foto, o la lleva apagada desde entonces.',
    photoUnknownHint: 'No publica foto y no tiene amistades con las que comparar, así que desde aquí no se puede saber si la ha ocultado o si nunca ha tenido: el interruptor vive en su gist social y este panel no lo lee.',
    etag: 'ETag del gist',
    yes: 'Sí',
    no: 'No',
    none: '—',
  },
  // Unificación del canal social cuando un usuario acabó con dos gists en circulación.
  gist: {
    driftTitle: 'Gists en circulación',
    profileGist: 'Publica en su perfil',
    friendGist: 'Sus amistades apuntan a',
    /** Su perfil arrastra un id propio. Sin enseñarlo: no hay nada que hacer con él desde aquí. */
    profileGistOwn: 'un canal propio (resto legacy)',
    /** El perfil ya no publica el id: lo normal desde la purga, y aquí hay que decirlo para que no parezca un hueco. */
    profileGistPurged: 'ya no lo publica (purgado)',
    // Ya no hay acción: la deriva se resuelve sola cuando su dueño abre el hub (la migración elige el canal con
    // contenido y repunta las referencias). Aquí solo se enseña, para saber a quién le falta pasar por ahí.
    driftHint: 'Se resuelve solo cuando esta persona abra el espacio social: su cliente elegirá el canal con contenido y actualizará sus amistades. Desde aquí no se puede hacer nada (haría falta su token de GitHub).',
  },
  // Reparación de la identidad denormalizada en las amistades: es la única vía que no depende de que su dueño abra
  // el espacio social. Los ids de gist NO se tocan (haría falta su token para saber cuál es el bueno).
  healIdentity: {
    title: 'Identidad en sus amistades',
    hint: 'Sus amigos le ven con el nombre y la foto que se guardaron al hacerse amigos. Su propio cliente los refresca al abrir el espacio social, al guardar el perfil o al publicar, así que quien solo usa sus listas los arrastra indefinidamente. Desde aquí se propagan su nick y su foto actuales; los ids de gist no se tocan.',
    btn: 'Propagar nombre y foto',
    // Sin nick ni nombre conocido no hay nada que propagar, y escribir un vacío borraría a sus amigos la única
    // forma de reconocerle.
    noName: 'Este perfil no tiene nombre que propagar: ni nick propio ni nombre guardado por sus amistades.',
    confirm: (name: string) => `¿Propagar el nombre y la foto actuales de ${name} a sus documentos de amistad? Solo se escriben los que estén desactualizados.`,
    // Con el nombre a la vista: es lo que de verdad se va a escribir en los documentos de amistad, y si el perfil
    // llevaba el rancio esta es la última oportunidad de no propagarlo.
    confirmWithName: (name: string, willWrite: string) =>
      `¿Escribir «${willWrite}» como nombre de ${name} en sus documentos de amistad? Es el nombre que guarda su perfil; si el vigente fuera otro, esto lo sustituiría en la lista de sus amigos.`,
    ok: (touched: number) =>
      touched === 0
        ? 'Sus amistades ya estaban al día: no se ha escrito nada.'
        : `Identidad propagada a ${touched} amistad(es).`,
    partial: 'Propagación incompleta: revisa la consola para el detalle.',
  },
  // Desempate del nombre cuando el perfil y las amistades no coinciden. El administrador ve los dos valores y
  // decide; el panel no puede decidirlo por él (el nick vigente vive en el gist del usuario).
  chooseName: {
    title: 'Qué nombre es el correcto',
    hint: 'El perfil y sus amistades no dicen lo mismo, y desde aquí no se puede saber cuál es el vigente: el nick lo escribe su dueño en su gist social, que este panel no lee. Elige uno y se escribirá en su perfil y en sus amistades. Si el gist dice otra cosa, su propio cliente volverá a imponerlo al abrir el espacio social —el nombre es suyo—, así que esto sirve sobre todo para dejar el directorio coherente y para quien ya no vuelve.',
    btn: (name: string) => `Usar «${name}»`,
    btnAria: (name: string, user: string) => `Usar «${name}» como nombre de ${user}`,
    current: 'en su perfil',
    fromFriends: 'según sus amistades',
    confirm: (user: string, name: string) =>
      `¿Fijar «${name}» como nombre de ${user}? Se escribe en su perfil y en sus documentos de amistad.`,
    ok: (name: string, touched: number) =>
      touched > 0
        ? `Nombre fijado en «${name}» (perfil + ${touched} amistad(es)).`
        : `Nombre fijado en «${name}» en su perfil; sus amistades ya estaban de acuerdo.`,
    partial: 'No se pudo fijar el nombre del todo: revisa la consola para el detalle.',
  },
  // Purga de solicitudes fosilizadas (enviadas por él, pendientes, +180 días).
  fossil: {
    title: 'Solicitudes fosilizadas',
    hint: 'Solicitudes que envió y que nadie ha aceptado en más de 180 días. Borrarlas las retira también de la bandeja de quien las recibió, y cualquiera de los dos puede volver a enviarlas. No se tocan las amistades aceptadas, ni las que él ha recibido (esas salen en la ficha de quien las mandó), ni las que no tienen fecha.',
    btn: (count: number) => `Purgar ${count} solicitud(es)`,
    confirm: (name: string, count: number) =>
      `¿Borrar ${count} solicitud(es) que ${name} envió y llevan más de 180 días sin aceptar? Desaparecen también de la bandeja de sus destinatarios.`,
    ok: (touched: number) => `${touched} solicitud(es) fosilizada(s) borrada(s).`,
    partial: 'Purga incompleta: revisa la consola para el detalle.',
  },
  // Cutover de identidad: mover un perfil legacy a `profiles/{uid}` y retirar el huérfano.
  cutover: {
    title: 'Identidad del documento',
    hint: 'Este perfil vive bajo un id que no es el uid de su dueño, donde la app ya no lo busca y las reglas no le dejan escribir: su perfil está congelado. Migrar lo lleva a `profiles/{uid}` con todo lo que tiene (rango, alta, restos por rescatar) y borra el original, en una sola operación.',
    // Sin el campo `uid` en el documento no hay destino posible, y el panel no puede adivinarlo.
    unknownUid: 'El documento no dice de quién es (no tiene campo `uid`): no se puede migrar desde aquí. Se desbloquea cuando su dueño inicie sesión, porque su propio navegador crea el documento canónico.',
    alreadyCanonical: 'Este perfil ya vive en `profiles/{uid}`: no hay nada que migrar.',
    targetLabel: 'Se moverá a',
    /** El destino, sin el id: es siempre `profiles/{uid}` y el uid no aporta nada que se pueda comprobar aquí. */
    targetCanonical: 'Su documento canónico',
    // Qué va a pasar de verdad al pulsar: son dos operaciones distintas y hasta ahora no se sabía cuál tocaba.
    outcomeLabel: 'Qué hará',
    outcomeMove: 'MOVER el documento entero (no hay perfil canónico todavía) y borrar este.',
    outcomeMerge: 'FUSIONAR: ya existe su perfil canónico y manda el vivo. Solo se le rescata lo que le falte (rango, alta más antigua, restos por cifrar) y este se borra.',
    // Con el censo recortado, no haber visto el gemelo no prueba que no exista.
    outcomeUnknown: 'No se puede anticipar: el censo viene recortado, así que puede existir un perfil canónico que no se ha listado.',
    btn: 'Migrar identidad',
    confirm: (name: string) => `¿Migrar la identidad de ${name} y borrar el documento antiguo? Sus amistades no se tocan.`,
    okMoved: 'Identidad migrada: el perfil ya vive en su documento canónico.',
    okMerged: (carried: string[]) =>
      carried.length > 0
        ? `Documento huérfano retirado. Rescatado al perfil vivo: ${carried.join(', ')}.`
        : 'Documento huérfano retirado: el perfil vivo ya tenía todo lo que hacía falta.',
  },
  // Señales de algo fuera de lugar. Etiqueta corta para la píldora y explicación en el `title`.
  anomalies: {
    aria: 'Señales detectadas',
    'no-display-name': {
      label: 'sin nombre',
      hint: 'El perfil no tiene nick: se quedó a medio crear.',
    },
    'friend-name-mismatch': {
      label: 'nombre sin coincidir',
      hint: 'El nombre de su perfil y el que guardan sus amistades no coinciden, y desde aquí no se sabe cuál es el vigente: el nick lo escribe en su gist social (de donde lo lee el feed) y este panel solo ve la copia de Firestore. Si su último guardado escribió el gist y falló al replicar, el viejo es el del perfil.',
    },
    'no-profile-id': {
      label: 'sin pseudónimo',
      hint: 'Nunca se estableció su identidad pseudónima (`profileId`): sus publicaciones no se pueden atribuir con estabilidad.',
    },
    'foreign-doc-id': {
      label: 'id ajeno al uid',
      hint: 'El documento no vive en `profiles/{uid}`: es de una versión anterior. Su email es la única forma de que su dueño lo recupere, así que no se le puede purgar.',
    },
    'legacy-fields': {
      label: 'restos legacy',
      hint: 'Arrastra email o id del gist de juegos en un documento que lee cualquier usuario autenticado.',
    },
    'legacy-token': {
      label: 'token en claro',
      hint: 'Guarda un token de GitHub sin cifrar, legible por cualquier usuario autenticado. Es lo más grave que puede quedar ahí.',
    },
    'stale-schema': {
      label: 'esquema antiguo',
      hint: 'El documento se escribió con una versión anterior del esquema y no se ha vuelto a guardar.',
    },
    'never-active': {
      label: 'sin actividad',
      hint: 'No tiene marca de actividad, así que no aparecería en un directorio ordenado por uso reciente.',
    },
    inactive: {
      label: 'inactivo +30 d',
      hint: 'Más de 30 días sin aparecer: la misma ventana con la que el feed deja de leer la actividad de un amigo.',
    },
    'future-activity': {
      label: 'fecha futura',
      hint: 'Su última actividad está fechada en el futuro: reloj del dispositivo desajustado o marca manipulada.',
    },
    'created-after-activity': {
      label: 'alta posterior a su actividad',
      hint: 'La fecha de alta es posterior a su última actividad, lo que no puede pasar salvo manipulación.',
    },
    'gist-drift': {
      label: 'gist divergente',
      hint: 'Hay más de un gist social suyo en circulación: sus amistades no apuntan todas al mismo (o su perfil aún publica otro). Quien tenga el abandonado no ve sus reseñas en el feed.',
    },
    'games-gist-drift': {
      label: 'listas divergentes',
      hint: 'Sus amistades no coinciden en su gist de juegos: quien tenga el abandonado no puede ver sus listas compartidas. Es un canal distinto del social, así que puede fallar por separado.',
    },
    'stale-pending-out': {
      label: 'solicitudes sin respuesta',
      hint: 'Envió solicitudes que llevan más de 90 días pendientes. A partir de los 180 días se pueden purgar desde su ficha.',
    },
  } satisfies { aria: string } & Record<AdminAnomaly, { label: string; hint: string }>,
  tier: {
    column: 'Rango',
    selectAria: (name: string) => `Rango de ${name}`,
    // Mithril aparece deshabilitado en el resto de filas: se ve que existe y por qué no se puede dar.
    reservedHint: 'Reservado al administrador',
  },
  // Solo queda el nombre accesible de la lista: los encabezados de columna murieron con la tabla, que ahora es
  // una rejilla de fichas donde cada dato lleva su propia etiqueta.
  table: {
    aria: 'Usuarios',
  },
  noName: '(sin nombre)',
  // Identificación de quien tiene el perfil a medias. El correo NO está: se purgó del perfil público a propósito
  // (lo leía cualquier usuario autenticado). Para ponerle cara a un uid, la vía es la consola de Firebase Auth.
  knownAsHint: 'según sus amigos',
  // El uid ya NO se pinta: es una cadena de 28 caracteres con la que no se puede hacer nada en esta pantalla, y
  // repetida en cada ficha tapaba los datos que sí se leen. El botón se queda porque es la única vía para cruzar
  // una ficha con Firebase Auth, que es donde vive el correo. Copiar sigue copiando el uid entero.
  copyUid: 'Copiar identificador',
  copyUidAria: (name: string) => `Copiar el identificador de ${name}`,
  copiedUid: 'Identificador copiado.',
  enabled: 'Social activo',
  disabled: 'Social desactivado',
  never: 'Sin registro',
  legacyNone: 'Limpio',
  legacyEmail: 'email',
  legacyGamesGist: 'gist de juegos',
  legacyToken: 'token en claro',
  legacyAria: 'Restos legacy pendientes de purga',
  // Purga campo a campo: cada uno tiene una consecuencia distinta para su dueño y no son comparables.
  legacyPurgeAria: (field: string, name: string) => `Purgar ${field} de ${name}`,
  legacyEmailLocked: 'Este perfil no se identifica por el uid: su email es la única forma de que su dueño lo recupere, así que no se purga.',
  legacyConfirm: {
    email: (name: string) => `¿Borrar el email del perfil público de ${name}? Deja de ser legible por el resto de usuarios. Su dueño no lo nota: su perfil se localiza por el uid.`,
    gamesGistId: (name: string) => `¿Borrar el id del gist de juegos del perfil público de ${name}? No es un secreto (es un gist público), pero es el respaldo que usa "Recuperar Gist ID": si su configuración privada no lo tiene, tendrá que reintroducirlo a mano en un dispositivo nuevo.`,
    token: (name: string) => `¿Borrar el token de GitHub en claro de ${name}? Hoy lo puede leer cualquier usuario autenticado, así que conviene. Si aún no tiene el respaldo cifrado, la próxima vez que entre en un dispositivo nuevo tendrá que volver a conectar GitHub.`,
  },
  /**
   * BORRAR EL ESPEJO DE LOGROS de un perfil. La confirmación dice las dos cosas que hay que saber antes: que no
   * le quita ningún logro a esa persona (los suyos se derivan de su biblioteca) y que **se deshace solo** en
   * cuanto vuelva a abrir la app, porque la marca de agua vive en su dispositivo.
   */
  achievementsBtn: 'Borrar sus logros publicados',
  achievementsConfirm: (name: string) => `¿Borrar el espejo de logros publicado de ${name}? Sus amistades dejarán de verle medallas y su espejo sale de la muestra del porcentaje comparado. NO pierde ningún logro: los suyos se calculan en su dispositivo. Y volverá a publicarlos la próxima vez que abra la app.`,
  achievementsDone: 'Espejo de logros borrado.',
  disableBtn: 'Desactivar social',
  enableBtn: 'Activar social',
  deleteBtn: 'Borrar perfil',
  working: 'Trabajando...',
  confirmDisable: (name: string) => `¿Desactivar el social de ${name}? Sale del directorio y del feed, pero conserva su perfil y sus amistades.`,
  confirmEnable: (name: string) => `¿Reactivar el social de ${name}?`,
  confirmDelete: (name: string) => `¿Borrar el perfil de ${name}, todas sus amistades y su espejo de logros? No se puede deshacer.`,
  // El espejo de logros se nombra porque VA DENTRO del documento de perfil: `deleteUserProfile` borra el
  // documento entero, así que la vitrina se va con él sin que haya que purgarla aparte. Decirlo evita el susto de
  // creer que hay que borrarla antes, y evita el error contrario: dar por hecho que sobrevive.
  deleteScope: 'Se va también su espejo de logros, que vive dentro del propio perfil. No se borran su configuración privada (token cifrado), su cuenta de Google ni sus gists de GitHub: las reglas los reservan a su dueño. Al volver a entrar se le creará un perfil nuevo, y volverá a publicar sus logros desde su dispositivo.',
  confirmCancel: 'Cancelar',
  confirmAccept: 'Confirmar',
  okTier: (tier: string) => `Rango cambiado a ${tier}.`,
  tierReservedWarning: 'Mithril está reservado a la cuenta del administrador.',
  okDisabled: 'Social desactivado.',
  okEnabled: 'Social reactivado.',
  okPurged: 'Campos legacy purgados.',
  okDeleted: 'Perfil y amistades borrados.',
  partialDeleted: 'Borrado incompleto: revisa la consola para el detalle.',
  errorGeneric: 'No se pudo completar la acción.',
} as const;

/** Moderación de enlaces compartidos, dentro de la ficha de cada usuario en `/admin` (ver §6 del plan). */
export const ADMIN_SHARES_UI = {
  // Con la cuota al lado: la pregunta al mirar esta sección no es cuántos tiene, sino si le queda sitio. Antes
  // había que desplegar, contarlos y acordarse de qué da su rango.
  toggle: (active: number, max: number) => `Enlaces compartidos (${active} de ${max})`,
  /** Sin hueco libre. No es un problema —la cuota funciona—, pero explica que no pueda compartir nada más. */
  full: 'Sin cupo libre',
  bannedBadge: 'Vetado para compartir',
  empty: 'No tiene enlaces activos.',
  open: 'Ver la página',
  expires: (date: Date) => `caduca el ${new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(date)}`,
  remove: 'Retirar enlace',
  reasonLabel: 'Motivo del veto (lo verá el usuario)',
  purgeLabel: 'Retirar también sus enlaces activos',
  ban: 'Vetar para compartir',
  unban: 'Levantar el veto',
  // Cuota individual. Los campos llegan CON la cuota que el usuario tiene ahora mismo, no a cero: a cero no se
  // podía saber qué se estaba cambiando ni desde qué valor, y "0 = sin cambio" obligaba a recordar una convención
  // para no tocar el otro campo. Ahora se edita lo que hay, y para quitar el ajuste hay un botón que lo dice.
  quotaTitle: 'Cuota de enlaces',
  quotaMaxLabel: 'Reseñas compartidas a la vez',
  quotaDaysLabel: 'Días de duración',
  /** Tope del campo: el que da SU rango. Para darle más, se le sube el rango — que es lo que significa el rango. */
  quotaCeiling: (max: number, tier: string) => `Máx. ${max} (${tier})`,
  quotaFromTier: (tier: string) => `Es la cuota de su rango (${tier}).`,
  quotaFromOverride: 'Tiene un ajuste individual: no sigue la cuota de su rango.',
  quotaOverLimit: (max: number, tier: string) => `El máximo de ${tier} es ${max}: para darle más, súbele el rango.`,
  quotaClear: 'Volver a la cuota de su rango',
  quota: 'Aplicar cuota',
  confirmRemove: (gameName: string) => `Retirar el enlace de «${gameName}»`,
  confirmBan: 'Vetar a este usuario (sus enlaces actuales seguirán activos)',
  confirmBanPurge: 'Vetar a este usuario Y retirar todos sus enlaces',
  confirmUnban: 'Levantar el veto de este usuario',
  // Con los valores a la vista: es lo que se va a escribir, y el campo venía relleno con otra cosa.
  confirmQuota: (maxActive: number, ttlDays: number) =>
    `Dejar la cuota de este usuario en ${maxActive} ${maxActive === 1 ? 'reseña compartida' : 'reseñas compartidas'} a la vez y ${ttlDays} ${ttlDays === 1 ? 'día' : 'días'} de duración`,
  confirmQuotaClear: 'Devolver a este usuario la cuota de su rango',
  removed: 'Enlace retirado.',
  banned: (purged: number) => (purged > 0 ? `Usuario vetado y ${purged} enlace(s) retirado(s).` : 'Usuario vetado.'),
  unbanned: 'Veto levantado.',
  quotaSet: 'Cuota ajustada.',
  quotaCleared: 'Ajuste retirado: vuelve a la cuota de su rango.',
  failed: 'La operación no se ha completado.',
} as const;

/**
 * CATÁLOGO DE LOGROS · la vista de revisión del panel de administración.
 *
 * Es una pantalla de LECTURA, y eso no es una limitación: el catálogo es CÓDIGO (`core/achievements/catalog.ts`),
 * no datos: sus métricas son funciones y sus `id` son contrato (§6.4). Lo que hace falta —y no había— es poder
 * leer de un tirón los 261 escalones con sus dos textos al lado, que es la única forma de cazar una condición que
 * desafina o una cifra que no cuadra.
 */
export const ADMIN_ACHIEVEMENTS_UI = {
  open: 'Catálogo de logros',
  title: 'Catálogo de logros',
  subtitle: 'Las escaleras del catálogo con sus escalones, sus dos textos y su medalla, tal como se ven en la app.',
  note: 'Solo lectura: el catálogo vive en el código (`core/achievements/catalog.ts`), donde cada escalera lleva su métrica. Aquí se revisa lo que la gente lee.',
  back: 'Volver al censo',
  sectionAria: 'Catálogo de logros',

  totals: {
    aria: 'Cifras del catálogo',
    ladders: 'Escaleras',
    steps: 'Escalones',
    // En femenino: las tres primeras cifras cuentan ESCALERAS, no escalones, y en masculino se leían como si
    // contaran lo mismo que la casilla de al lado.
    hidden: 'Ocultas',
    retired: 'Retiradas',
  },

  /** Filtro por texto: con 261 escalones, buscar es parte de revisar. */
  filterLabel: 'Buscar en nombres y textos',
  filterPlaceholder: 'Créditos finales, semanas, reseña…',
  filterEmpty: 'Ningún logro coincide con esa búsqueda.',
  matches: (shown: number, total: number) => `${shown} de ${total} escaleras`,

  /** Cabecera de una escalera. La `key` se enseña porque es el prefijo de los `id`, que no se renombran jamás. */
  ladderKey: (key: string) => `key: ${key}`,
  ladderIcon: (icon: string) => `Icono: ${icon}`,
  // SIN «Umbrales: 10 · 25 · 50…» en la cabecera: es exactamente la primera columna de la tabla que va debajo, y
  // repetirla en cada una de las 50 fichas era la línea que más sitio ocupaba sin decir nada nuevo.
  ladderCondition: 'Condición base',
  /** Encabezado de familia: agrupa las 50 escaleras en cinco tramos para que el listado se pueda barrer. */
  familyCount: (count: number) => (count === 1 ? '1 escalera' : `${count} escaleras`),
  // Las tres califican a la ESCALERA, no a un escalón: en masculino se leían como propiedades de la fila de al
  // lado, que es justo la confusión que esta pantalla venía a deshacer.
  descending: 'Menos es mejor',
  hidden: 'Oculta',
  retired: 'Retirada',

  /** Columnas de los escalones. Los dos textos, uno al lado del otro: es lo que se viene a comparar. */
  colStep: 'Escalón',
  // «Alcanzado» no decía por QUIÉN, y en una pantalla que también habla de lo que ve cada usuario se leía como
  // «alcanzado por ti». Lo que hay en esta columna es siempre gente del censo.
  colReached: 'Quién ha llegado',
  colName: 'Nombre',
  colGoal: 'Meta (lo que falta)',
  colDone: 'Hecho (lo conseguido)',
  /**
   * Los mismos dos rótulos, cortos: en móvil la tabla se lee como FICHAS —cinco columnas no caben en 390 px— y
   * cada celda lleva el suyo delante en vez de una cabecera arriba. «Meta (lo que falta)» delante de cada frase
   * ocuparía más que la frase.
   */
  colGoalShort: 'Meta',
  colDoneShort: 'Hecho',
  /** ⚑ Señal de que una escalera se dejó el `done`: el respaldo copia la meta y se lee como una tarea pendiente. */
  sameText: 'Sin texto propio: repite la meta',

  /**
   * ¿El catálogo lo sigue proponiendo? Un retirado no se ofrece, pero se sigue pintando a quien lo tenga.
   *
   * ERA UNA COLUMNA y ahora es una MARCA junto al nombre. De 261 escalones, 259 decían «Sí»: una columna entera
   * de ruido para señalar dos filas. La excepción se marca donde pasa y la regla se calla, que es lo que hace
   * que la excepción se vea.
   */
  notOffered: 'No se ofrece',

  /**
   * Cuánta gente lo tiene, SIEMPRE con su denominador: es la única forma de que «el 4 %» no se lea como una
   * afirmación global cuando la muestra son 25 perfiles.
   */
  reached: (percent: number, holders: number, sample: number) => `${percent} % · ${holders}/${sample}`,
  /**
   * LAS TRES SEÑALES DE LA MUESTRA HABLAN DE GENTE, y sus nombres tienen que decirlo.
   *
   * «Dormido» y «Regalado» describían el escalón como si fuera un estado suyo, y en una pantalla que además
   * decide qué VE cada usuario, «Dormido» se leía como «apagado, no se enseña» — que es justo lo contrario de lo
   * que mide: un escalón al que no ha llegado nadie se sigue ofreciendo a todo el mundo. Lo que se oculta o se
   * ofrece lo dice el interruptor de la escalera, y nada más.
   */
  asleep: 'Nadie ha llegado',
  gift: 'Casi todos lo tienen',
  /** La caída: del escalón anterior a este se pierde a casi todo el mundo. */
  cliff: 'Aquí se cae la gente',
  /**
   * CERRADO PARA TODOS. No es lo mismo que «nadie ha llegado» y por eso no se parece: al que nadie ha llegado se
   * le sigue ofreciendo —es el siguiente reto de quien tiene el de debajo, así que está ABIERTO—, mientras que
   * estos, los de más arriba, no se le enseñan a nadie. En cuanto alguien alcance el de debajo, el primero de
   * ellos se abre para todo el mundo y la línea sube sola.
   */
  unseen: 'Cerrado para todos',

  sampleNote: (sample: number) => `Medido sobre ${sample} espejos publicados del censo.`,

  /**
   * LA APERTURA COMUNITARIA, que es lo único de esta pantalla que decide lo que ve la gente sin que nadie pulse
   * un interruptor. Se publica a mano y no al abrir el panel: es una escritura que cambia el listado de todo el
   * mundo, y hacerla sola por el hecho de mirar sería exactamente lo que no debe pasar.
   */
  frontierTitle: 'Apertura de las escaleras',
  frontierNone: 'Sin espejos que medir, así que no hay nada que abrir: cada usuario ve hasta donde llegue su propio progreso, que es el comportamiento de siempre.',
  frontierSame: (ladders: number) => `Publicada y al día: ${ladders === 1 ? '1 escalera abierta' : `${ladders} escaleras abiertas`} por lo que ha alcanzado la gente.`,
  frontierStale: (ladders: number) => `La medición de ahora abre ${ladders === 1 ? '1 escalera' : `${ladders} escaleras`} y no es la que está publicada: hasta que se publique, la gente ve la anterior.`,
  /**
   * BORRAR TODAS LAS VITRINAS. Es la acción más destructiva de esta pantalla y la única que toca a todo el censo,
   * así que el texto dice qué se lleva por delante y qué NO: nadie pierde un logro, se pierde lo publicado.
   */
  resetAll: 'Borrar todos los logros publicados',
  resetAllConfirm: (profiles: number) => `¿Borrar el espejo de logros de los ${profiles} perfiles del censo y la apertura publicada? Las vitrinas se vacían para todo el mundo y el porcentaje comparado se queda sin muestra. NADIE pierde un logro: los de cada cual se calculan en su dispositivo, y cada uno volverá a publicar el suyo la próxima vez que abra la app.`,
  resetAllDone: (cleared: number) => `Borrados ${cleared} espejos y la apertura publicada.`,
  resetAllFailed: 'No se ha podido borrar. ¿Sesión de administrador iniciada?',
  resetAllWorking: 'Borrando…',
  frontierPublish: 'Publicar la apertura',
  frontierPublishing: 'Publicando…',
  frontierPublished: 'Publicada. Cada usuario la verá al abrir sus logros.',
  frontierFailed: 'No se ha podido publicar. ¿Sesión de administrador iniciada?',

  /**
   * EL INTERRUPTOR DE VERDAD: cambia lo que ve TODO EL MUNDO, no lo que ve el panel.
   *
   * Aquí los logros se enseñan siempre destapados —taparlos en la pantalla de revisión no tiene sentido: es
   * justo donde hay que leer sus textos—. Lo que este botón decide es si la escalera se le esconde a quien AÚN
   * NO LA TIENE; a quien ya consiguió un escalón no se le quita nunca.
   *
   * LOS DOS ESTADOS SE ESCRIBEN ENTEROS, y no con un «a la vista de todos» que era falso por los dos lados:
   * nadie ve la escalera entera —se ofrece de uno en uno— y ocultarla no esconde «un logro», deja a quien no la
   * tiene sin ningún escalón de ella y, por tanto, sin ese reto. Es la consecuencia que hay que tener delante al
   * pulsar, así que se dice en la propia línea de estado en vez de en una leyenda que puede no abrirse.
   */
  show: 'Ofrecerla a todos',
  hide: 'Ocultar hasta conseguirlo',
  hiddenNow: 'Oculta: quien no tiene ningún escalón no ve la escalera, ni el siguiente reto',
  visibleNow: 'Se ofrece: todos ven lo mismo, hasta el primer escalón que nadie ha alcanzado',
  /** El panel escribe en Firestore y la app lo lee al abrir la pantalla: no es instantáneo y se dice. */
  hiddenSaved: 'Guardado. Cada usuario lo verá al abrir sus logros.',
  hiddenFailed: 'No se ha podido guardar. ¿Sesión de administrador iniciada?',
  hiddenSaving: 'Guardando…',

  /**
   * AÑADIR UN ESCALÓN A UNA ESCALERA, sin desplegar y para todo el mundo (§6.4bis). El panel lo guarda en
   * `appConfig`, el catálogo se reconstruye con él dentro y a partir de ahí es un logro como cualquier otro: se
   * desbloquea, cuenta en la fracción y viaja en el espejo. Lo que no puede añadir es una escalera nueva.
   *
   * TRES CORRECCIONES QUE VIENEN DE VERLO EN USO, y las tres van juntas porque son la misma queja:
   *
   *  - la ficha se abre DENTRO de la escalera, debajo del botón. Salía arriba de la pantalla, lejos de la
   *    escalera desde la que se pulsaba, así que escribir un umbral no se veía desde donde estabas y parecía que
   *    el campo no hacía nada;
   *  - se abre VACÍA. Proponía el doble del último escalón y ese número aparecía puesto sin que nadie lo pidiera;
   *  - y el escalón entra al pulsar «Añadir», no al escribir. Entonces se guarda, la tabla lo enseña recolocado
   *    y ahí se queda.
   */
  prepare: (step: number) => `Preparar escalón ${step}`,
  prepareAny: 'Preparar un escalón nuevo',
  prepareField: 'Umbral',
  prepareHelp: 'Escribe un umbral y pulsa Añadir.',
  prepareAdd: 'Añadir',
  prepareTaken: (step: number) => `El umbral ${step} ya existe en esta escalera.`,
  prepareInvalid: 'Escribe un número entero mayor que cero.',
  prepareTitleOf: (key: string) => `Escalones nuevos en «${key}»`,
  prepareCatalog: (steps: string) => `1 · catalog.ts — steps: [${steps}]`,
  prepareMirror: (ids: string) => `2 · mirrorOrder.ts — al FINAL de MIRROR_IDS: ${ids}`,
  prepareTests: (total: [number, number], points: [number, number], bits: [number, number]) =>
    `3 · tests/unit/achievements.test.ts — total ${total[0]} → ${total[1]} · techo ${points[0]} → ${points[1]} · MIRROR_ORDER ${bits[0]} → ${bits[1]}`,
  prepareRename: (name: string) => `Ojo: los escalones por encima corren de romano (${name} y los siguientes).`,
  prepareCopy: 'Copiar los tres pasos',
  prepareCopied: 'Copiado.',
  prepareClose: 'Cerrar',

  /**
   * LOS AÑADIDOS DESDE EL PANEL (§6.4bis). Son catálogo de verdad —se desbloquean, cuentan y viajan— pero no
   * están en el código, y esa diferencia hay que poder verla: la fila se marca, la lista los agrupa, la nota dice
   * exactamente qué son y el «ya en el código» cierra el ciclo cuando alguien los consolida.
   */
  extraTitle: 'Añadidos desde el panel',
  extraFlag: 'del panel',
  extraTaken: (step: number) => `El umbral ${step} ya lo añadió el panel a esta escalera.`,
  extraRemove: (step: number) => `Quitar ${step}`,
  extraInCode: 'ya en el código',
  /**
   * CORREGIR UN UMBRAL QUE SE ESCRIBIÓ MAL. Es quitar y añadir en un solo guardado —el `id` de un escalón es su
   * umbral, así que cambiar el número cambia el `id`— y por eso pide exactamente la misma condición que quitar:
   * solo mientras no lo tenga nadie. Existe porque equivocarse escribiendo un número es lo más fácil de esta
   * pantalla, y hacerlo en dos viajes dejaba el catálogo un rato con el umbral equivocado dentro.
   */
  extraEdit: (step: number) => `Corregir ${step}`,
  extraEditLabel: (id: string) => `Nuevo umbral para ${id}`,
  extraEditSave: 'Guardar',
  extraEditCancel: 'Cancelar',
  extraEditNote: 'Corregir un umbral cambia el `id` del escalón: es quitar el anterior y añadir otro en un solo guardado.',
  extraSaving: 'Guardando…',
  extraFailed: 'No se ha podido guardar. ¿Sesión de administrador iniciada?',
  extraNote: 'En vigor para todo el mundo: se puede desbloquear, cuenta en la fracción y viaja en el espejo por su `id`. No añade escaleras nuevas —la métrica de una escalera es código—, solo escalones de las que ya existen.',
  /**
   * QUITAR O CORREGIR UN UMBRAL QUE YA TIENE ALGUIEN RETIRA SU MEDALLA, y eso es lo único que el §6.4 no
   * permite: corregir cambia el `id`, así que por debajo es quitarlo. Los dos botones desaparecen en cuanto la
   * muestra dice que alguien lo tiene, y se explica por qué en su sitio.
   */
  extraLocked: 'Ya lo tiene alguien: quitarlo o corregirlo le retiraría la medalla (§6.4). Para dejar de ofrecerlo hay que marcarlo retirado en el código.',
  /** Consolidar en el código es OPCIONAL: le da su bit en el espejo y deja de viajar por la cola. */
  codeTitle: 'Consolidarlo en el código (opcional: le da su bit en el espejo)',
  /** El nombre que tenía un escalón antes de que el añadido le corriera el romano. */
  previewMoved: (before: string) => `antes: ${before}`,

  /**
   * EL ESQUEMA. Va plegado: se abre la primera vez y no vuelve a estorbar.
   *
   * ABRE CON LA REGLA DE QUÉ SE VE, y no con la primera columna, porque es la que no se deduce mirando la
   * pantalla y la que hacía leer mal todo lo demás: sin ella, «nadie ha llegado» se entiende como «no se enseña»,
   * y no tienen nada que ver. Un escalón al que no llega nadie se sigue ofreciendo; lo único que decide qué se
   * enseña es el interruptor de la escalera.
   */
  legendTitle: 'Qué significa cada dato',
  legend: [
    ['Qué ve cada usuario', 'LO MISMO QUE TODOS. En cuanto un usuario ve un escalón, ese escalón queda abierto para todo el mundo, así que la escalera se enseña igual a quien empieza que a quien va en cabeza. Lo que cambia de una persona a otra es lo que lleva CONSEGUIDO, no la lista. La línea es el primer escalón al que no ha llegado nadie: ese se ofrece (es el reto del que va delante) y de ahí para arriba no se enseña nada todavía. Así nadie se queda sin un reto a la vista y nadie ve una escalera entera de golpe.'],
    ['Ocultar hasta conseguirlo', 'El interruptor de cada escalera. Ocultarla la retira ENTERA para quien no tiene ningún escalón suyo: ni la escalera, ni el siguiente reto, ni un hueco con un «?». A quien ya tiene un escalón no se le quita nunca, y ni los puntos ni el espejo publicado se mueven. Es la forma de que un logro sea una sorpresa, al precio de que deje de tirar de nadie.'],
    ['Escalón', 'El umbral que hay que alcanzar. Es también lo que lleva el `id` del logro (`completados-50`), y por eso no se renombra nunca.'],
    ['Nombre', 'Lo que ve la gente, con su grado en romano. El romano sale de la POSICIÓN dentro de la escalera, así que insertar un escalón renumera los de arriba.'],
    ['No se ofrece', 'El catálogo ya no lo propone: un retirado deja de ofrecerse y de contar en la fracción, y tampoco gasta el turno del siguiente reto. Se sigue pintando a quien ya lo tenga. Solo se marca la excepción; lo normal es que se ofrezca.'],
    ['Quién ha llegado', 'Qué parte de la GENTE lo tiene, medido sobre los espejos publicados del censo. No tiene nada que ver con lo que se le enseña a cada uno. Siempre con su denominador: con 43 espejos, «2 %» es una persona.'],
    ['Nadie ha llegado', 'El PRIMER escalón de la escalera al que no ha llegado ninguna persona del censo: la frontera de lo que hoy está en juego. Se sigue ofreciendo con normalidad —es el siguiente reto de quien tiene el de debajo—, así que esto no lo esconde.'],
    ['Cerrado para todos', 'Los escalones POR ENCIMA de esa frontera, marcados con un raíl en el canto de la fila: no se le enseñan a nadie, ni al que va en cabeza. En cuanto alguien alcance el anterior, el primero de ellos se abre para todo el mundo y la línea sube sola. Con la escalera OCULTA son todos los que nadie tiene: ahí no se abre ninguno.'],
    ['Casi todos lo tienen', 'Lo tiene el 90 % o más de la gente. No mide nada: se consigue por estar aquí.'],
    ['Aquí se cae la gente', 'Del escalón anterior a este se pierde a casi todo el mundo: el paso es demasiado grande y en medio cabe un intermedio.'],
    ['Meta / Hecho', 'Los dos textos del escalón: lo que se pide cuando te falta y lo que se cuenta cuando ya lo tienes.'],
    ['key', 'El prefijo de los `id` de la escalera. Es contrato: no se renombra jamás.'],
  ] as const,
  /** Sin espejos no se inventa un 0 %: se dice por qué no hay muestra. */
  noSample: 'Todavía no hay espejos publicados que medir (la publicación del espejo está apagada), así que no se puede decir cuánta gente tiene cada escalón. Lo demás sí se lee.',
  /** Cifra de cabecera: escalones a los que no ha llegado nadie del censo. Nombrada por lo que cuenta. */
  asleepTotal: 'Sin nadie',

  families: {
    mirror: 'Espejo',
    data: 'Fichas',
    social: 'Social',
    annual: 'Anual',
    onboarding: 'Primeros pasos',
  },
} as const;

/**
 * EL AVISO A LOS USUARIOS (`/admin` → «Avisos»). La pantalla donde se redacta lo que verá todo el mundo al abrir
 * la app: un rótulo, un título, una descripción, un icono y el enlace a donde se les quiere llevar.
 *
 * LOS TEXTOS DE ESTA PANTALLA EXPLICAN EL CANAL, y no por ser didácticos: quien escribe aquí tiene que saber
 * que esto NO es una notificación del móvil (no hay Web Push), que la cuenta de veces es por dispositivo y que
 * un aviso publicado tarda un rato en llegar a quien ya tenía la app abierta. Sin eso, el primer aviso se
 * escribe esperando otra cosa.
 */
export const ADMIN_ANNOUNCEMENT_UI = {
  open: 'Aviso a los usuarios',
  title: 'Aviso a los usuarios',
  subtitle: 'Un rótulo, un título, una descripción y un enlace. Se dice en la misma cápsula que los logros, abajo a la izquierda, al abrir la app.',
  back: 'Volver al censo',
  sectionAria: 'Aviso a los usuarios',

  /** Las tres cosas que hay que saber antes de escribir. Se dicen aquí y no en un README que nadie tiene delante. */
  notes: [
    'No es una notificación del sistema: esta app no tiene notificaciones push, así que el aviso se ve cuando alguien abre la aplicación, no antes.',
    'Lo ve todo el mundo, con cuenta o sin ella: el aviso se sirve desde la propia web, no desde Firestore, así que abrir la app no contacta con nadie de fuera.',
    'La cuenta de «veces que se ha dicho» es de cada dispositivo. Quien use móvil y ordenador lo verá en los dos, y pulsar el enlace lo calla solo en el aparato donde se pulsó.',
    'Un aviso recién guardado tarda unos minutos en llegar a quien ya tenía la app abierta: la respuesta se sirve de caché para no pedirla en cada apertura.',
  ] as const,

  field: {
    kicker: 'Rótulo',
    kickerHelp: 'La línea pequeña de arriba, en versalitas. Si se deja en blanco pone «Aviso».',
    title: 'Título',
    titleHelp: 'La línea gorda. Una sola línea: lo que no quepa se recorta.',
    body: 'Descripción',
    bodyHelp: 'Hasta dos líneas. Es lo que explica de qué va.',
    url: 'Enlace',
    urlHelp: 'A dónde lleva al pulsar. Tiene que empezar por https:// (o http://) y se abre en otra pestaña.',
    icon: 'Icono',
    iconHelp: 'Ocupa el sitio de la medalla. Son iconos que ya están en la app.',
    active: 'Encendido',
    activeHelp: 'Apagado no se le enseña a nadie, pero el texto se queda guardado para la próxima.',
    repeats: 'Veces que se insiste',
    repeatsHelp: 'Como máximo, y solo mientras nadie pulse el enlace.',
    interval: 'Horas entre avisos',
    intervalHelp: 'Lo que se espera desde la última vez que se le dijo a ese dispositivo. 24 = una vez al día.',
  },

  /** Nombres de los iconos que se pueden elegir. Se escriben porque un desplegable de dibujos no se lee en voz alta. */
  iconNames: {
    bell: 'Campana',
    star: 'Estrella',
    rocket: 'Cohete',
    'share-nodes': 'Enlace',
    trophy: 'Trofeo',
    'dice-d20': 'Dado',
    'checkered-flag': 'Meta',
    signature: 'Firma',
  } as Record<string, string>,

  previewTitle: 'Así se va a ver',
  previewNote: 'Es la cápsula de verdad, con el tema y la paleta que tengas puestos ahora mismo.',
  /**
   * Lo que enseña la muestra mientras el campo está vacío. NO se guarda: solo evita que la cápsula empiece
   * siendo un disco suelto —sin forma que juzgar— justo cuando hay que decidir si el texto cabe.
   */
  sampleTitle: 'Título del aviso',
  sampleBody: 'Aquí va la descripción, que puede ocupar dos líneas.',

  /** Los dos botones de guardar, separados porque hacen dos cosas muy distintas (ver `Announcement.id`). */
  save: 'Guardar cambios',
  saveHelp: 'Corrige el aviso en curso. A quien ya se lo dijimos las veces acordadas, o ya pulsó, no se le vuelve a decir.',
  republish: 'Publicar como aviso nuevo',
  republishHelp: 'Empieza de cero: vuelve a decírselo a TODO el mundo, incluido quien ya lo pulsó.',
  republishConfirm: 'Se le volverá a enseñar a todo el mundo, incluido quien ya lo había pulsado. ¿Publicar como aviso nuevo?',
  retire: 'Apagar',
  retireHelp: 'Deja de enseñarse. El texto no se borra.',
  turnOn: 'Encender',

  saving: 'Guardando…',
  saved: 'Guardado.',
  savedNew: 'Publicado como aviso nuevo: vuelve a salirle a todo el mundo.',
  retired: 'Apagado: ya no se le enseña a nadie.',
  failed: 'No se ha podido guardar. Vuelve a intentarlo.',

  /** Lo que falta para poder guardar. Se dice campo a campo, no como un «formulario inválido». */
  needTitle: 'Hace falta un título.',
  needUrl: 'Hace falta un enlace que empiece por https:// o http://.',

  /** Estado del aviso que hay ahora mismo en Firestore. */
  currentOn: 'Encendido ahora mismo.',
  currentOff: 'Apagado ahora mismo.',
  currentNone: 'Todavía no hay ningún aviso publicado.',
  currentSaved: (date: string) => `Última vez guardado: ${date}.`,
  currentId: (id: string) => `Campaña: ${id}`,
  counter: (used: number, max: number) => `${used}/${max}`,
} as const;
