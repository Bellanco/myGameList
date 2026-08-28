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
  // Aviso de versión nueva. Solo aparece cuando NO se ha podido recargar sola (ver `useAppUpdate`), así que el
  // texto asume que el usuario está delante y a medio hacer algo: dice qué pasa y deja la decisión en su mano.
  update: {
    title: 'Hay una nueva versión',
    body: 'Recarga para verla. Tu información no se perderá.',
    action: 'Recargar',
    announce: 'Hay una nueva versión de la aplicación. Recarga para verla.',
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
    emptyImportCta: 'Importar juegos',
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
