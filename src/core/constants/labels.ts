import { STATS_UI } from './statsLabels';
import type { IconName } from './icons';
import { voiceByPalette } from './palettes';
import { TAB_IDS, type TabId } from '../../model/types/game';

export interface TabAction {
  target: TabId;
  label: string;
  btnCls: string;
  icon: IconName;
}

/**
 * Las listas que ENSEÑA la interfaz, en su orden. Hoy son todas; se mantiene como nombre propio porque una lista
 * nueva entra en los datos una versión ANTES que en pantalla —fue el caso de la de deseos (`d`)—: un cliente
 * anterior la descarta al leer y reescribe el gist sin sus juegos, así que primero tiene que llegar a todos los
 * aparatos una versión que sepa conservarla, y solo después otra que deje llenarla. Ver docs/plan-lista-deseos.md.
 */
export const TAB_ORDER: TabId[] = [...TAB_IDS];

export const TAB_TITLES: Record<TabId, string> = {
  c: 'Lista del completista',
  v: 'Lista de la vergüenza',
  e: 'En curso',
  p: 'Lista de próximos',
  d: 'Lista de deseos',
};

export const TAB_TOOLTIPS: Record<TabId, string> = {
  c: 'Completados',
  v: 'Abandonados',
  e: 'En curso',
  p: 'Próximos',
  d: 'Deseados',
};

export const TAB_ROUTE: Record<TabId, string> = {
  c: '/completados',
  v: '/abandonados',
  e: '/en-curso',
  p: '/proximos',
  d: '/deseados',
};

export const ROUTE_TAB: Record<string, TabId> = {
  '/completados': 'c',
  '/abandonados': 'v',
  '/en-curso': 'e',
  '/proximos': 'p',
  '/deseados': 'd',
  // Nombre ANTIGUO de la lista de abandonados, que sigue resolviendo por redirección
  // (`LEGACY_ROUTE_REDIRECTS`). Se mantiene aquí para que el fotograma previo al salto pinte ya su pestaña, en
  // vez de asomar «completados» por el `|| 'c'` de `getCurrentTab`.
  '/visitados': 'v',
};

export const TAB_ACTIONS: Record<TabId, TabAction[]> = {
  c: [{ target: 'e', label: 'Pasar a en curso', btnCls: 'btn-playing', icon: 'play' }],
  v: [
    { target: 'c', label: 'Pasar a completados', btnCls: 'btn-complete', icon: 'trophy' },
    { target: 'e', label: 'Pasar a en curso', btnCls: 'btn-playing', icon: 'play' },
  ],
  e: [
    { target: 'c', label: 'Pasar a completados', btnCls: 'btn-complete', icon: 'trophy' },
    { target: 'v', label: 'Pasar a abandonados', btnCls: 'btn-abandoned', icon: 'abandoned' },
  ],
  p: [{ target: 'e', label: 'Pasar a en curso', btnCls: 'btn-playing', icon: 'play' }],
  // Deseos solo desemboca en Próximos: conseguir el juego es lo que lo mete en la biblioteca, y nada vuelve atrás.
  d: [{ target: 'p', label: 'Pasar a próximos', btnCls: 'btn-upcoming', icon: 'rocket' }],
};

export const FILTER_BOOL: Record<TabId, { field: 'replayable' | 'retry'; label: string } | null> = {
  c: { field: 'replayable', label: 'Rejugar' },
  v: { field: 'retry', label: '¿Dar otra oportunidad?' },
  e: null,
  p: null,
  d: null,
};

export const SYNC_BADGE_TEXT = {
  idle: 'No sincronizado',
  ok: 'Sincronizado',
  syncing: 'Sincronizando…',
  error: 'Error de sincronización',
  /** GitHub limita y se espera a que lo permita: no es un error, y lo pendiente sigue a salvo. */
  paused: 'Sincronización en pausa',
  /**
   * Hay ediciones guardadas que todavía no están en el gist. Faltaba, y su ausencia hacía MENTIR a la línea de
   * estado: tras guardar un juego seguía diciendo «Sincronizado» hasta que un ciclo subía lo pendiente, así que
   * no había forma de distinguir «todo a salvo» de «esto aún no ha salido de este dispositivo».
   */
  pending: 'Cambios sin subir',
} as const;

