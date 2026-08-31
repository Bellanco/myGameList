import { STATS_UI } from './statsLabels';
import type { IconName } from './icons';
import type { PaletteId } from './palettes';
import { TAB_IDS, type TabId } from '../../model/types/game';
import type { ImportField } from '../../model/types/import';

export interface TabAction {
  target: TabId;
  label: string;
  btnCls: string;
  icon: IconName;
}

export const TAB_ORDER: TabId[] = [...TAB_IDS];

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
};

export const FILTER_BOOL: Record<TabId, { field: 'replayable' | 'retry'; label: string } | null> = {
  c: { field: 'replayable', label: 'Rejugar' },
  v: { field: 'retry', label: '¿Dar otra oportunidad?' },
  e: null,
  p: null,
};

export const SYNC_BADGE_TEXT = {
  idle: 'No sincronizado',
  ok: 'Sincronizado',
  syncing: 'Sincronizando…',
  error: 'Error de sincronización',
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
  syncSuccess: 'Datos sincronizados',
  syncError: 'Error al sincronizar',
  initError: 'Error de sincronización',
  offline: 'Sin conexión: se reintentará al recuperar la red',
  syncInProgress: 'Sincronización ya en curso',
  disconnectSuccess: 'Sincronización desconectada',
  copySuccess: 'Gist ID copiado al portapapeles',
  copyError: 'No se pudo copiar el Gist ID',
  copyMissing: 'No hay Gist ID disponible para copiar',
  recoverSuccess: 'Gist ID recuperado desde Google',
  recoverMissingInProfile: 'No se encontró gamesGistId en tu perfil de Google/Firestore',
  recoverMissingTokenInProfile: 'No se encontró el token en tu perfil de Google/Firestore',
  recoverError: 'No se pudo recuperar el Gist ID desde Google',
} as const;

/**
 * Textos de apariencia (tema y paleta). Fuera de `settingsLabels` por el mismo motivo que la analítica: los
 * usa `ThemeToggle`, que viaja en el arranque, y tenerlos allí traería de vuelta todo el módulo de Ajustes.
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
} as const;

/**
 * Textos del consentimiento de analítica. Fuera de `settingsLabels` a propósito: los pinta `ConsentBanner`, que
 * se monta con la aplicación, y tenerlos allí arrastraría los ~11 kB de Ajustes al chunk de arranque.
 */
export const ANALYTICS_UI = {
  title: 'Analítica',
  subtitle: 'Estadísticas de uso anónimas (Google Analytics) para saber qué falla y qué se usa.',
  groupAria: 'Consentimiento de analítica',
  on: 'Activada',
  off: 'Desactivada',
  bannerTitle: 'Analítica opcional',
  bannerBody: 'Esta app puede usar Google Analytics para medir el uso y detectar errores. Requiere guardar identificadores en tu navegador, así que solo se activa si lo aceptas. Puedes cambiarlo cuando quieras en Cuenta.',
  bannerAccept: 'Aceptar',
  bannerReject: 'Rechazar',
  bannerMore: 'Política de cookies',
  bannerAria: 'Consentimiento de analítica',
} as const;

