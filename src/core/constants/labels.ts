import { STATS_UI } from './statsLabels';
import type { IconName } from './icons';
import { voiceByPalette } from './palettes';
import { TAB_IDS, type TabId } from '../../model/types/game';
import type { ImportField } from '../../model/types/import';
import { APP_LOCALE } from './locale';

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
  v: '/abandonados',
  e: '/en-curso',
  p: '/proximos',
};

export const ROUTE_TAB: Record<string, TabId> = {
  '/completados': 'c',
  '/abandonados': 'v',
  '/en-curso': 'e',
  '/proximos': 'p',
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
  mergeSynced: (changes: number) => `Fusión sincronizada correctamente: ${changes} cambios remotos aplicados`,
  connectSynced: (changes: number) => `Sincronización configurada: ${changes} cambios remotos aplicados`,
  initialSynced: (changes: number) => `Sincronización inicial completada: ${changes} cambios remotos aplicados`,
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
  coversLabel: 'Carátulas de los juegos',
  coversAria: 'Descargar las carátulas de los juegos',
  coversOn: 'Activadas',
  coversOff: 'Desactivadas',
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
  /**
   * QUÉ SE MIRA Y QUÉ NO, dicho en dos listas. La tarjeta tenía una frase y dos botones, y se quedaba a medias
   * —medio palmo de tarjeta vacía— justo donde hace falta lo contrario: nadie decide sobre un permiso sin saber
   * qué alcanza. Lo que sale aquí no es relleno; es la respuesta a la única pregunta que se hace al leerlo.
   */
  collectsLabel: 'Qué se registra',
  collects: ['Qué pantallas se visitan', 'Errores de la aplicación', 'Navegador y tamaño de pantalla'],
  neverLabel: 'Qué no sale nunca de aquí',
  never: ['Tus listas y tus notas', 'Tus reseñas', 'Tu correo o tu nombre'],
  bannerTitle: 'Analítica opcional',
  /* CUATRO LÍNEAS ERAN TRES DE MÁS, y tres seguían siendo una de más: el aviso se lee de pie, tapando la
     pantalla, y lo único que hay que saber para decidir cabe en dos —qué se recoge y que se puede cambiar de
     idea—. El detalle —qué identificadores, cuánto duran— está en la política de cookies, que tiene su enlace
     justo debajo. Y ya no manda a «Cuenta», que era una pantalla que ha dejado de existir.

     SOBRABA «Solo se activan si aceptas»: lo dicen ya los dos botones, que es donde se mira antes de decidir, y
     costaba una línea entera de aviso —de ella depende el alto que publica `--consent-h`, y de ese alto, lo que
     se aparta todo lo que se apoya sobre la barra—. El hecho no cambia: sin decisión guardada no se inicializa
     Analytics (ver `ConsentBanner`), y la promesa por escrito sigue en la política de cookies. */
  bannerBody: 'Estadísticas de uso anónimas para saber qué falla y qué se usa. Puedes cambiarlo cuando quieras en Ajustes › Legal.',
  bannerAccept: 'Aceptar',
  bannerReject: 'Rechazar',
  bannerMore: 'Política de cookies',
  bannerAria: 'Consentimiento de analítica',
} as const;

/**
 * INVITACIÓN A INSTALAR. Se ofrece una vez y se puede decir que no una vez.
 *
 * El cuerpo dice lo que se GANA, no lo que se hace: «añadir a la pantalla de inicio» es el gesto, y el gesto no
 * convence a nadie. Lo que convence es que se abra sin la barra del navegador y que arranque sin conexión —las
 * dos cosas que esta app ya sabe hacer y que, sin instalar, no se llegan a ver nunca.
 *
 * NO se menciona que ocupe poco ni que «no es una descarga»: es cierto, pero defenderse de una objeción que
 * nadie ha puesto la planta en la cabeza de quien lee.
 */