export const DIALOG_MESSAGES = {
  deleteTagTitle: (tag: string) => `¿Eliminar etiqueta "${tag}"?`,
  cancel: 'Cancelar',
  confirmDelete: 'Eliminar',
} as const;

/**
 * Textos de validación del formulario de juego. Cada uno dice QUÉ falta y DÓNDE, sin mecánicas ("pulsa Guardar
 * otra vez"): el aviso sale dentro del propio modal —junto al campo y resumido en el pie— porque el banner de
 * la página queda detrás del `<dialog>` y no llega a verse mientras el formulario está abierto.
 */
export const VALIDATION_MESSAGES = {
  yearInvalid: (maxYear: number) => `Escribe el año con 4 cifras, entre 1000 y ${maxYear} (ej: ${maxYear}).`,
  fieldsInvalid: 'Revisa los campos marcados antes de guardar.',
  tagExists: 'Ya existe. Pulsa Guardar otra vez para fusionar.',
  duplicateName: (name: string, list: string) => `Ya tienes "${name}" en ${list}.`,
  tagMerged: 'Fusionado correctamente',
  tagUpdated: 'Actualizado correctamente',
  nameRequired: 'Escribe el nombre del juego.',
  genresRequired: 'Añade al menos un género.',
  platformsRequired: 'Añade al menos una plataforma.',
  yearsRequired: 'Añade al menos un año de finalización.',
  scoreRequired: 'Selecciona una puntuación',
  hoursInvalid: 'Escribe las horas como un número, con decimales si hace falta (ej: 12,5).',
  hoursNegative: 'Las horas jugadas no pueden ser negativas.',
  /** Cabecera del resumen del pie del modal; debajo va la lista de lo que falta. */
  formSummary: (count: number) =>
    count === 1 ? 'Falta 1 cosa para poder guardar:' : `Faltan ${count} cosas para poder guardar:`,
} as const;

export const SYNC_MESSAGES = {
  needsConfiguration: 'Primero configura la sincronización.',
  connectSuccess: 'Sincronización configurada',
  connectError: 'Error al conectar sincronización',
  /** El módulo de conexión no llegó (red que ni responde ni falla): ver `beginGithubLogin`. */
  oauthModuleTimeout: 'No se ha podido preparar la conexión con GitHub. Revisa la red e inténtalo de nuevo.',
  /** Se pidió ir a GitHub y la página sigue aquí: navegación colgada o abortada, o el móvil abrió la app de GitHub. */
  oauthDidNotOpen: 'GitHub no llegó a abrirse. Vuelve a intentarlo; si se abre la app de GitHub, vuelve aquí y prueba de nuevo.',
  syncSuccess: 'Datos sincronizados',
  syncError: 'Error al sincronizar',
  initError: 'Error de sincronización',
  offline: 'Sin conexión: se reintentará al recuperar la red',
  /** GitHub limita las peticiones de este token (docs/plan-degradacion-servicios.md, fase 5). Nada se ha perdido. */
  rateLimited: (hora: string) =>
    `GitHub está limitando las peticiones. Tus cambios están guardados en este dispositivo y se subirán a partir de las ${hora}.`,
  syncInProgress: 'Sincronización ya en curso',
  disconnectSuccess: 'Sincronización desconectada',
  copySuccess: 'Gist ID copiado al portapapeles',
  copyError: 'No se pudo copiar el Gist ID',
  copyMissing: 'No hay Gist ID disponible para copiar',
  recoverSuccess: 'Gist ID recuperado desde Google',
  recoverMissingInProfile: 'No se encontró gamesGistId en tu perfil de Google/Firestore',
  recoverMissingTokenInProfile: 'No se encontró el token en tu perfil de Google/Firestore',
  recoverError: 'No se pudo recuperar el Gist ID desde Google',
  recoverUnavailable: 'Ahora mismo no se puede recuperar la configuración desde Google. Inténtalo más tarde o conecta a mano con un token y el Gist ID.',
  mergeSynced: (changes: number) => `Fusión sincronizada correctamente: ${changes} cambios remotos aplicados`,
  connectSynced: (changes: number) => `Sincronización configurada: ${changes} cambios remotos aplicados`,
  initialSynced: (changes: number) => `Sincronización inicial completada: ${changes} cambios remotos aplicados`,
} as const;

