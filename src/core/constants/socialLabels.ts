// Textos de la interfaz del ESPACIO SOCIAL, en su propio módulo.
//
// Estaban en `labels.ts` con el resto de la interfaz, y ahí eran 8 kB comprimidos que viajaban en el chunk de
// ARRANQUE de todo el mundo —incluido quien nunca abre el hub—, porque `labels.ts` lo importa media aplicación.
// El único cordón que los ataba al arranque era `SocialHubSkeleton` (el fallback del `Suspense`, que sí tiene que
// estar cargado de antemano) y sus tres cadenas: por eso esas tres viven ahora en `socialShell`, y todo lo demás
// aquí, en el chunk perezoso del hub.
//
// REGLA para quien añada textos: si un módulo del arranque necesita algo de aquí, NO lo importe de aquí. O va a
// `socialShell` (si de verdad es del armazón) o se pasa por props. Importar `SOCIAL_UI` desde código estático
// devuelve los 8 kB al arranque de todos y rompe el presupuesto de `ci-validate`.
import type { TabId } from '../../model/types/game';
import type { PaletteId } from './palettes';
import { SOCIAL_SHELL } from './socialShell';

// Igual que `APP_ERROR_LEAD`, pero para el hub social: lo que ha caído es la parte de GENTE (amistades, feed,
// reseñas compartidas), así que cada tema lo cuenta con su forma de quedarse sin compañía o sin comunicación.
const SOCIAL_ERROR_LEAD: Record<PaletteId, string> = {
  // Las salas de espera del multijugador, que es lo más social que tiene un cliente de juegos.
  steam: 'La sala se ha quedado vacía.',
  // Persona 5: los Confidentes son los vínculos que cultivas, y se llevan por teléfono.
  persona: 'Tus Confidentes no cogen el teléfono.',
  // Portal: el Cubo de Compañía, la única compañía que dan las pruebas.
  portal: 'El Cubo de Compañía no ha venido.',
  // Cyberpunk 2077: sin red no hay Night City, y todo pasa por la red.
  cyberpunk: 'Night City se ha quedado sin red.',
  // Warhammer 40.000: los astrópatas son quienes llevan los mensajes entre mundos.
  grimdark: 'El astrópata ha perdido la señal.',
  // Sea of Stars: acampar con el grupo es donde el viaje se vuelve compañía.
  seaofstars: 'Nadie ha llegado al campamento.',
};

// SIN CONEXIÓN, que no es lo mismo que un error: la aplicación arranca y las listas funcionan igual (el service
// worker sirve el shell y los chunks desde su caché), pero el espacio social vive de la red y solo puede mostrar
// lo último que se guardó aquí. Antes esto salía como `network offline` o `Failed to fetch` —el error de la
// librería, en crudo—, y eso es lo que estas líneas sustituyen. Mismo formato que los otros titulares: el guiño
// del tema INTEGRADO en la frase, y debajo qué está pasando de verdad.
const SOCIAL_OFFLINE_LEAD: Record<PaletteId, string> = {
  // Un cliente de juegos sin conexión no entra a la sala: se queda intentando conectar con el servidor.
  steam: 'No hay conexión con el servidor.',
  // Persona 5: a los Confidentes se les llama por teléfono, y sin cobertura no hay llamada que hacer.
  persona: 'No hay cobertura para llamar a tus Confidentes.',
  // Portal: un portal necesita sus DOS extremos; con uno solo no lleva a ninguna parte.
  portal: 'Falta el otro extremo del portal.',
  // Cyberpunk 2077: en Night City todo pasa por el enlace a la red, y sin enlace no hay ciudad.
  cyberpunk: 'Te has quedado sin enlace a la red.',
  // Warhammer 40.000: los mensajes entre mundos viajan por la Disformidad, y la Disformidad se los traga.
  grimdark: 'La Disformidad se ha tragado la señal.',
  // Sea of Stars: el campamento sigue ahí; lo que no hay ahora mismo es camino para llegar.
  seaofstars: 'El camino al campamento está cortado.',
};

