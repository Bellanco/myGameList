// Textos del panel "Perfil" (estadísticas) y de las tarjetas que lo componen.
//
// Aparte de `labels.ts` por peso y por orden: son ~20 kB de prosa que solo consumen el chunk perezoso de
// `StatsHub` y el del hub social, mientras que `labels.ts` viaja en el ARRANQUE porque `App.tsx` toma de ahí
// `TAB_TITLES` y `ROUTE_TAB` — y un módulo entra entero en un chunk, o no entra.
export const STATS_UI = {
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
} as const;