export const UI_MESSAGES = {
  admin: {
    noTags: 'No hay etiquetas',
    editPlaceholder: 'Escribe el nuevo valor',
    editBtn: 'Editar',
    deleteBtn: 'Eliminar',
    editCancelBtn: 'Cancelar',
    editSaveBtn: 'Guardar',
    closeAria: 'Cerrar modal',
  },
  form: {
    // El hint también hace de "spacer" invisible (aria-hidden) en los campos que no son de etiquetas, para que
    // las columnas de una misma fila queden alineadas aunque solo una lleve texto de ayuda.
    enterToAddHint: 'Pulsa Enter o separa con comas',
    newTitle: 'Nuevo juego',
    editTitle: 'Editar juego',
    nameLabel: 'Nombre *',
    namePlaceholder: 'Ej: The Witcher 3',
    genresLabel: 'Géneros',
    genresPlaceholder: 'Ej: Acción',
    platformsLabel: 'Plataformas',
    platformsPlaceholder: 'Ej: PC',
    scoreLabel: 'Puntuación',
    scoreToggle: 'Puntuar este juego',
    scoreToggleHint: 'Activa la puntuación de este juego. Si no la activas, no cuenta en la ruleta.',
    interestLabel: 'Interés',
    yearsLabel: 'Años completado',
    yearsPlaceholder: (year: number) => `Ej: ${year}`,
    hoursLabel: 'Horas jugadas',
    hoursPlaceholder: 'Ej: 120',
    strengthsLabel: 'Puntos fuertes',
    strengthsPlaceholder: 'Ej: Combate',
    weaknessesLabel: 'Puntos débiles',
    weaknessesPlaceholder: 'Ej: Repetitivo',
    reasonsLabel: 'Razones',
    reasonsPlaceholder: 'Ej: Falta de tiempo',
    steamDeck: 'Steam Deck',
    reviewLabel: 'Análisis',
    reviewPlaceholder: 'Ej: Historia sólida, combate excelente y gran ambientación.',
    charCount: (count: number, max: number) => `${count.toLocaleString()} / ${max.toLocaleString()} caracteres`,
    // A11y-3: mensajes de umbral para lectores de pantalla (texto constante por banda → se anuncian una vez al
    // cruzar el umbral, no en cada pulsación). El conteo numérico se deja como texto visible SIN aria-live.
    charNearLimit: 'Te acercas al límite de caracteres del análisis.',
    charLimitReached: 'Has alcanzado el límite de caracteres del análisis.',
    close: 'Cerrar',
    cancel: 'Cancelar',
    save: 'Guardar',
  },
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
    account: 'Cuenta',
    inbox: 'Bandeja de importados',
    admin: 'Administración',
    legal: 'Información legal',
    stats: 'Estadísticas de mis listas',
    'shared-review': 'Reseña compartida',
  },
  skipToContent: 'Saltar al contenido',
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
    account: 'Cuenta',
    inbox: 'Bandeja',
    // La pestaña se llama "Estadísticas": son las de las listas propias. La ruta sigue siendo `/perfil` y la
    // sección `stats`. No confundir con el PERFIL SOCIAL (`/social/profile`), que es la ficha pública.
    stats: 'Estadísticas',
  },
  // Aviso de versión nueva. Solo aparece cuando NO se ha podido recargar sola (ver `useAppUpdate`), así que el
  // texto asume que el usuario está delante y a medio hacer algo: dice qué pasa y deja la decisión en su mano.
  update: {
    title: 'Hay una nueva versión',
    body: 'Recarga para verla. Tu información no se perderá.',
    action: 'Recargar',
    announce: 'Hay una nueva versión de la aplicación. Recarga para verla.',
  },
  import: {
    back: 'Volver',
    integrations: {
      title: 'Integraciones',
      note: 'Importa todos los juegos que ya tienes en tus tiendas, sin añadirlos a mano. Funciona con la app Playnite (solo Windows) y su extensión gratuita «Playnite Library Exporter», que crea un archivo con tu biblioteca. Los juegos llegan primero a la bandeja de importados para que tú decidas cuáles quedarte. Engloba las tiendas de PC (Steam, GOG, Epic, EA, Ubisoft, Amazon y Battle.net) y también las consolas de PlayStation y Xbox si en Playnite instalas sus complementos de biblioteca. Si un juego está en varias tiendas, se combinan sus plataformas en una sola entrada.',
      stepsTitle: 'Cómo traer tu biblioteca, paso a paso',
      steps: [
        'En tu PC con Windows, abre Playnite (si no la tienes, descárgala e instálala desde playnite.link).',
        'Dentro de Playnite, ve al menú principal (arriba a la izquierda) → «Complementos» → «Explorar complementos» y entra en la pestaña «Genérica».',
        'Busca «Playnite Library Exporter», pulsa «Instalar» y, cuando termine, cierra y vuelve a abrir Playnite.',
        'Abre de nuevo el menú principal → «Playnite Library Exporter» → «Export» y confirma. Deja el formato JSON (el que viene por defecto): se guardará un único archivo con extensión «.json».',
        'Vuelve aquí, pulsa «Importar de Playnite», elige ese archivo «.json» y tus juegos aparecerán en la bandeja de importados.',
      ],
      importBtn: 'Importar de Playnite',
      importAria: 'Seleccionar el archivo JSON exportado por Playnite Library Exporter',
      viewInbox: (n: number) => `Ver bandeja (${n})`,
      parseError: 'No se pudo leer el fichero. Comprueba que es el JSON exportado por «Playnite Library Exporter».',
      consoles: {
        psn: {
          title: 'Añadir tus juegos de PlayStation',
          steps: [
            'Abre Playnite en tu PC con Windows.',
            'Ve al menú principal (arriba a la izquierda) → «Complementos» → «Explorar complementos» y entra en la pestaña «Bibliotecas».',
            'Busca el complemento «PlayStation library integration» (hecho por la comunidad, de Xenor), pulsa «Instalar» y, al terminar, cierra y vuelve a abrir Playnite.',
            'Vuelve al menú principal → «Complementos» → ajustes de «PlayStation library integration» e inicia sesión con tu cuenta de PlayStation, siguiendo los pasos que te muestre.',
            'Tus juegos de PlayStation aparecerán en Playnite. Ahora solo tienes que exportarlos con «Playnite Library Exporter» (los pasos de más arriba) e importar el archivo aquí.',
          ],
        },
      },
    },
    inbox: {
      title: 'Bandeja de importados',
      note: 'Estos juegos se guardan en este equipo y caducan a los 30 días si no los clasificas.',
      sectionNew: 'Nuevos',
      sectionExisting: 'Ya en tus listas',
      empty: 'No hay juegos en la bandeja. Impórtalos desde Ajustes.',
      goSettings: 'Ir a Ajustes',
      classifyTo: 'Clasificar en',
      discard: 'Descartar',
      clear: 'Vaciar bandeja',
      existingBadge: 'Ya en tus listas',
      suggested: 'sugerida',
      origin: 'Origen',
      game: 'Juego',
      selectAll: 'Seleccionar todo',
      selectRowAria: (name: string) => `Seleccionar ${name}`,
      deleteSelected: 'Eliminar seleccionados',
      selectedCount: (n: number) => `${n} seleccionado${n === 1 ? '' : 's'}`,
      search: 'Buscar por nombre',
      enrich: 'Actualizar en tus listas',
      enrichHint: 'Ya lo tienes: añade género/plataforma/horas que falten al juego de tu lista.',
      showing: (shown: number, total: number) => `Mostrando ${shown} de ${total}`,
      copyNameAria: (name: string) => `Copiar «${name}»`,
      copyNameSuccess: (name: string) => `«${name}» copiado`,
      copyNameError: 'No se pudo copiar el nombre',
      fields: {
        title: 'Qué datos traer',
        note: 'Se aplica a TODOS los juegos de la bandeja. El nombre siempre se traslada; lo que desmarques aquí no se copiará (podrás rellenarlo a mano en el formulario).',
        toggleShow: 'Ver qué datos traer',
        toggleHide: 'Ocultar qué datos traer',
        newGames: 'Al clasificar un juego nuevo',
        existingGames: 'Al actualizar uno que ya tienes',
        existingHint: 'Las plataformas y los géneros se SUMAN a los que ya tenga el juego (no se quita nada); las horas y la nota solo se rellenan si las tienes vacías.',
        labels: {
          platforms: 'Plataformas',
          genres: 'Géneros',
          hours: 'Horas',
          grade: 'Nota',
        } satisfies Record<ImportField, string>,
        fieldAria: (field: string, group: string) => `${field} — ${group}`,
        summary: (fields: string) => (fields ? `Se traen: ${fields}.` : 'No se trae ningún dato extra.'),
      },
    },
    notice: (added: number, merged: number, duplicates: number) =>
      `${added} añadido(s)` +
      (merged ? `, ${merged} fusionado(s)` : '') +
      (duplicates ? `, ${duplicates} duplicado(s) omitido(s)` : ''),
  },
  toolbar: {
    searchPlaceholder: 'Buscar',
    clearSearch: 'Limpiar búsqueda',
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
  },
  starPicker: {
    groupAria: 'Seleccionar puntuación',
    starAria: (star: number) => `${star} estrella${star > 1 ? 's' : ''}`,
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
// siempre qué hacer. El tema por defecto se queda con el de Portal, que es el que mejor describe un error.
const APP_ERROR_LEAD: Record<PaletteId, string> = {
  steam: 'Esto no estaba en las pruebas.',
  // Persona 5: los Palacios se desmoronan en cuanto les robas el Tesoro.
  persona: 'El Palacio se ha derrumbado.',
  // Portal: «sigues vivo» es con lo que GLaDOS cierra las pruebas, así que aquí le toca a la página no estarlo.
  portal: 'Sigues vivo. La página no.',
  // Cyberpunk 2077: en Night City todo pasa por un implante, y todo implante acaba fallando.
  cyberpunk: 'Fallo en el implante.',
  // Warhammer 40.000: el Omnissiah es la deidad máquina del Adeptus Mechanicus, a la que se le reza para que
  // los aparatos funcionen.
  grimdark: 'El Omnissiah no responde.',
  // Sea of Stars: los Hijos del Solsticio y el eclipse que se lo traga todo.
  seaofstars: 'El eclipse se lo ha tragado.',
};

// SIN CONEXIÓN, contado por el boundary RAÍZ. Es un caso real y distinto de una avería: al entrar sin red en una
// sección que este dispositivo todavía no había visitado, su chunk no está en la caché del service worker, el
// `import()` falla y el árbol cae. Decir "algo ha ido mal / vuelve a cargar" ahí es engañoso —no hay nada roto y
// recargar no lo va a arreglar—, así que cada tema lo cuenta como lo que es: falta de comunicación.
const APP_OFFLINE_LEAD: Record<PaletteId, string> = {
  steam: 'No hay conexión con el servidor.',
  // Persona 5: sin señal no hay entrada al Metaverso.
  persona: 'Sin señal para entrar al Metaverso.',
  // Portal: un portal necesita sus dos extremos.
  portal: 'Falta el otro extremo del portal.',
  // Cyberpunk 2077: todo pasa por el enlace a la red.
  cyberpunk: 'Te has quedado sin enlace a la red.',
  // Warhammer 40.000: los mensajes viajan por la Disformidad, y la Disformidad se los traga.
  grimdark: 'La Disformidad se ha tragado la señal.',
  // Sea of Stars: el camino sigue estando, pero ahora mismo no se puede pasar.
  seaofstars: 'El camino está cortado.',
};

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
