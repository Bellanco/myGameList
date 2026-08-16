import type { IconName } from './icons';
import type { PaletteId } from './palettes';
import { TAB_IDS, type TabId } from '../../model/types/game';
import type { ImportField } from '../../model/types/import';
import type { AdminAnomaly } from '../../model/types/firestore';

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

export const VALIDATION_MESSAGES = {
  yearInvalid: 'El año debe tener exactamente 4 dígitos. Pulsa Guardar de nuevo para ignorarlo.',
  fieldsInvalid: 'Revisa los campos marcados antes de guardar.',
  tagExists: 'Ya existe. Pulsa Guardar otra vez para fusionar.',
  duplicateName: (name: string, list: string) => `Ya tienes "${name}" en ${list}.`,
  tagMerged: 'Fusionado correctamente',
  tagUpdated: 'Actualizado correctamente',
  scoreRequired: 'Selecciona una puntuación',
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
    enterToAddHint: 'Pulsa Enter para añadir',
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
    integrations: 'Integraciones',
    inbox: 'Bandeja de importados',
    admin: 'Administración',
    legal: 'Información legal',
    stats: 'Estadísticas de mis listas',
    'shared-review': 'Reseña compartida',
  },
  skipToContent: 'Saltar al contenido',
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
    integrations: 'Integraciones',
    // La pestaña se llama "Estadísticas": son las de las listas propias. La ruta sigue siendo `/perfil` y la
    // sección `stats`. No confundir con el PERFIL SOCIAL (`/social/profile`), que es la ficha pública.
    stats: 'Estadísticas',
  },
  // Panel de estadísticas derivadas de las listas. Todo se calcula en el dispositivo (ver
  // `core/stats/computeStats`); no se guarda ni se publica nada.
  stats: {
    // The Witcher 3: «el destino es solo la mitad; la otra mitad somos nosotros».
    subtitle: 'El destino es solo la mitad: la otra mitad son tus listas, y esto es lo que cuentan.',
    empty: {
      // The Legend of Zelda: «es peligroso ir solo».
      title: 'Es peligroso ir solo',
      body: 'Añade juegos a tus listas y aquí aparecerán tus horas, tus notas y tus géneros.',
    },
    tiles: {
      games: 'Juegos',
      gamesHint: (playing: number, upcoming: number) => `${playing} en curso · ${upcoming} en próximos`,
      hours: 'Horas jugadas',
      hoursHint: (completed: string) => `${completed} h en juegos completados`,
      avgGrade: 'Nota media',
      avgGradeHint: (count: number) => `sobre ${count} ${count === 1 ? 'juego puntuado' : 'juegos puntuados'}`,
      // Sufijo de la nota media según la escala de la cuenta (estrellas o nota fina).
      outOf5: '/5',
      outOf100: '/100',
      longest: 'Tu partida más larga',
      longestHint: (hours: string) => `${hours} h`,
      noData: '—',
    },
    years: {
      title: 'Año a año',
      // Imperivm (Roma) con el refrán de siempre: una curva histórica es justo eso, obra de muchos años.
      subtitle: 'Roma no se construyó en un día: cómo has avanzado año a año.',
      metricAria: 'Métrica del gráfico anual',
      metricGames: 'Juegos',
      metricHours: 'Horas',
      noYear: 'Sin año',
      noYearHint: 'Completados a los que no les registraste año.',
      // El cajón "sin año" no cabe en una serie temporal: se saca del gráfico y se dice aparte.
      noYearChip: (value: string, metric: string) => `Sin año: ${value} ${metric}`,
      empty: 'Marca algún juego como completado para ver tu evolución por años.',
      colYear: 'Año',
      colGames: 'Completados',
      colHours: 'Horas',
      chartAria: (metric: string) => `Gráfico de ${metric} por año`,
      peak: (year: number, value: string, metric: string) => `Tu récord: ${year} con ${value} ${metric}`,
      // Tira de calidad: el reparto por nota de los completados de cada año, bajo la curva.
      quality: {
        stars: (count: number) => '★'.repeat(count),
        unscored: 'Sin nota',
        /**
         * Extremos de la escala de color que acompaña a la tira. Van en la ESCALA DE LA CUENTA: quien puntúa
         * sobre 100 no debería ver estrellas en ninguna parte del panel.
         */
        low: (grade: boolean) => (grade ? '0' : '1★'),
        high: (grade: boolean) => (grade ? '100' : '5★'),
        /** Título de cada trozo de la barra al pasar por encima. */
        cell: (year: string, band: string, count: number, total: number) =>
          `${year}, ${band}: ${count} de ${total}`,
      },
    },
    grades: {
      title: 'Distribución de notas',
      // The Witcher III: Geralt siempre acaba eligiendo el mal menor, que es lo que hace una escala de notas.
      // Entran los completados y también los abandonados que puntuaste.
      subtitle: 'Entre el mal menor y la obra maestra: ahí se reparten tus notas.',
      empty: 'Todavía no has puntuado ningún juego.',
      starsLabel: (stars: number) => `${stars} ${stars === 1 ? 'estrella' : 'estrellas'}`,
      gradeLabel: (floor: number, ceiling: number) => `${floor}–${ceiling}`,
      countLabel: (count: number) => `${count} ${count === 1 ? 'juego' : 'juegos'}`,
      chartAria: 'Distribución de notas',
      bandColumn: 'Tramo',
      countColumn: 'Juegos',
      /**
       * Filtro por lista. Solo aparece cuando hay notas en las DOS listas, y nunca deja el gráfico vacío: el
       * botón de la única lista encendida se queda deshabilitado en vez de apagarla.
       */
      lists: {
        aria: 'Qué listas entran en el reparto',
        completed: 'Completados',
        abandoned: 'Abandonados',
        /** Aviso al lector de pantalla en el botón que ya no se puede apagar. */
        onlyOne: 'No puedes quitar la única lista que queda',
      },
      /** Rótulo de la guía de la mediana, con su valor: la línea sola no decía en qué nota cae. */
      median: (value: string) => `mediana ${value}`,
    },
    genres: {
      title: 'Géneros más jugados',
      // Portal (uno de los temas): «la tarta es mentira». Va aquí, que es donde hay una tarta de verdad.
      subtitle: 'La tarta no es mentira: cada juego suma en todos sus géneros.',
      empty: 'Añade géneros a tus juegos para ver este reparto.',
      games: (count: number) => `${count} ${count === 1 ? 'juego' : 'juegos'}`,
      chartAria: 'Géneros por número de juegos',
    },
    ratio: {
      title: 'Completados y abandonados',
      // Cuphead, cuyo subtítulo es «Don't Deal with the Devil»: el juego va de contratos que hay que cerrar.
      // Va arriba, como en el resto de bloques: este era el único que además llevaba una cita al pie.
      subtitle: 'No hagas tratos con el diablo: estos son los contratos que cierras.',
      empty: 'Aún no has completado ni abandonado ningún juego.',
      completed: 'Completados',
      abandoned: 'Abandonados',
      gaugeAria: (percent: number, completed: number, abandoned: number) =>
        `${percent}% completados: ${completed} completados frente a ${abandoned} abandonados`,
    },
    top: {
      title: 'Lo mejor de tu biblioteca',
      titleYear: (year: number) => `Lo mejor de ${year}`,
      // Persona 5 (uno de los temas): «te robaré el corazón».
      subtitle: 'Los que te robaron el corazón: tu podio y en qué se parecen.',
      empty: 'Todavía no has puntuado ningún juego.',
      /** El metal de cada puesto, dicho con palabras: el color solo no puede ser el único que lo cuente. */
      medals: ['Oro', 'Plata', 'Bronce'],
      ranked: 'El resto de tu top',
      byGenre: 'Dónde brillas',
      genreCount: (count: number) => `${count} juegos`,
      donutCenter: 'mejores',
      yourAverage: 'tu media',
      replays: (times: number) => `×${times}`,
      replaysTitle: (times: number) => `Completado ${times} veces`,
      /** En la pestaña de un año la cuenta va HASTA ese año, así que lo dice en vez de sugerir que es el total. */
      replaysTitleYear: (times: number, year: number) => `Completado ${times} veces hasta ${year}`,
      hours: (hours: string) => `${hours} h`,
      avgGrade: (count: number) => ` de nota media en tus ${count} mejores`,
      avgHours: ' de media, cada uno',
      cutoff: ' es el listón para entrar',
      genres: 'Tus mejores géneros',
      platforms: 'Dónde los juegas',
    },
    // Pestañas General / año. Solo se listan los años con juegos completados.
    scope: {
      groupAria: 'Periodo de las estadísticas',
      general: 'General',
      yearAria: (year: number) => `Resumen de ${year}`,
      // Con muchos años en la barra, los recientes se quedan a la vista y el resto entra en este menú: así el
      // selector no crece ni obliga a desplazar la cabecera a lo ancho.
      more: 'Más años',
      moreAria: (count: number) => `Ver los otros ${count} años`,
    },
    radar: {
      title: 'Tus géneros',
      // No es el ranking por cantidad —ese es el rosetón de "Géneros más jugados"—: aquí manda la nota, y un
      // juegazo pesa más que un puñado de juegos correctos.
      subtitle: 'Elige tu arma: no gana el género que más juegas, sino el que más juegazos te ha dado.',
      subtitleYear: (year: number) => `Elige tu arma: los géneros que mejor te trataron en ${year}.`,
      empty: 'Añade géneros a tus juegos para ver esta figura.',
      /** Con menos de tres géneros la figura no se sostiene y se cae al ranking en barras. */
      tooFew: 'Con menos de tres géneros no hay figura que dibujar; aquí va el reparto.',
      aria: (parts: string) => `Figura de géneros por afinidad: ${parts}`,
      axisValue: (tag: string, weight: string, games: number, avgGrade: number) =>
        `${tag}: afinidad ${weight} con ${games} ${games === 1 ? 'juego' : 'juegos'}${avgGrade > 0 ? ` y nota media ${Math.round(avgGrade)}` : ''}`,
    },
    backlog: {
      title: 'Evolución del backlog',
      // Cyberpunk 2077 (uno de los temas): «despierta, samurái».
      derivedSubtitle: 'Despierta, samurái: así ha ido creciendo lo que hoy tienes en cada lista.',
      realSubtitle: 'Tamaño de cada lista al cierre de cada mes, según lo registrado en este dispositivo.',
      realNote: 'Histórico real, registrado mes a mes en este dispositivo desde que la función existe.',
      empty: 'Todavía no hay meses que representar.',
      lists: { c: 'Completados', v: 'Abandonados', e: 'En curso', p: 'Próximos' },
      colMonth: 'Mes',
      tableAria: 'Datos por mes',
    },
    shame: {
      title: 'Lista de la vergüenza',
      // Skyrim: «antes era un aventurero como tú, hasta que me clavaron una flecha en la rodilla».
      subtitle: 'Antes eras un aventurero como ellos: qué dejas a medias, por qué y cuánto te ha costado.',
      empty: 'Ni una flecha en la rodilla: no has abandonado ningún juego. Por ahora.',
      total: 'Abandonados',
      hours: 'Horas invertidas',
      avgGrade: 'Nota media',
      retry: 'Merecen otra oportunidad',
      /** Como cifra destacada de la cabecera: en una línea, para que case con «Volverías a jugar» al lado. */
      retryTile: 'Otra oportunidad',
      /** Pista bajo la cifra grande: de dónde sale ese porcentaje. */
      retryHint: (retry: number, total: number) => `${retry} de tus ${total} abandonados merecen otra oportunidad`,
      reasons: 'Por qué los dejas',
      noReasons: 'No has anotado razones de abandono.',
      genres: 'Géneros que más abandonas',
      rate: 'Terminados frente a abandonados, por género',
      legendCompleted: 'Terminados',
      legendAbandoned: 'Abandonados',
      recent: 'Los últimos en caer',
    },
    /** Evolución del gusto: el puesto de cada género, año a año, en ventana móvil. */
    genreRanks: {
      title: 'Cómo cambia tu gusto',
      // Skyrim: «solías ser un aventurero como yo, hasta que…». Aquí se ve qué dejaste de jugar por el camino.
      subtitle: 'Tú también fuiste un aventurero: qué géneros terminas más y cuáles se te caen del podio.',
      empty: 'Con unos cuantos años de partidas terminadas, aquí verás hacia dónde se mueve tu gusto.',
      rankAria: (tag: string, year: number, rank: number, games: number) =>
        `${tag}: ${rank}.º en ${year} con ${games} ${games === 1 ? 'juego' : 'juegos'}`,
      chartAria: 'Puesto de cada género por año',
      /** La banda del pie: dónde va un género que ese año no tiene ni un juego terminado. */
      outOfChart: 'Fuera de la tabla',
      outAria: (tag: string, year: number) => `${tag}: sin juegos terminados en ${year}`,
      /** Resumen del recorrido de un género entre el primer año y el último. */
      moveUp: (tag: string, from: number, to: number) => `${tag} sube del ${from}.º al ${to}.º puesto`,
      moveDown: (tag: string, from: number, to: number) => `${tag} baja del ${from}.º al ${to}.º puesto`,
      moveFlat: (tag: string, rank: number) => `${tag} se mantiene en el ${rank}.º puesto`,
      hint: 'Señala un género para seguir su línea.',
    },
    /** Constancia semanal, a partir de las fechas que la app registra sola. */
    activity: {
      title: 'Tu constancia',
      // Animal Crossing va de aparecer cada día; aquí basta con aparecer cada semana.
      subtitle: 'Aquí no se mide cuánto juegas, sino cada cuánto vuelves a tus listas.',
      empty: 'En cuanto muevas juegos entre listas o escribas reseñas, aquí aparecerá tu ritmo.',
      /** Por qué la unidad es la semana y no el día. */
      why: 'Por semanas, no por días: una lista de juegos no se toca a diario, y un calendario diario sería casi todo huecos.',
      weekAria: (week: string, total: number) =>
        total === 0 ? `${week}: sin actividad` : `${week}: ${total} ${total === 1 ? 'apunte' : 'apuntes'}`,
      chartAria: 'Semanas con actividad',
      active: 'Semanas activas',
      activeHint: (active: number, total: number) => `${active} de las últimas ${total}`,
      best: 'Mejor racha',
      current: 'Racha viva',
      weeks: (count: number) => `${count} ${count === 1 ? 'semana' : 'semanas'}`,
      /** Qué pasó esa semana, desglosado. Se omite lo que esté a cero: «3 movimientos y 0 reseñas» sobra. */
      detail: (moves: number, reviews: number) =>
        [
          moves > 0 ? `${moves} ${moves === 1 ? 'movimiento' : 'movimientos'}` : '',
          reviews > 0 ? `${reviews} ${reviews === 1 ? 'reseña' : 'reseñas'}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      less: 'menos',
      more: 'más',
      hint: 'Señala una semana para ver qué pasó.',
    },
    /** A cuáles vuelves: el voto más sincero que existe. */
    replay: {
      /** Como cifra destacada de la cabecera: el rótulo tiene que caber en una tarjeta pequeña. */
      tile: 'Volverías a jugar',
      title: 'A cuáles vuelves',
      // Portal: el pastel. Volver a un juego que ya te sabes es la promesa que sí se cumple.
      subtitle: 'Este pastel no es mentira: los juegos a los que de verdad vuelves.',
      empty: 'Marca "rejugar" o añade otro año a un juego terminado y aquí verás a cuáles vuelves.',
      replayed: 'Ya has vuelto',
      willReplay: 'Volverías',
      once: 'Una vez y ya',
      replayedHint: (runs: number) => `${runs} ${runs === 1 ? 'vuelta' : 'vueltas'} extra en total`,
      /** Porcentaje de completados a los que has vuelto o volverías. */
      rate: 'De tus completados',
      rateHint: (percent: number) => `${percent}% te apetece repetirlos`,
      /** Pista bajo la cifra grande: de dónde sale ese porcentaje. */
      leadHint: (back: number, total: number) => `${back} de tus ${total} completados merecen otra vuelta`,
      genres: 'Géneros que más repites',
      genreValue: (back: number, games: number) => `${back} de ${games}`,
      most: 'Los que más veces has terminado',
      runs: (count: number) => `${count} ${count === 1 ? 'vez' : 'veces'}`,
      chartAria: (replayed: number, willReplay: number, once: number) =>
        `${replayed} rejugados, ${willReplay} que volverías a jugar y ${once} de una sola vez`,
      hint: 'Señala una parte para ver su cuenta.',
    },
    /** Exigencia: cuánto se separan tus notas de tu propia media. */
    demand: {
      tile: 'Tu exigencia',
      /** Pista de la cifra destacada: la banda en la que cae la mayoría de tus notas. */
      tileHint: (low: string, high: string) => `la mayoría de tus notas caen entre ${low} y ${high}`,
      title: 'Tu exigencia',
      // Dark Souls otra vez no: esta es de Sekiro, donde la nota justa es la que duele.
      subtitle: 'Ni indulgente ni implacable: dónde caen tus notas alrededor de tu media.',
      empty: 'Puntúa algunos juegos y aquí verás si repartes notas parecidas o vas a los extremos.',
      deviation: 'Desviación',
      deviationHint: 'es lo que se aparta de tu media una nota tuya cualquiera',
      band: 'Tu zona habitual',
      bandHint: (inBand: number, count: number, percent: number) =>
        `${inBand} de tus ${count} notas caen en tu zona habitual (${percent}%).`,
      range: 'De la más baja a la más alta',
      /** Los extremos de la escala, fuera de la zona habitual: hasta dónde llegas cuando algo te marca. */
      zoneLow: 'Cuando algo te decepciona',
      zoneHigh: 'Cuando algo te encanta',
      points: 'pts',
      // La unidad va en palabra y no en símbolo: un «±0,9 ★» se lee como una nota de una estrella, no como la
      // anchura de una desviación. «pts» hace ese mismo papel en la escala sobre 100.
      stars: 'estrellas',
      /** Lectura en palabras de la desviación: es lo que convierte un número en un rasgo. */
      verdictFlat: 'Puntúas parejo: casi todo cae cerca de tu media.',
      verdictBalanced: 'Repartes con criterio: distingues sin irte a los extremos.',
      verdictHarsh: 'Puntúas a los extremos: o te encanta o no lo perdonas.',
      average: 'Tu media',
      chartAria: (avg: string, deviation: string, low: string, high: string) =>
        `Nota media ${avg}, desviación ${deviation}; la mayoría de tus notas caen entre ${low} y ${high}`,
      hint: 'Señala un tramo para ver cuántos juegos tiene.',
    },
    wishlist: {
      title: 'Lo que te espera',
      // Super Mario Bros.: «nuestra princesa está en otro castillo».
      subtitle: 'Tu princesa siempre está en otro castillo: qué has ido añadiendo y desde cuándo.',
      empty: 'No tienes nada en la lista de próximos.',
      total: 'En próximos',
      interest: 'Interés medio',
      interestHint: (count: number) => `sobre ${count} con interés anotado`,
      deck: 'Compatibles con Deck',
      genres: 'Géneros que más te apetecen',
      platforms: 'Plataformas',
      oldest: 'Cuándo llegó cada uno',
      recent: 'Los últimos en llegar',
      waitingSince: (since: string) => `desde ${since}`,
    },
    /** Lo que escribes: la cifra de reseñas, el bloque de puntos fuertes y débiles y las citas del podio. */
    reviews: {
      tile: 'Reseñas',
      tileHint: (percent: number) => `${percent}% de lo que has cerrado`,
      tileAction: 'Ver todas tus reseñas',
      title: 'Qué destacas y qué te chirría',
      // The Witcher III: ningún contrato se acepta sin leer antes el bestiario y saber por dónde flaquea.
      subtitle: 'Todo monstruo tiene su punto débil: tú los anotas al reseñar.',
      strengths: 'Lo que más celebras',
      weaknesses: 'Lo que más te chirría',
      traitsEmpty: 'Anota puntos fuertes y débiles en tus reseñas y aquí verás cuáles repites.',
      /** Aviso de que una ficha lleva reseña y se puede abrir. */
      openTitle: (name: string) => `Leer tu reseña de ${name}`,
      /** Pantalla con todas tus reseñas, dentro del panel. */
      screenTitle: 'Tus reseñas',
      // Cuphead otra vez no; esta es de The Witcher III, donde cada contrato acaba con Geralt anotando lo suyo.
      screenSubtitle: 'Todo lo que has escrito, de mejor a peor nota.',
      screenEmpty: 'Todavía no has escrito ninguna reseña.',
      /**
       * Aviso cuando la reseña es de un juego que no te has pasado (abandonado, en curso o pendiente).
       * The Witcher III otra vez: Geralt cobra al CERRAR el contrato, y este se quedó abierto.
       */
      unfinished: 'Contrato sin cerrar',
      backToStats: 'Volver a las estadísticas',
      /** Nombre del autor en el detalle de una reseña propia. */
      mine: 'Tus reseñas',
    },
    /** Panel de estadísticas de OTRA persona, dentro de su perfil del hub social. */
    friend: {
      title: 'Sus estadísticas',
      /** Botón de la fila de acciones del perfil, entre "Reseñas" y la ruleta. */
      button: 'Estadísticas',
      buttonBack: 'Ver perfil',
      subtitle: 'Salen de lo que comparte contigo: sus listas, sus notas y sus géneros.',
      empty: 'No comparte ninguna lista, así que no hay nada que resumir.',
      /** Reciprocidad: lo que escondes de tus listas, no lo ves de las suyas. */
      blockedAll: 'Escondes todas tus listas, así que no puedes ver las de nadie. Enséñalas en tu perfil y volverán estas cifras.',
      blocked: (lists: string) => `Falta ${lists}: lo escondes en tu perfil, así que tampoco lo ves aquí.`,
      /** Lo que el rango del que mira no alcanza a ver. */
      tierMore: 'Tu rango llega hasta aquí. Con uno más alto verías también cómo puntúa y cuánto termina.',
      noHours: 'Las horas no viajan por el canal social: son privadas y aquí no se enseñan.',
      scopeGeneral: 'General',
    },
    year: {
      completed: 'Completados',
      hours: 'Horas',
      avgGrade: 'Nota media',
      best: 'El mejor del año',
      gamesTitle: (year: number) => `Todo lo que completaste en ${year}`,
      // Halo: «terminemos esta pelea».
      gamesSubtitle: 'Terminemos esta pelea: de mejor a peor nota.',
      noHours: 'sin horas anotadas',
    },
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
        'Vuelve a esta pantalla, pulsa «Importar de Playnite», elige ese archivo «.json» y tus juegos aparecerán en la bandeja de importados.',
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
      empty: 'No hay juegos en la bandeja. Importa desde Integraciones.',
      goIntegrations: 'Ir a Integraciones',
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
  settings: {
    title: 'Ajustes',
    account: {
      title: 'Ajustes de cuenta',
    },
    // L2 — consentimiento de la analítica: banner previo y revocación desde la cuenta.
    analytics: {
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
    },
    // L3 — borrado de cuenta (RGPD art. 17).
    danger: {
      title: 'Zona de riesgo',
      deleteTitle: 'Borrar mi cuenta',
      deleteBody: 'Elimina tu perfil social, tus amistades y la configuración guardada en la nube, y borra los datos de este dispositivo (listas locales, sesión y token). No se puede deshacer.',
      deleteGistsNote: 'Tus Gists de GitHub NO se tocan al borrar la cuenta: viven en tu cuenta y solo tú puedes borrarlos. (La única excepción, ajena a este borrado, es la retirada del canal social antiguo que la app migró a no listado.)',
      deleteGistsLink: 'Ver mis Gists',
      deleteGistsUrl: 'https://gist.github.com',
      deleteBtn: 'Borrar cuenta',
      confirmTitle: '¿Borrar tu cuenta y los datos de este dispositivo?',
      confirmHint: 'Escribe BORRAR para confirmar.',
      confirmWord: 'BORRAR',
      confirmLabel: 'Borrar definitivamente',
      deleting: 'Borrando...',
      deletedOk: 'Cuenta borrada. Se han eliminado tus datos de la nube y de este dispositivo.',
      deletedPartial: 'Cuenta borrada con incidencias: algunos datos remotos no se pudieron eliminar. Vuelve a intentarlo o escribe al contacto de privacidad.',
      deleteError: 'No se pudo completar el borrado. Revisa la conexión e inténtalo de nuevo.',
    },
    // L4 — enlaces a los documentos legales.
    legal: {
      title: 'Legal',
      subtitle: 'Condiciones de uso, tratamiento de datos y cookies.',
      back: 'Volver',
      updated: (version: string) => `Última actualización: ${version}`,
      contact: 'Contacto',
    },
    appearance: {
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
    },
    scoreScale: {
      title: 'Puntuación',
      subtitle: 'Cómo se muestran las notas de tus juegos.',
      groupAria: 'Escala de puntuación',
      starsLabel: 'Estrellas',
      starsHint: 'Escala clásica de 0 a 5',
      gradeLabel: 'Nota 0–100',
      gradeHint: 'Aro numérico, de rojo a verde',
      lockedHint: 'Asocia tu cuenta de Google para elegir la escala (se guarda y sincroniza entre dispositivos).',
    },
    sync: {
      title: 'Sincronización',
      status: 'Estado actual',
      gistConnectedPrefix: 'Gist conectado',
      helpGithubTitle: '¿Qué es GitHub Gist?',
      helpGithubBody: 'GitHub Gist permite guardar tus listas en la nube privada para sincronizarlas entre dispositivos.',
      helpConfigTitle: 'Cómo configurar',
      helpConfigBody: 'Necesitas una cuenta de GitHub y un token personal con permiso gist para conectar tu respaldo en la nube.',
      helpConfigLinkLabel: 'Abrir configuración de tokens en GitHub',
      helpConfigLinkUrl: 'https://github.com/settings/tokens',
      helpConfigExpand: 'Ver pasos detallados',
      helpConfigCollapse: 'Ocultar pasos detallados',
      helpConfigStep1: 'Inicia sesión en GitHub o crea una cuenta si aún no la tienes.',
      helpConfigStep2: 'Abre la página de tokens y crea un token nuevo.',
      helpConfigStep3: 'Asigna un nombre descriptivo para identificarlo fácilmente.',
      helpConfigStep4: 'En fecha de caducidad selecciona Sin caducidad (o el periodo que prefieras).',
      helpConfigStep5: 'En permisos marca gist y guarda el token.',
      helpConfigStep6: 'Copia el token y pégalo en el campo Token de esta pantalla. Mantén este valor en privado.',
      helpConfigStep7: 'Si es tu primera conexión, deja el Gist ID vacío. Si ya tenías uno, pégalo para reutilizarlo.',
      tokenLabel: 'Token *',
      tokenPlaceholder: 'ghp_xxxxxxxxxxxxxxxxxxxxxxx',
      gistLabel: 'Gist ID (vacío la primera vez)',
      gistPlaceholder: 'Ej: a1b2c3d4e5f6...',
      oauthConnectBtn: 'Conectar con GitHub',
      oauthConnectingBtn: 'Conectando con GitHub...',
      oauthHelpBody: 'La forma más sencilla: te lleva a GitHub, autorizas el acceso a tus gists y volvemos conectados. Sin crear ni pegar tokens.',
      manualToggleShow: 'Prefiero introducir un token manualmente',
      manualToggleHide: 'Ocultar el modo manual',
      connectBtn: 'Conectar',
      syncBtn: 'Sincronizar',
      disconnectBtn: 'Desconectar',
      copyBtn: 'Copiar Gist ID',
      recoverBtn: 'Recuperar de Google',
      recoveringBtn: 'Recuperando...',
      copyAriaLabel: 'Copiar Gist ID',
      recoverAriaLabel: 'Recuperar Gist ID desde Google',
    },
    backup: {
      title: 'Respaldo de datos',
      note: 'Control total sobre tus listas, tanto local como en la nube.',
      description: 'Exporta o importa tus listados en formato JSON.',
      overwriteLabel: 'Sobreescribir datos existentes (local y Gist)',
      overwriteHint: 'Marcar esta opción reemplaza por completo los datos almacenados y también actualizará tu Gist cuando haya sincronización activa.',
      exportBtn: 'Exportar',
      importBtn: 'Importar',
      importAriaLabel: 'Seleccionar archivo para importar',
    },
    admin: {
      title: 'Administración de filtros',
      description: 'Gestiona géneros, plataformas y etiquetas comunes por categoría.',
      genres: 'Géneros',
      platforms: 'Plataformas',
      strengths: 'Puntos fuertes',
      weaknesses: 'Puntos débiles / razón',
      collapseAria: 'Ocultar categoría',
      expandAria: 'Mostrar categoría',
    },
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
export type StatsLabels = WidenText<typeof UI_MESSAGES.stats>;

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
} as const;

// Panel de administración (`/admin`, ruta oculta). Nada que ver con `UI_MESSAGES.settings.admin`, que es la
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
  empty: 'No hay ningún perfil todavía.',
  emptyFiltered: 'Ningún perfil coincide con la búsqueda.',
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
  },
  // Ficha completa del usuario: todo lo que las reglas dejan leer de su documento y de sus amistades.
  field: {
    createdAt: 'Alta',
    createdAtEstimated: 'Alta (estimada)',
    createdAtUnknown: 'Sin fecha de alta',
    // Se dice de dónde sale la estimación para que no se confunda con un dato sellado.
    estimatedHint: 'Estimada a partir de su amistad más antigua: los perfiles creados antes de registrar la fecha de alta no la tienen.',
    lastActivity: 'Última actividad',
    lastFriendship: 'Último movimiento de amistad',
    friends: 'Amistades',
    pendingOut: 'Peticiones enviadas',
    pendingIn: 'Peticiones recibidas',
    profileId: 'Pseudónimo',
    // El id que publica su PERFIL. Solo se pinta cuando existe: las escrituras actuales lo purgan, así que en un
    // perfil al día está vacío y enseñar "—" para todo el mundo hacía pensar que faltaba un dato.
    socialGist: 'Gist social (resto legacy)',
    // Los ids que sus AMISTADES tienen denormalizados de él. Desde que el perfil no publica el suyo, este es el
    // único rastro del canal de alguien al que llega el panel, y antes solo se veía si saltaba la señal de deriva.
    friendGists: 'Canal según sus amistades',
    /** El gist de JUEGOS denormalizado: con lo que un amigo carga sus listas compartidas. */
    friendGamesGists: 'Listas según sus amistades',
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
    photo: 'Foto',
    etag: 'ETag del gist',
    docId: 'Id del documento',
    yes: 'Sí',
    no: 'No',
    none: '—',
  },
  // Unificación del canal social cuando un usuario acabó con dos gists en circulación.
  gist: {
    driftTitle: 'Gists en circulación',
    profileGist: 'Publica en su perfil',
    friendGist: 'Sus amistades apuntan a',
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
  copyUid: 'Copiar identificador',
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

export const SOCIAL_UI = {
  hubTitle: 'Espacio social',
  loading: 'Cargando espacio social...',
  screenAria: 'Social',
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
  },
  status: {
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

/**
 * Compartir una reseña con enlace público (ver docs/plan-compartir-resenas.md).
 *
 * El tono importa aquí más que en otras pantallas: se está sacando a internet un texto que hasta ahora vivía en
 * los Gists del usuario. Los textos dicen con todas las letras qué se publica, qué no, cuánto dura y que se
 * puede retirar — y "Dejar de compartir" nunca se llama "Borrar", porque retirar un enlace no recoge las copias
 * que ya circulen.
 */
export const SHARE_UI = {
  action: 'Compartir',
  actionAria: 'Compartir esta reseña con un enlace público',
  shared: 'Compartida',
  dialogTitle: 'Compartir esta reseña',
  consentTitle: 'Vas a publicar esta reseña en internet',
  consentPublished: 'Se publica: el juego, tu nota, el texto completo de la reseña, sus plataformas, géneros y puntos fuertes y débiles, tu nick y la fecha.',
  consentPrivate: 'No se publica: tu correo, tu identificador, tus Gists, tus horas de juego, tu foto ni el resto de tu biblioteca.',
  consentDuration: (days: number, maxActive: number) =>
    `Tu rango te permite ${maxActive} ${maxActive === 1 ? 'enlace activo' : 'enlaces activos'}, y cada uno dura ${days} ${days === 1 ? 'día' : 'días'}.`,
  consentRevocable: 'Puedes retirarlo cuando quieras desde Ajustes. Eso lo deja inaccesible, pero no recoge las copias que ya se hayan compartido.',
  consentAccept: 'He leído lo anterior y quiero publicarla',
  confirm: 'Publicar enlace',
  cancel: 'Cancelar',
  publishing: 'Publicando…',
  copyLink: 'Copiar enlace',
  copied: 'Enlace copiado',
  revoke: 'Dejar de compartir',
  revoking: 'Retirando…',
  revoked: 'El enlace ya no está disponible',
  renewed: 'Enlace actualizado con la reseña de ahora.',
  screenTitle: 'Reseñas compartidas',
  screenSubtitle: 'Enlaces públicos que has creado. Caducan solos; puedes retirarlos antes.',
  screenEmpty: 'No has compartido ninguna reseña todavía.',
  counter: (active: number, max: number) => `${active} de ${max} ${max === 1 ? 'enlace activo' : 'enlaces activos'}`,
  expiresIn: (days: number) => (days <= 0 ? 'Caduca hoy' : `Caduca en ${days} ${days === 1 ? 'día' : 'días'}`),
  bannedTitle: 'No puedes compartir reseñas',
  bannedReason: (reason: string) => (reason ? `Motivo: ${reason}` : 'La administración ha retirado esta posibilidad de tu cuenta.'),
  quotaReached: (max: number) => `Tienes ${max} de ${max} enlaces activos.`,
  quotaHint: 'Retira uno o espera a que caduque el más antiguo.',
  // Página pública: la lee alguien que puede no conocer la app ni tener cuenta. Nada de jerga interna, y el
  // aviso deja claro que esto lo publica una persona y puede dejar de estar.
  publicAria: 'Reseña compartida',
  publicLoading: 'Cargando la reseña…',
  publicGoneTitle: 'Este enlace ya no está disponible',
  publicGoneBody: 'Puede haber caducado o haberlo retirado quien lo compartió.',
  publicCta: 'Ir a la página principal',
  publicNavAria: 'Navegación',
  needsSession: 'Necesitas iniciar sesión con Google para compartir.',
  needsProfile: 'Necesitas tener tu espacio social creado: de ahí salen tu nick y tu rango.',
  failed: 'No se ha podido compartir. Inténtalo de nuevo.',
} as const;

/** Moderación de enlaces compartidos en `/admin` (ver docs/plan-compartir-resenas.md §6). */
export const ADMIN_SHARES_UI = {
  title: 'Enlaces compartidos',
  subtitle: 'Reseñas publicadas con enlace público. Se pueden retirar, y a su autor vetarle o ajustarle la cuota.',
  empty: 'No hay enlaces activos.',
  filterPlaceholder: 'Filtrar por identificador de usuario',
  filterApply: 'Filtrar',
  open: 'Ver la página',
  expires: (date: Date) => `caduca el ${new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(date)}`,
  more: 'Cargar más',
  remove: 'Retirar enlace',
  ban: 'Vetar autor',
  banPurge: 'Vetar y retirar los suyos',
  unban: 'Levantar un veto',
  quota: 'Ajustar cuota',
  confirm: 'Confirmar',
  confirmRemove: (gameName: string) => `Retirar el enlace de «${gameName}»`,
  confirmBan: 'Vetar a este autor (sus enlaces actuales seguirán activos)',
  confirmBanPurge: 'Vetar a este autor Y retirar todos sus enlaces',
  confirmQuota: 'Ajustar la cuota de este autor',
  reasonPrompt: 'Motivo del veto (lo verá el usuario):',
  quotaMaxPrompt: 'Enlaces activos permitidos (0 para no tocarlo):',
  quotaDaysPrompt: 'Días de duración (0 para no tocarlo):',
  unbanPrompt: 'Identificador del usuario al que levantar el veto:',
  removed: 'Enlace retirado.',
  banned: (purged: number) => (purged > 0 ? `Autor vetado y ${purged} enlace(s) retirado(s).` : 'Autor vetado.'),
  unbanned: 'Veto levantado.',
  quotaSet: 'Cuota ajustada.',
  quotaCleared: 'Ajuste retirado: vuelve a la cuota de su rango.',
  failed: 'La operación no se ha completado.',
} as const;
