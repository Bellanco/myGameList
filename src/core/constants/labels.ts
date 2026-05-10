import type { IconName } from './icons';
import type { TabId } from '../../model/types/game';

export interface TabAction {
  target: TabId;
  label: string;
  btnCls: string;
  icon: IconName;
}

export const TAB_ORDER: TabId[] = ['c', 'v', 'e', 'p'];

export const TAB_TITLES: Record<TabId, string> = {
  c: 'Lista del completista',
  v: 'Lista de la vergüenza',
  e: 'En curso',
  p: 'Lista de próximos',
};

export const TAB_TOOLTIPS: Record<TabId, string> = {
  c: 'Completados',
  v: 'Abandonados',
  e: 'En curso',
  p: 'Próximos',
};

export const TAB_ROUTE: Record<TabId, string> = {
  c: '/completados',
  v: '/visitados',
  e: '/en-curso',
  p: '/proximos',
};

export const ROUTE_TAB: Record<string, TabId> = {
  '/completados': 'c',
  '/visitados': 'v',
  '/en-curso': 'e',
  '/proximos': 'p',
};

export const TAB_ACTIONS: Record<TabId, TabAction[]> = {
  c: [],
  v: [
    { target: 'c', label: 'Pasar a completados', btnCls: 'btn-complete', icon: 'trophy' },
    { target: 'e', label: 'Pasar a en curso', btnCls: 'btn-playing', icon: 'play' },
  ],
  e: [
    { target: 'c', label: 'Pasar a completados', btnCls: 'btn-complete', icon: 'trophy' },
    { target: 'v', label: 'Pasar a abandonados', btnCls: 'btn-abandoned', icon: 'abandoned' },
  ],
  p: [{ target: 'e', label: 'Pasar a en curso', btnCls: 'btn-playing', icon: 'play' }],
};

export const FILTER_BOOL: Record<TabId, { field: 'replayable' | 'retry'; label: string } | null> = {
  c: { field: 'replayable', label: 'Rejugar' },
  v: { field: 'retry', label: '¿Dar otra oportunidad?' },
  e: null,
  p: null,
};

export const SYNC_BADGE_TEXT = {
  idle: 'No Sincronizado',
  ok: 'Sincronizado',
  syncing: 'Sincronizando…',
  error: 'Error Sync',
} as const;

export const DIALOG_MESSAGES = {
  deleteTagTitle: (tag: string) => `¿Eliminar etiqueta "${tag}"?`,
} as const;

export const VALIDATION_MESSAGES = {
  yearInvalid: 'El año debe tener exactamente 4 dígitos. Pulsa Guardar de nuevo para ignorarlo.',
  fieldsInvalid: 'Revisa los campos marcados antes de guardar.',
  tagExists: 'Ya existe. Pulsa Guardar otra vez para fusionar.',
  tagMerged: 'Fusionado correctamente',
  tagUpdated: 'Actualizado correctamente',
} as const;

export const UI_MESSAGES = {
  admin: {
    noTags: 'No hay etiquetas',
    editPlaceholder: 'Escribe el nuevo valor',
    editCancelBtn: 'Cancelar',
    editSaveBtn: 'Guardar',
  },
  form: {
    yearsHint: 'Pulsa Enter para añadir',
  },
} as const;