export const INSTALL_UI = {
  bannerAria: 'Instalar la aplicación',
  bannerTitle: 'Ten Mis Listas a mano',
  bannerBody: 'Añádela a tu pantalla de inicio: se abre sin la barra del navegador y arranca aunque no haya conexión.',
  bannerAccept: 'Añadir',
  bannerReject: 'Ahora no',
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
    alreadyCurrent: (name: string) => `"${name}" ya está en curso`,
    reviewPublishDeferred: 'Juego guardado; la actividad social de reseña se actualizará al abrir el hub social.',
  },
  /** El botón de la tarjeta de la ruleta: qué se hace con el juego que ha salido. */
  rouletteActions: {
    toCurrent: 'Pasa a "En curso"',
    toCurrentDone: '✓ En curso',
    toProximos: 'Añadir a próximos',
    toProximosDone: '✓ Añadido a próximos',
  },
  /** El rótulo de la cápsula de estado, según la clase de aviso. */
  statusKind: { ok: 'Correcto', warn: 'Aviso', err: 'Error' },
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
    charCount: (count: number, max: number) => `${count.toLocaleString(APP_LOCALE)} / ${max.toLocaleString(APP_LOCALE)} caracteres`,
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
    inbox: 'Bandeja de importados',
    admin: 'Administración',
    legal: 'Información legal',
    stats: 'Estadísticas de mis listas',
    'shared-review': 'Reseña compartida',
    premios: 'Premios',
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
  import: {
    back: 'Volver',
    // Importar un JSON de copia desde Ajustes.
    fileDone: 'Datos importados correctamente',
    fileDoneOverwritten: 'Datos importados y Gist sobrescrito correctamente',
    fileDoneLocalOnly: 'Datos importados localmente, pero no hay Gist configurado para sobrescribir.',
    fileInvalid: 'Archivo JSON no válido',
    integrations: {
      title: 'Integraciones',
      /* CINCO FRASES SEGUIDAS ERAN UN MURO. Decían cosas distintas —qué hace, qué necesitas, de dónde trae,
         qué pasa con los duplicados— y había que leerlas enteras para saber si esto te servía. Ahora la
         primera va sola arriba y el resto se reparte en lo que cada cosa es: una condición, una lista de
         tiendas que se lee de un vistazo y una nota al pie. */
      /* TRES FRASES Y SE ACABÓ. Aquí se viene a traer la biblioteca, no a estudiar cómo funciona: basta con
         saber qué hace, de dónde lo saca y qué hace falta para ello. Lo demás —los pasos, el detalle de las
         consolas, qué pasa con un juego repetido— está en las dos guías de abajo, que es donde se busca cuando
         de verdad hace falta. Las tiendas van dentro de la frase y no en fichas sueltas: son siete nombres, se
         leen igual de rápido y no fingen ser botones. */
      note: 'Trae de una vez los juegos que ya tienes en tus tiendas, sin añadirlos a mano: llegan a la bandeja para que elijas cuáles te quedas.',
      sources: 'Funciona con Steam, GOG, Epic, EA, Ubisoft, Amazon y Battle.net, y también con PlayStation y Xbox si les instalas su complemento en Playnite.',
      requires: 'Necesitas Playnite (solo Windows) y su extensión gratuita «Playnite Library Exporter».',
      stepsTitle: 'Cómo traer tu biblioteca, paso a paso',
      /* UN PASO, UNA COSA. Estas instrucciones las sigue alguien con Playnite abierta en la otra pantalla, y
         cada paréntesis, cada «cuando termine» y cada frase con dos acciones dentro obliga a releer para saber
         qué toca hacer ahora. Se cuentan como se dictan en voz alta: haz esto, ahora esto. */
      /* La invitación a descargar Playnite va SUELTA y no dentro del primer paso: solo se enseña en un
         navegador de Windows, que es el único sitio donde se puede instalar (ver `isWindows`). En el resto
         —el móvil incluido— el paso se queda en «abre Playnite» y nadie persigue un programa que no existe
         para su sistema. */
      downloadHint: 'Si no la tienes, descárgala en',
      downloadLabel: 'playnite.link',
      downloadUrl: 'https://playnite.link',
      steps: [
        'Abre Playnite en tu PC con Windows.',
        'Arriba a la izquierda, entra en «Complementos» → «Explorar complementos» y abre la pestaña «Genérica».',
        'Busca «Playnite Library Exporter» y pulsa «Instalar».',
        'Cierra Playnite y vuelve a abrirla.',
        'Entra otra vez en «Complementos» → «Playnite Library Exporter» → «Export» y confirma. Deja el formato JSON, que es el que viene puesto.',
        'Se guardará un archivo «.json». Vuelve aquí, pulsa «Importar de Playnite» y elígelo.',
        'Tus juegos aparecerán en la bandeja de importados, donde eliges cuáles te quedas.',
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
            'Arriba a la izquierda, entra en «Complementos» → «Explorar complementos» y abre la pestaña «Bibliotecas».',
            'Busca «PlayStation library integration», de Xenor, y pulsa «Instalar».',
            'Cierra Playnite y vuelve a abrirla.',
            'Entra en «Complementos» → ajustes de «PlayStation library integration» e inicia sesión con tu cuenta de PlayStation.',
            'Tus juegos de PlayStation ya están en Playnite. Ahora tráelos aquí con los pasos de la otra guía.',
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
    // Los datos que enseña cada lista, por su ID de columna (ver `getTableHeaders` en `GameTable`). De aquí salen
    // los chips de ordenar; el ID, y no el rótulo, es lo que decide si una columna se puede ordenar.
    columns: {
      name: 'Juego',
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