/**
 * Textos de apariencia (tema y paleta). Fuera de `settingsLabels` porque los usa `ThemeToggle`, que viaja en el
 * arranque, y tenerlos allí traería de vuelta todo el módulo de Ajustes.
 */
export const APPEARANCE_UI = {
  groupAria: 'Tema de la aplicación',
  light: 'Claro',
  dark: 'Oscuro',
  cycleHint: 'Pulsa para cambiar a',
  paletteAria: 'Paleta de color',
  paletteLabel: 'Tema',
  modeLabel: 'Modo',
  caseLabel: 'Texto',
  caseAria: 'Caja del texto de interfaz',
  caseNormal: 'Normal',
  caseUpper: 'Mayúsculas',
  steamLabel: 'Botón de Steam Deck',
  steamAria: 'Visibilidad del botón de Steam Deck',
  steamShow: 'Mostrar',
  steamHide: 'Ocultar',
  effectsLabel: 'Efectos visuales',
  effectsAria: 'Efectos visuales animados de los temas',
  effectsOn: 'Activados',
  effectsOff: 'Desactivados',
  coversLabel: 'Carátulas de los juegos',
  coversAria: 'Descargar las carátulas de los juegos',
  coversOn: 'Activadas',
  coversOff: 'Desactivadas',
  wishlistLabel: 'Lista de deseos',
  wishlistAria: 'Visibilidad de la pestaña de la lista de deseos',
  wishlistShow: 'Mostrar',
  wishlistHide: 'Ocultar',
  wishlistNote: 'Ocultarla no borra sus juegos ni la esconde a tus amigos: eso se decide en tu perfil social.',
} as const;

