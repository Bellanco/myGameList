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
  back: 'Volver a mis listas',
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
  disableBtn: 'Desactivar social',
  enableBtn: 'Activar social',
  deleteBtn: 'Borrar perfil',
  working: 'Trabajando...',
  confirmDisable: (name: string) => `¿Desactivar el social de ${name}? Sale del directorio y del feed, pero conserva su perfil y sus amistades.`,
  confirmEnable: (name: string) => `¿Reactivar el social de ${name}?`,
  confirmDelete: (name: string) => `¿Borrar el perfil de ${name} y todas sus amistades? No se puede deshacer.`,
  deleteScope: 'No se borran su configuración privada (token cifrado), su cuenta de Google ni sus gists de GitHub: las reglas los reservan a su dueño. Al volver a entrar se le creará un perfil nuevo.',
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