export const SOCIAL_UI = {
  hubTitle: 'Espacio social',
  loading: 'Cargando estado social...',
  gateway: {
    lead: 'Configura tu espacio social en tres pasos: conecta GitHub, valida con Google y crea tu espacio social.',
    stepCaption: (current: number, total: number) => `Paso actual: ${current} de ${total}`,
    progress: (value: number) => `${value}% completado`,
    connectSync: 'Ir a Sincronización',
    signIn: 'Continuar con Google',
    signingIn: 'Validando identidad...',
    resolveProfile: 'Comprobando perfil social...',
    createGist: 'Crear espacio social',
    creatingGist: 'Creando espacio social...',
    enterSocial: 'Entrar al feed social',
    signOut: 'Cerrar sesión',
    syncRequired: 'Activa primero la sincronización principal con GitHub para habilitar el espacio social.',
    signInRequired: 'Tu sincronización principal está activa. Continúa con Google para validar tu perfil social.',
    gistRequired: 'Se ha verificado Firestore. Si no existe gist social asociado, crea un espacio social nuevo.',
    gistReadySignIn: 'Ya tienes gist social enlazado. Inicia sesión con Google para acceder al feed.',
    gistActive: (gistId: string) => `Gist social activo: ${gistId}`,
    gistMissing: 'Aún no hay gist social enlazado.',
    detailsSummary: 'Ver estado técnico',
    stateSync: 'Sincronización',
    stateGist: 'Espacio social',
    stateSession: 'Sesión Google',
    stateConnected: 'Conectada a GitHub',
    stateNotConnected: 'No conectada',
    stateLinked: (gistId: string) => `Enlazado (${gistId.slice(0, 8)}...)`,
    stateNotLinked: 'No enlazado',
    stateActive: 'Activa',
    stateNotStarted: 'No iniciada',
    flow: ['1. GitHub', '2. Google', '3. Espacio social', '4. Feed'],
  },
  feed: {
    title: 'Feed social',
    subtitle: 'Descubre perfiles públicos, favoritos y recomendaciones destacadas de otros jugadores.',
    profile: 'Editar mi perfil',
    refresh: 'Actualizar feed',
    refreshing: 'Actualizando feed...',
    signOut: 'Cerrar sesión',
    statsProfiles: 'Perfiles visibles',
    statsFavorites: 'Favoritos publicados',
    statsRecommendations: 'Recomendaciones publicadas',
    statsActivities: 'Eventos de actividad',
    sectionTitle: 'Actividad de perfiles',
    activityTitle: 'Actividad del feed',
    loading: 'Cargando feed social...',
    empty: 'No hay perfiles visibles todavía o no hay permisos de lectura en Firestore.',
    activityEmpty: 'Aún no hay actividad de recomendaciones o análisis para mostrar.',
    noFavorites: 'Sin favoritos publicados',
    noRecommendations: 'Sin recomendaciones destacadas',
    favoritesPrefix: 'Favoritos: ',
    recommendationsPrefix: 'Recomendaciones: ',
    recommendationHeadline: (gameName: string) => `Recomendó ${gameName}`,
    reviewHeadline: (gameName: string) => `Analizó ${gameName}`,
    recommendationEmpty: 'Sin comentario adicional en la recomendación.',
    showMore: 'Más',
    showLess: 'Menos',
    viewDetail: 'Ver detalle',
    detailTitle: 'Detalle de actividad social',
    detailSubtitle: 'Contenido completo de la recomendación o análisis seleccionada.',
    detailMissing: 'No se encontró la actividad solicitada o ya no está disponible.',
    backToFeed: 'Volver al feed',
    searchLabel: 'Buscar perfiles',
    searchPlaceholder: 'Buscar por nombre, email o juego',
    filterAll: 'Todos',
    filterFavorites: 'Con favoritos',
    filterRecommendations: 'Con recomendaciones',
    resultCount: (count: number) => `${count} perfiles visibles`,
  },
  profile: {
    title: 'Mi perfil social',
    subtitle: 'Define tu identidad pública, selecciona tus juegos clave y mantén tu perfil sincronizado.',
    toFeed: 'Ir al feed social',
    save: 'Guardar perfil',
    saving: 'Guardando perfil...',
    signOut: 'Cerrar sesión',
    identityTitle: 'Identidad visible',
    identityDescription: 'Este nombre se mostrará en el feed social y en recomendaciones compartidas.',
    nameLabel: 'Nombre social',
    namePlaceholder: 'Escribe tu nombre visible',
    privacyTitle: 'Privacidad',
    privacyLabel: 'Perfil privado',
    privacyPrivate: 'Tu perfil es privado. Solo usuarios autorizados podrán verlo.',
    privacyPublic: 'Tu perfil es público. Otros usuarios podrán encontrarte por email.',
    favoritesTitle: 'Juegos favoritos',
    favoritesDescription: 'Selecciona tus juegos más representativos desde tus listas locales.',
    favoritesSearchPlaceholder: 'Buscar favorito por nombre',
    recommendationsTitle: 'Recomendaciones destacadas',
    recommendationsDescription: 'Selecciona títulos que quieras destacar como recomendación.',
    recommendationsSearchPlaceholder: 'Buscar recomendación por nombre',
    searchEmpty: 'No hay juegos que coincidan con la búsqueda.',
    hydrating: 'Cargando datos de perfil desde gist social...',
  },
  status: {
    needMainSync: 'Activa la sincronización principal para continuar.',
    needGoogleBeforeCreate: 'Inicia sesión con Google para continuar.',
    gistLinkedFromFirestore: 'Tu espacio social quedó vinculado automáticamente.',
    gistNotFoundCreated: 'Tu espacio social se creó correctamente.',
    signInAndLinked: 'Sesión iniciada correctamente.',
    signInNeedCreate: 'Sesión iniciada. Vamos a crear tu espacio social.',
    profileMissing: 'Completa tu perfil para empezar en el feed social.',
    profileSaved: 'Perfil social guardado correctamente.',
    signOut: 'Sesión social cerrada.',
    invalidSaveContext: 'No se pudo guardar ahora mismo. Inténtalo de nuevo.',
    missingSocialToken: 'No se pudo cargar tu espacio social. Vuelve a intentarlo.',
    firestoreCheckFailed: 'No se pudo verificar tu perfil social.',
    createGistFailed: 'No se pudo crear tu espacio social.',
    signInFailed: 'No se pudo iniciar sesión con Google.',
    loadProfileFailed: 'No se pudo cargar tu perfil social.',
    saveProfileFailed: 'No se pudo guardar tu perfil social.',
  },
  steps: [
    { id: 'sync', title: 'GitHub', subtitle: 'Conectar' },
    { id: 'google', title: 'Google', subtitle: 'Validar' },
    { id: 'gist', title: 'Espacio social', subtitle: 'Crear' },
  ],
} as const;