export const UI_MESSAGES = {
  /** Lo que la app cuenta al guardar, borrar o mover un juego (el banner de estado de la página). */
  games: {
    fieldsRequired: 'Revisa los campos obligatorios antes de guardar.',
    completedYearRequired: 'Debes añadir al menos un año para completados.',
    saved: 'Juego guardado correctamente',
    deleted: 'Juego eliminado',
    deleteConfirm: (name: string) => `¿Eliminar "${name}"?`,
    tagDeleted: 'Etiqueta eliminada',
    noName: 'El juego no tiene nombre.',
    alreadyInLists: (name: string) => `"${name}" ya está en tus listas.`,
    addedToProximos: (name: string) => `"${name}" añadido a próximos`,
    addedToWishlist: (name: string) => `"${name}" añadido a deseados`,
    alreadyCurrent: (name: string) => `"${name}" ya está en curso`,
    reviewPublishDeferred: 'Juego guardado; la actividad social de reseña se actualizará al abrir el hub social.',
  },
  /** El botón de la tarjeta de la ruleta: qué se hace con el juego que ha salido. */
  rouletteActions: {
    toCurrent: 'Pasa a "En curso"',
    toCurrentDone: '✓ En curso',
    toProximos: 'Añadir a próximos',
    toProximosDone: '✓ Añadido a próximos',
    toWishlist: 'Añadir a deseados',
    toWishlistDone: '✓ Añadido a deseados',
  },
  /** El rótulo de la cápsula de estado, según la clase de aviso. */
  statusKind: { ok: 'Correcto', warn: 'Aviso', err: 'Error' },
  appTitle: 'Mis Listas',
  scrollTop: 'Volver arriba',
  // A11y-4: encabezado de nivel 1 de cada pantalla. El diseño es "headerless" a propósito (sin barra ni título
  // visible), así que va en un `<h1 class="sr-only">`: no cambia nada de lo que se ve y da a un lector de
  // pantalla el encabezado de la página, que no existía en ninguna. Sin él la navegación por encabezados —una de
  // las formas habituales de recorrer una página— empezaba directamente en un h2 suelto, y Lighthouse ni podía
  // evaluar el orden de encabezados. El resto de las vistas ya empiezan en h2, así que la jerarquía encaja.
  pageHeading: {
    lists: (tabTitle: string) => `Mis listas de juegos — ${tabTitle}`,
    social: 'Social',
    settings: 'Ajustes',
    inbox: 'Bandeja de importados',
    admin: 'Administración',
    legal: 'Información legal',
    stats: 'Estadísticas de mis listas',
    'shared-review': 'Reseña compartida',
    premios: 'Premios',
  },
  // El RÓTULO de la cabecera de pantalla (`ScreenHeader`). Es decorativa —va `aria-hidden` y solo la pinta el tema
  // que la enciende—, así que el encabezado accesible sigue siendo `pageHeading`.
  screenHeader: {
    lists: 'Biblioteca',
    settings: 'Ajustes',
  },
  skipToContent: 'Saltar al contenido',
  // Lo que se ANUNCIA mientras baja el chunk de una pantalla. El esqueleto que se ve es decorativo
  // (`aria-hidden`), así que sin esto un lector de pantalla no tendría forma de saber que hay algo en camino.
  screenLoading: 'Cargando la pantalla...',
  // Los dos botones flotantes del listado son solo icono: el `aria-label` los nombra para un lector de pantalla y
  // el mismo texto va en `title` para que quien usa el ratón sepa qué hace cada uno al pasar por encima.
  fab: {
    roulette: 'Elige tu próximo juego',
    addGame: 'Añadir juego',
  },
  // A11y-4: nombre accesible de cada pestaña de listado. Hace falta explícito porque el título visible
  // (`.tab-text-full`) se oculta en pantallas estrechas: ahí dentro del botón solo quedaba el icono
  // (`aria-hidden`) y el contador, así que las cuatro pestañas —la navegación principal de la app— se anunciaban
  // como "1", "0", "0", "0". Incluye el título Y el contador, que son las dos cosas que se ven cuando se ven.
  tabAria: (title: string, count: number) => `${title}: ${count} ${count === 1 ? 'juego' : 'juegos'}`,
  nav: {
    ariaLabel: 'Navegación principal',
    lists: 'Listados',
    social: 'Social',
    settings: 'Ajustes',
    inbox: 'Bandeja',
    // La pestaña se llama "Estadísticas": son las de las listas propias. La ruta es `/stats` y la
    // sección `stats`. No confundir con el PERFIL SOCIAL (`/social/profile`), que es la ficha pública.
    stats: 'Estadísticas',
    /* EL PILOTO DE LA PESTAÑA SOCIAL, dicho para quien no ve el color. Va en el `aria-label` del botón y NO como
       texto dentro de él: el rótulo visible es la única palabra que la barra puede permitirse —mide cada píxel
       para decidir si los nombres caben—, y un texto de apoyo ahí dentro se mediría como parte del rótulo.
       Empieza por «Social» a propósito: es el nombre por el que se busca la pestaña. */
    socialOn: 'Social, perfil activo',
    socialOff: 'Social, sin activar',
  },
  /**
   * EL MENÚ DE LA PESTAÑA DE AJUSTES. Vive en `labels.ts` y no en `settingsLabels.ts` —donde estaría por
   * tema— porque la barra inferior viaja en el arranque y aquellos 11 kB solo los paga quien abre una pantalla
   * de ajustes. Son cuatro palabras: no merecen arrastrar el resto.
   */
  settingsMenu: {
    ariaLabel: 'Ajustes',
    open: 'Abrir ajustes',
    design: 'Diseño',
    // La porra de premios. No es un grupo de ajustes: es un salto a otra sección, y por eso va en ámbar (ver
    // `SettingsMenu`). Solo se pinta cuando hay algo que ver.
    premios: 'Premios',
    filters: 'Filtros',
    /* «Datos» reúne lo que antes eran «Integración» y «Legal»: por dónde entran y salen tus listas, qué se
       registra de ellas y cómo se borra todo. */
    data: 'Datos',
  },
  // Aviso de versión nueva. Solo aparece cuando NO se ha podido recargar sola (ver `useAppUpdate`), así que el
  // texto asume que el usuario está delante y a medio hacer algo: dice qué pasa y deja la decisión en su mano.
  update: {
    // El rótulo de la cápsula: dice de qué clase de aviso se trata, como «Correcto» o «Sin conexión».
    kicker: 'Actualización',
    title: 'Hay una nueva versión',
    body: 'Recarga para verla. Tu información no se perderá.',
    action: 'Recargar',
    announce: 'Hay una nueva versión de la aplicación. Recarga para verla.',
  },
  /**
   * LO QUE DICE EL ARRANQUE AL IMPORTAR: los avisos que lanza `App` y el botón de la lista vacía de `GameTable`.
   * El resto —las guías de Playnite y la bandeja— vive en `importLabels`, porque solo lo pintan pantallas
   * perezosas y aquí viajaría en el arranque.
   */
  import: {
    // Importar un JSON de copia desde Ajustes.
    fileDone: 'Datos importados correctamente',
    fileDoneOverwritten: 'Datos importados y Gist sobrescrito correctamente',
    fileDoneLocalOnly: 'Datos importados localmente, pero no hay Gist configurado para sobrescribir.',
    fileInvalid: 'Archivo JSON no válido',
    integrations: {
      importBtn: 'Importar de Playnite',
      importAria: 'Seleccionar el archivo JSON exportado por Playnite Library Exporter',
      viewInbox: (n: number) => `Ver bandeja (${n})`,
      parseError: 'No se pudo leer el fichero. Comprueba que es el JSON exportado por «Playnite Library Exporter».',
    },
    notice: (added: number, merged: number, duplicates: number) =>
      `${added} añadido(s)` +
      (merged ? `, ${merged} fusionado(s)` : '') +
      (duplicates ? `, ${duplicates} duplicado(s) omitido(s)` : ''),
  },
  toolbar: {
    searchPlaceholder: 'Buscar',
    /* Etiqueta REAL del buscador (va en un `<label>` en `sr-only`). El `placeholder` no sirve de nombre
       accesible: desaparece en cuanto se escribe, así que quien usa lector de pantalla pierde la referencia de
       qué campo está editando en cuanto empieza a teclear (WCAG 3.3.2). Dice además QUÉ se busca, que el
       «Buscar» a secas del placeholder no aclara. */
    searchLabel: 'Buscar en la lista por nombre de juego',
    clearSearch: 'Limpiar búsqueda',
    /* F5 — forma del listado. El grupo se anuncia como lo que es (dos opciones excluyentes) y cada botón dice
       a QUÉ se cambia, no cómo se está viendo: es lo que espera quien lo pulsa. */
    shapeAria: 'Forma del listado',
    shapeList: 'Ver lista',
    shapeGrid: 'Ver tarjetas',
    /* Recuento de la barra del listado. Dice lo que se está viendo AHORA —con los filtros puestos—, no el total
       de la lista: es el pie de la decisión que se acaba de tomar en los filtros de arriba. */
    listCount: (count: number) => `${count} ${count === 1 ? 'juego' : 'juegos'}`,
    /* Tamaño de las tarjetas. Es un deslizador de tres posiciones, así que además del nombre del control hace
       falta el de la POSICIÓN: un `<input type="range">` se anuncia con su número («2 de 3»), que aquí no dice
       nada, y `aria-valuetext` es lo que lo sustituye por la palabra. */
    gridSizeAria: 'Tamaño de las tarjetas',
    gridSizeName: (size: 'sm' | 'md' | 'lg') => ({ sm: 'Pequeños', md: 'Normales', lg: 'Grandes' })[size],
    /* F5 — el ORDEN, que en las formas nuevas ya no lo llevan las cabeceras de columna. Dice en palabras lo que
       la cabecera decía con una flechita. */
    sortLabel: 'Ordenar',
    sortDirection: (asc: boolean) => (asc ? 'De menor a mayor. Pulsa para invertir' : 'De mayor a menor. Pulsa para invertir'),
    toggleFilters: (open: boolean) => (open ? 'Ocultar filtros' : 'Mostrar filtros'),
    steamDeck: 'Steam Deck',
    removeFilter: (label: string) => `Quitar filtro ${label}`,
    genre: 'Género',
    allGenres: 'Todos los géneros',
    platform: 'Plataforma',
    allPlatforms: 'Todas las plataformas',
    score: 'Puntuación',
    anyScore: 'Cualquier puntuación',
    scoreOrMore: (value: number) => `${value} o más`,
    hours: 'Horas',
    anyDuration: 'Cualquier duración',
    // Los chips de los filtros activos: qué filtro y con qué valor.
    chipSearch: (value: string) => `Buscar: ${value}`,
    chipGenre: (value: string) => `Género: ${value}`,
    chipPlatform: (value: string) => `Plataforma: ${value}`,
    chipScore: (value: number | string) => `Puntuación: ${value}+`,
    chipHours: (value: string) => `Horas: ${value}`,
    clearFilters: 'Limpiar filtros',
  },
  table: {
    edit: 'Editar',
    delete: 'Eliminar',
    // A11y-4: nombre de la tabla (`<caption class="sr-only">`). Con cuatro listas, el título de la pestaña es lo
    // único que las distingue en la lista de tablas de un lector de pantalla.
    caption: (tabTitle: string, count: number) =>
      `${tabTitle}: ${count} ${count === 1 ? 'juego' : 'juegos'}`,
    // A11y-4: el botón de fila ya NO lleva `aria-label` (ver GameTable): su nombre accesible sale del contenido,
    // que en móvil es la única presentación de la puntuación y las plataformas. `rowDetailsAria` queda retirado a
    // propósito; el estado plegado/desplegado lo anuncia `aria-expanded`.
    actionAria: (label: string, name: string) => `${label} - ${name}`,
    editAria: (name: string) => `Editar - ${name}`,
    deleteAria: (name: string) => `Eliminar - ${name}`,
    removeTag: (value: string) => `Eliminar ${value}`,
    emptyTitle: 'No hay juegos aquí todavía',
    emptyCta: 'Añadir juego',
    moreCount: (count: number) => `+${count}`,
    replayHeaderTip: 'Indica si el juego es rejugable',
    retryHeaderTip: 'Indica si merece otra oportunidad',
    sortHeaderTip: (column: string) => `Ordenar por ${column.toLowerCase()}`,
    // Los datos que enseña cada lista, por su ID de columna (ver `getTableHeaders` en `GameTable`). De aquí salen
    // los chips de ordenar; el ID, y no el rótulo, es lo que decide si una columna se puede ordenar.
    columns: {
      name: 'Nombre',
      year: 'Año',
      platforms: 'Plataformas',
      genres: 'Géneros',
      strengths: 'Puntos fuertes',
      weaknesses: 'Puntos débiles',
      score: 'Puntuación',
      interest: 'Interés',
      replay: 'Rejugar',
      retry: 'Dar otra oportunidad',
    },
    replayBadge: (value: boolean) => `Rejugar: ${value ? 'Sí' : 'No'}`,
    retryBadge: (value: boolean) => `Dar otra oportunidad: ${value ? 'Sí' : 'No'}`,
  },
  detail: {
    platforms: 'Plataformas',
    steamDeck: 'Steam Deck',
    genres: 'Géneros',
    yearsCompleted: 'Años en los que se completó',
    playtime: 'Tiempo jugado',
    hoursSuffix: (hours: string) => `${hours} horas`,
    strengths: 'Puntos fuertes',
    weaknesses: 'Puntos débiles',
    score: 'Puntuación',
    interest: 'Interés',
    replayability: 'Rejugabilidad',
    retry: 'Dar otra oportunidad',
    review: 'Análisis',
    /* El análisis ya no se vuelca en el detalle: se va a leer a su pantalla. El texto dice a DÓNDE lleva, no
       qué hay dentro, porque quien lo pulsa ya sabe que escribió uno. */
    reviewLink: 'Ver análisis',
    reviewLinkAria: (name: string) => `Ver análisis de ${name}`,
  },
} as const;