export const SOCIAL_UI = {
  // Las tres del armazón salen de `socialShell`, que es lo único de aquí que el arranque puede cargar (lo usa el
  // esqueleto del `Suspense`). Repetirlas aquí sería invitarlas a divergir.
  hubTitle: SOCIAL_SHELL.hubTitle,
  loading: SOCIAL_SHELL.loading,
  screenAria: SOCIAL_SHELL.screenAria,
  // Aviso PERSISTENTE de falta de conexión (no un mensaje que se borra a los tres segundos): mientras no hay red
  // no hay nada que reintentar, así que se queda a la vista y desaparece solo cuando la red vuelve.
  offline: {
    sectionAria: 'Sin conexión',
    leadByPalette: SOCIAL_OFFLINE_LEAD,
    // Con datos guardados en este dispositivo: se ve el espacio social tal y como quedó.
    body: 'Estás viendo lo último que se guardó en este dispositivo. Se actualizará al recuperar la red.',
    // Sin nada guardado todavía (nunca se abrió el espacio social aquí, o se limpió el almacenamiento).
    bodyEmpty: 'Aquí todavía no hay nada guardado. En cuanto vuelva la red aparecerá la actividad.',
    badge: 'Sin conexión',
  },
  errorBoundary: {
    sectionAria: 'Error del espacio social',
    // Mismo formato que la pantalla raíz: el guiño del tema en grande —aquí sobre lo que ha caído, que es la
    // parte de gente— y debajo, atenuado, lo que de verdad hay que saber. El titular SÍ se ve y sigue siendo
    // un encabezado de sección de verdad; el contexto («error del espacio social») lo da el `aria-label`.
    titleByPalette: SOCIAL_ERROR_LEAD,
    body: 'El resto de la aplicación sigue disponible.',
    retry: 'Reintentar',
    // El reintento sigue limitado (1 cada 15 min) para no reintentar de forma indiscriminada ante un fallo
    // persistente, pero la espera no se cuenta en pantalla: ni cuenta atrás en el botón ni nota al pie, que
    // solo transmiten castigo. El botón se apaga, y quien use lector de pantalla lo oye por este `aria-label`.
    retryBlockedAria: 'Reintentar (no disponible todavía)',
  },
  cardSelector: {
    searchLabel: 'Buscar',
    searchAria: (title: string) => `${title} buscador`,
    cardsAria: (title: string) => `${title} cards`,
  },
  gateway: {
    actionsAria: 'Acciones principales social',
    progressAria: 'Progreso de configuración social',
    stepsAria: 'Pasos de configuración social',
    stateAria: 'Estado de configuración social',
    flowAria: 'Flujo social',
    lead: 'Configura tu espacio social en tres pasos: conecta GitHub, valida con Google y crea tu espacio social.',
    stepCaption: (current: number, total: number) => `Paso actual: ${current} de ${total}`,
    progress: (value: number) => `${value}% completado`,
    connectSync: 'Ir a Sincronización',
    signIn: 'Continuar con Google',
    signingIn: 'Validando identidad...',
    resolveProfile: 'Comprobando perfil social...',
    createGist: 'Crear espacio social',
    creatingGist: 'Creando espacio social...',
    enterSocial: 'Entrar a la actividad',
    signOut: 'Cerrar sesión',
    syncRequired: 'Activa primero la sincronización principal con GitHub para habilitar el espacio social.',
    signInRequired: 'Tu sincronización principal está activa. Continúa con Google para validar tu perfil social.',
    gistRequired: 'Se ha verificado Firestore. Si no existe gist social asociado, crea un espacio social nuevo.',
    gistReadySignIn: 'Ya tienes gist social enlazado. Inicia sesión con Google para acceder a la actividad.',
    gistMissing: 'Aún no hay gist social enlazado.',
    detailsSummary: 'Ver estado técnico',
    stateSync: 'Sincronización',
    stateGist: 'Espacio social',
    stateSession: 'Sesión Google',
    stateConnected: 'Conectada a GitHub',
    stateNotConnected: 'No conectada',
    stateLinked: 'Enlazado',
    stateNotLinked: 'No enlazado',
    stateActive: 'Activa',
    stateNotStarted: 'No iniciada',
    flow: ['1. GitHub', '2. Google', '3. Espacio social', '4. Actividad'],
  },
  feed: {
    sectionAria: 'Social',
    title: 'Actividad social',
    subtitle: 'Descubre perfiles públicos, análisis y recomendaciones destacadas de otros jugadores.',
    actionsAria: 'Acciones de la actividad',
    activityListAria: 'Actividad social',
    toolbarAria: 'Búsqueda y filtros de la actividad',
    feedRowAria: 'Actividad social',
    profile: 'Editar mi perfil',
    openProfiles: 'Ver perfiles',
    openOwnProfile: 'Ver mi perfil',
    openRequests: 'Solicitudes',
    openRequestsAria: (count: number) =>
      count > 0 ? `Solicitudes de amistad, ${count} pendiente${count === 1 ? '' : 's'}` : 'Solicitudes de amistad',
    refresh: 'Actualizar',
    refreshing: 'Actualizando...',
    signOut: 'Cerrar sesión',
    statsProfiles: 'Perfiles visibles',
    statsActivities: 'Eventos de actividad',
    sectionTitle: 'Actividad de perfiles',
    activityTitle: 'Actividad',
    postsTitle: 'Publicaciones',
    postComposerLabel: 'Comparte una noticia o un enlace',
    postPlaceholder: 'Comparte una noticia o un enlace…',
    postPublish: 'Publicar',
    postPublishing: 'Publicando...',
    // Cupo por rango. El contador replica el de las reseñas (conteo visible + aviso solo en los umbrales).
    postCharCount: (count: number, max: number) => `${count.toLocaleString()} / ${max.toLocaleString()} caracteres`,
    postCharNearLimit: 'Te acercas al límite de caracteres de la publicación.',
    postCharLimitReached: 'Has alcanzado el límite de caracteres de la publicación.',
    postSharedFileHint: 'Pega la URL directa de la imagen (clic derecho → «Copiar la URL de la imagen») para verla incrustada.',
    // Recorte de publicaciones largas en el feed: el cupo por rango llega a 100.000 caracteres, y sin recorte una
    // sola publicación ocupa el feed entero. Nada se pierde: se despliega en la propia tarjeta.
    postExpand: 'Ver más',
    postCollapse: 'Ver menos',
    postedAt: (date: Date) =>
      `Publicado el ${date.toLocaleDateString('es-ES', { day: '2-digit' })} de ${date.toLocaleDateString('es-ES', { month: 'long' })} a las ${date.toLocaleTimeString('es-ES', { hour: 'numeric', minute: '2-digit' })}`,
    loading: 'Cargando actividad...',
    empty: 'No hay perfiles visibles todavía o faltan permisos de lectura en Firestore.',
    activityEmpty: 'Aún no hay actividad de análisis para mostrar.',
    activityEmptyNoFriends: 'Tu feed muestra la actividad de tus amigos. Descubre perfiles y añade amigos para empezar a ver sus análisis y publicaciones.',
    discoverFriends: 'Descubre y añade amigos',
    openActivityAria: (name: string, gameName: string) => `Abrir detalle de actividad de ${name} sobre ${gameName}`,
    openProfileAria: (name: string) => `Abrir perfil social de ${name}`,
    analyzedRecently: 'Analizado recientemente',
    feedLoadMore: 'Mostrar más',
    analyzedAt: (date: Date) =>
      `Analizado el ${date.toLocaleDateString('es-ES', { day: '2-digit' })} de ${date.toLocaleDateString('es-ES', { month: 'long' })} a las ${date.toLocaleTimeString('es-ES', { hour: 'numeric', minute: '2-digit' })}`,
    // F4 — movimientos de lista. La tarjeta es UNA LÍNEA: nombre, verbo, juego y hora. No lleva nota ni texto, así
    // que la frase ES la tarjeta, y por eso el verbo va en minúscula: se lee seguido del nombre («Ada terminó…»),
    // no como un titular. En pasado, porque cuenta algo que ya pasó.
    moveHeadline: {
      c: 'terminó',
      v: 'dejó',
      e: 'empezó',
      p: 'apuntó',
    } as Record<TabId, string>,
    // Solo la HORA en la tarjeta: el día ya lo dice la cabecera del grupo, y repetirlo era la línea que más peso
    // le daba a un mensaje que debe pesar poco. La fecha completa sigue disponible al pasar el ratón.
    movedAtHour: (date: Date) => date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    movedAt: (date: Date) =>
      `El ${date.toLocaleDateString('es-ES', { day: '2-digit' })} de ${date.toLocaleDateString('es-ES', { month: 'long' })} a las ${date.toLocaleTimeString('es-ES', { hour: 'numeric', minute: '2-digit' })}`,
    moveRecently: 'Hace poco',
    // El nombre del juego abre el detalle de la reseña de su autor cuando existe; si no, es texto y no se ofrece
    // el gesto. El aria-label lo dice con todas las letras porque el color y el subrayado no llegan a un lector.
    openMoveReviewAria: (name: string, gameName: string) => `Ver el análisis de ${name} sobre ${gameName}`,
    reviewHeadline: (gameName: string) => `Analizó ${gameName}`,
    reviewEmpty: 'Sin comentario adicional en el análisis.',
    showMore: 'Más',
    viewDetail: 'Ver detalle',
    detailTitle: 'Detalle de actividad social',
    detailSubtitle: 'Contenido completo del análisis seleccionado.',
    detailActionsAria: 'Acciones del detalle social',
    detailMissing: 'No se encontró la actividad solicitada o ya no está disponible.',
    metadataPlatforms: 'Plataformas:',
    metadataGenres: 'Géneros:',
    metadataStrengths: 'Puntos fuertes:',
    metadataWeaknesses: 'Puntos débiles:',
    profileDetailTitle: 'Detalle de perfil social',
    profileDetailSubtitle: 'Vista pública del perfil seleccionado.',
    profileDetailActionsAria: 'Acciones del detalle de perfil social',
    profileDetailMissing: 'No se encontró el perfil solicitado o ya no está disponible.',
    profileListsTitle: 'Juegos',
    roulettePick: 'Elige tu próximo juego',
    profileListsEmpty: 'Este perfil no ha publicado listados todavía.',
    profileFriendsOnly: 'Hazte amigo de este jugador para ver sus reseñas, listados y recomendaciones.',
    profileFriendsOnlyTitle: 'Perfil de amigos',
    gameFilterPlaceholder: 'Filtrar por título…',
    gameFilterEmpty: 'Ningún juego coincide con la búsqueda.',
    profileDetailRefresh: 'Actualizar listados',
    profileDetailRefreshing: 'Actualizando…',
    reviewsButton: 'Reseñas',
    reviewsBack: 'Ver perfil',
    reviewsTitle: 'Reseñas',
    reviewsEmptyProfile: 'Este perfil no ha publicado reseñas todavía.',
    reviewExpand: 'Ver más',
    reviewCollapse: 'Ver menos',
    reviewOpenAria: (gameName: string) => `Abrir la reseña de ${gameName}`,
    reviewDetailTitle: 'Reseña',
    reviewDetailSubtitle: 'Análisis completo de este juego.',
    reviewsBackToList: 'Volver a las reseñas',
    profileListTabCompleted: 'Completados',
    profileListTabVisited: 'Abandonados',
    profileListTabPlaying: 'En curso',
    profileListTabPlanned: 'Próximos',
    backToFeed: 'Volver a la actividad',
    searchLabel: 'Buscar perfiles',
    searchPlaceholder: 'Buscar por nombre, email o juego',
    filterAll: 'Todos',
    resultCount: (count: number) => `${count} perfiles visibles`,
  },
  profiles: {
    sectionAria: 'Perfiles sociales',
    title: 'Perfiles',
    subtitle: 'Descubre perfiles públicos de otros jugadores.',
    actionsAria: 'Acciones de la pantalla de perfiles',
    toolbarAria: 'Filtro de perfiles por nombre',
    rowAria: 'Perfiles públicos',
    back: 'Volver a la actividad',
    refresh: 'Actualizar',
    refreshing: 'Actualizando...',
    searchLabel: 'Buscar por nombre',
    searchPlaceholder: 'Filtrar perfiles por nombre',
    resultCount: (count: number) => `${count} perfiles visibles`,
    loading: 'Cargando perfiles...',
    empty: 'No hay perfiles visibles todavía o faltan permisos de lectura en Firestore.',
    openProfileAria: (name: string) => `Abrir perfil social de ${name}`,
    friendsTitle: 'Amigos',
    othersTitle: 'Descubrir',
    // El recuento por sección se muestra porque con muchos amigos es la única forma de saber a qué te enfrentas
    // antes de empezar a bajar: la rejilla, al no tener scroll propio, no da ninguna pista de su tamaño.
    sectionLabel: (title: string, count: number) => `${title} · ${count}`,
    sectionGroupAria: (title: string, count: number) => `${title}: ${count} perfiles`,
    // Paginación: se muestra cuánto queda, no solo que hay más. "Mostrar más" a secas obliga a pulsar para
    // averiguar si quedan 3 o 300.
    showMore: (remaining: number) => `Mostrar más (quedan ${remaining})`,
    friendsEmpty: 'Aún no tienes amigos. Envía una petición desde la lista de abajo.',
    othersEmpty: 'No hay más perfiles que mostrar.',
  },
  requests: {
    sectionAria: 'Solicitudes de amistad',
    title: 'Solicitudes de amistad',
    subtitle: 'Gestiona las peticiones que recibes y las que has enviado.',
    actionsAria: 'Acciones de solicitudes de amistad',
    back: 'Volver a la actividad',
    incomingTitle: 'Recibidas',
    outgoingTitle: 'Enviadas',
    friendsTitle: 'Amigos',
    incomingEmpty: 'No tienes peticiones de amistad pendientes.',
    outgoingEmpty: 'No has enviado peticiones pendientes.',
    friendsEmpty: 'Aún no tienes amigos. Envía peticiones desde Perfiles.',
    loading: 'Cargando solicitudes...',
    accept: 'Aceptar',
    reject: 'Rechazar',
    cancel: 'Cancelar',
    remove: 'Dejar de ser amigos',
    acceptAria: (name: string) => `Aceptar la petición de ${name}`,
    rejectAria: (name: string) => `Rechazar la petición de ${name}`,
    cancelAria: (name: string) => `Cancelar la petición enviada a ${name}`,
    removeAria: (name: string) => `Dejar de ser amigo de ${name}`,
    unknownUser: 'Usuario',
  },
  friendship: {
    add: 'Añadir amigo',
    accept: 'Aceptar',
    pending: 'Pendiente',
    friends: 'Amigos',
    remove: 'Dejar de ser amigos',
    addAria: (name: string) => `Enviar petición de amistad a ${name}`,
    acceptAria: (name: string) => `Aceptar la petición de ${name}`,
    cancelAria: (name: string) => `Cancelar la petición enviada a ${name}`,
    removeAria: (name: string) => `Dejar de ser amigo de ${name}`,
    removeConfirmTitle: (name: string) => `¿Dejar de ser amigo de ${name}?`,
    removeConfirmAction: 'Dejar de ser amigos',
  },
  profile: {
    sectionAria: 'Social',
    actionsAria: 'Acciones del perfil social',
    title: 'Mi perfil social',
    subtitle: 'Define tu identidad pública y mantén tu perfil sincronizado.',
    toFeed: 'Ir a la actividad',
    save: 'Guardar perfil',
    saving: 'Guardando perfil...',
    signOut: 'Cerrar sesión',
    statusSynced: 'Sincronizado',
    statusUnpublished: 'Sin publicar',
    identityTitle: 'Identidad visible',
    identityDescription: 'Este nombre se mostrará en la actividad social y en análisis compartidos.',
    nameLabel: 'Nombre social',
    namePlaceholder: 'Escribe tu nombre visible',
    needsCompletedGames: 'Necesitas al menos un juego completado en tus listas para poder crear tu perfil social.',
    privacyTitle: 'Privacidad',
    privacyLabel: 'Perfil privado',
    privacyPrivate: 'Tu perfil es privado. Solo usuarios autorizados podrán verlo.',
    privacyPublic: 'Tu perfil es público. Otros usuarios podrán encontrarte por email.',
    hydrating: 'Cargando datos de perfil desde gist social...',
    visibilityTitle: 'Visibilidad del perfil',
    visibilityDescription: 'Configura qué partes de tus listados se comparten públicamente en el detalle social.',
    hideListSectionTitle: 'Ocultar listados',
    hideVisitedList: 'Ocultar lista de abandonados',
    hidePlayingList: 'Ocultar lista de en curso',
    hidePlannedList: 'Ocultar lista de próximos',
    hideFieldSectionTitle: 'Ocultar campos',
    hideReplayableField: 'Rejugar',
    hideRetryField: 'Dar otra oportunidad',
    hideGameTimeField: 'Tiempo jugado',
    photoSectionTitle: 'Foto de perfil',
    showPhotoField: 'Mostrar mi foto de perfil',
    // Por qué el interruptor está apagado y bloqueado. Una línea: el estado del interruptor ya dice lo demás, y la
    // consecuencia (nadie le ve la cara, y por reciprocidad él tampoco) no necesita explicarse aquí.
    photoMissingInGoogle: 'Tu cuenta no tiene foto.',
    // El caso de quien NUNCA subió una: Google le pone su inicial en un círculo de color. La cuenta tiene imagen,
    // así que decirle "no tienes foto" sonaría a error de la app; lo que hay que decirle es que eso no es una foto.
    photoIsGoogleDefault: 'La imagen de tu cuenta es la inicial que genera Google, no una foto.',
    // F4 — filtro de los mensajes de lista del feed. Va en un bloque APARTE del de visibilidad, y el texto lo dice
    // en la primera frase: esto no esconde nada a nadie, decide lo que ve quien lo toca. Confundirlo con un
    // control de privacidad sería lo peor que podría pasar aquí.
    moveFeedTitle: 'Movimientos en tu actividad',
    moveFeedDescription:
      'Solo para ti: elige de qué listas quieres ver los avisos de «empezó», «terminó», «dejó» o «apuntó» en la actividad. No cambia lo que ven los demás, y se aplica al instante.',
    moveFeedSectionTitle: 'Mostrarme movimientos de',
    // Los nombres de las listas NO se repiten aquí: son los de `TAB_TOOLTIPS`, en este mismo módulo. Duplicarlos
    // era además la vía directa a que un día dijeran cosas distintas en dos sitios.
    // Cuando están las cuatro apagadas: el feed sigue ahí (reseñas y publicaciones), solo se van los movimientos.
    moveFeedAllOff: 'No verás ningún movimiento de listas en la actividad. Las reseñas y las publicaciones siguen apareciendo.',
  },
  status: {
    // Sustituye a los mensajes de red en crudo (`network offline`, `Failed to fetch`, «client is offline»): un
    // fallo de red no es un error del que el usuario tenga que hacer nada, solo esperar a tener conexión.
    offline: 'Sin conexión: la actividad social se actualizará al recuperar la red.',
    needMainSync: 'Activa la sincronización principal para continuar.',
    needGoogleBeforeCreate: 'Inicia sesión con Google para continuar.',
    gistLinkedFromFirestore: 'Tu espacio social quedó vinculado automáticamente.',
    gistNotFoundCreated: 'Tu espacio social se creó correctamente.',
    signInAndLinked: 'Sesión iniciada correctamente.',
    profileMissing: 'Completa tu perfil para empezar en la actividad social.',
    profileSaved: 'Perfil social guardado correctamente.',
    signOut: 'Sesión social cerrada.',
    invalidSaveContext: 'No se pudo guardar ahora mismo. Inténtalo de nuevo.',
    missingSocialToken: 'No se pudo cargar tu espacio social. Vuelve a intentarlo.',
    firestoreCheckFailed: 'No se pudo verificar tu perfil social.',
    createGistFailed: 'No se pudo crear tu espacio social.',
    signInFailed: 'No se pudo iniciar sesión con Google.',
    loadProfileFailed: 'No se pudo cargar tu perfil social.',
    saveProfileFailed: 'No se pudo guardar tu perfil social.',
    profileIncomplete: 'Para guardar tu perfil necesitas un nombre y al menos un juego completado.',
    // Fallo por credencial al leer el canal de un amigo: no es que no haya publicado, es que el token no vale.
    socialReadUnauthorized: 'No se pudo leer la actividad de alguna de tus amistades: tu conexión con GitHub ha caducado. Vuelve a conectarla en Ajustes.',
    // Migración del canal a gist secreto, con retirada del antiguo (ver condiciones de uso).
    socialGistMigrated: 'Tu canal social se ha movido a un Gist no listado y se ha retirado el anterior, que era público. Tus reseñas y publicaciones siguen intactas.',
    // El clon no pasó la verificación: se conservan LOS DOS. Mejor dos gists que ninguno.
    socialGistMigratedKept: 'Tu canal social se ha movido a un Gist no listado, pero el anterior no se ha podido retirar y sigue siendo público. Puedes borrarlo tú en gist.github.com.',
    socialGistTooLarge: 'Tu canal social es demasiado grande para moverlo automáticamente y sigue siendo público. Escríbenos y lo migramos a mano.',
    postPublished: 'Publicación compartida.',
    postPublishFailed: 'No se pudo compartir la publicación.',
    // Sin red la publicación NO se ha ido a ninguna parte, y el texto sigue en el compositor: se dice explícitamente
    // para que nadie lo dé por publicado ni lo escriba otra vez.
    postPublishOffline: 'Sin conexión: la publicación no se ha compartido. El texto sigue aquí, inténtalo al recuperar la red.',
    profileGamesRefreshFailed: 'No se pudieron actualizar los listados de este perfil.',
    refreshThrottled: 'Espera unos segundos antes de volver a actualizar.',
    friendRequestSent: 'Petición de amistad enviada.',
    friendRequestAccepted: 'Ahora sois amigos.',
    friendRequestCanceled: 'Petición cancelada.',
    friendRequestRejected: 'Petición rechazada.',
    friendRemoved: 'Amistad eliminada.',
    friendActionFailed: 'No se pudo completar la acción. Inténtalo de nuevo.',
  },
  steps: [
    { id: 'sync', title: 'GitHub', subtitle: 'Conectar' },
    { id: 'google', title: 'Google', subtitle: 'Validar' },
    { id: 'gist', title: 'Espacio social', subtitle: 'Crear' },
  ],
} as const;

/** Tipo de los textos de la UI social; usar en los componentes en lugar de `any`. */
export type SocialUiLabels = typeof SOCIAL_UI;