/**
 * MISMA PANTALLA, OTRA VOZ. El panel de estadísticas es UNO SOLO y se pinta tanto en tu perfil como en el de otra
 * persona, así que los textos con voz («tu biblioteca», «tu media») tienen su versión en tercera persona. Viven
 * FUERA de este módulo, en `statsOtherLabels`: `labels.ts` entra en el arranque y esos rótulos solo hacen falta
 * dentro del panel, que se carga en diferido.
 */

/**
 * El mismo árbol de textos, pero con los literales ENSANCHADOS a `string`. `UI_MESSAGES` va `as const` —lo que
 * está bien para el resto de la app—, y sin esto la voz ajena no podría escribir «Lo mejor de su biblioteca»
 * donde el tipo exige exactamente «Lo mejor de tu biblioteca». Los arrays se quedan de solo lectura para que las
 * dos voces encajen en el mismo tipo.
 */
type WidenText<T> = T extends (...args: infer A) => infer R
  ? (...args: A) => WidenText<R>
  : T extends string
    ? string
    : T extends number
      ? number
      : T extends boolean
        ? boolean
        : T extends readonly (infer U)[]
          ? readonly WidenText<U>[]
          : { [K in keyof T]: WidenText<T[K]> };

/** Textos del panel de estadísticas, en cualquiera de sus dos voces (ver `STATS_LABELS_OTHER`). */
export type StatsLabels = WidenText<typeof STATS_UI>;

// Cada tema cuenta el fallo en su propio idioma, igual que los bloques de estadísticas (la tarta de Portal en
// «Géneros más jugados», los contratos de Cuphead en «Completados y abandonados», el corazón robado de Persona
// en el podio): el guiño va INTEGRADO en la frase, sin comillas ni atribución, y la línea de debajo dice
// siempre qué hacer.
//
// LAS FRASES NO ESTÁN AQUÍ: cada una vive en la ficha de su tema (`constants/themes/<id>.ts`, campo `voice`),
// que es lo que hace que añadir un tema sea tocar UN fichero y no ir buscando los ocho mapas que lo nombraban.
// El tipo `ThemeVoice` obliga a rellenarlas, así que un tema sin voz no compila.
const APP_ERROR_LEAD = voiceByPalette('appError');

// SIN CONEXIÓN, contado por el boundary RAÍZ. Es un caso real y distinto de una avería: al entrar sin red en una
// sección que este dispositivo todavía no había visitado, su chunk no está en la caché del service worker, el
// `import()` falla y el árbol cae. Decir "algo ha ido mal / vuelve a cargar" ahí es engañoso —no hay nada roto y
// recargar no lo va a arreglar—, así que cada tema lo cuenta como lo que es: falta de comunicación.
const APP_OFFLINE_LEAD = voiceByPalette('appOffline');

// Pantalla de reemplazo del error boundary RAÍZ (fallo de render que tumbaría toda la app).
export const APP_ERROR_UI = {
  sectionAria: 'Error de la aplicación',
  // Sin titular visible: el mensaje se reparte en dos líneas con distinto peso (qué ha pasado / qué hacer),
  // que es lo que da jerarquía a la pantalla ahora que no hay título ni icono. `title` se conserva para
  // lectores de pantalla, como encabezado de la página.
  title: 'Algo ha ido mal',
  leadByPalette: APP_ERROR_LEAD,
  hint: 'Vuelve a cargar la página para continuar.',
  reload: 'Recargar',
  // Variante para cuando lo que ha fallado es la RED (ver `APP_OFFLINE_LEAD`).
  offlineTitle: 'Sin conexión',
  offlineLeadByPalette: APP_OFFLINE_LEAD,
  offlineHint: 'Esta parte de la aplicación necesita conexión y todavía no está guardada en este dispositivo. Tus listas siguen funcionando.',
  // La salida del callejón: recargar en la ruta que ha fallado volvería a fallar (el chunk sigue sin poder bajar),
  // así que sin red la acción es IR A LAS LISTAS, que sí funcionan sin conexión.
  offlineAction: 'Volver a mis listas',
} as const;
