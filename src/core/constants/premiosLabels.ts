import { premiosVoiceByPalette } from './themes/premios';
// Textos de la sección de PREMIOS, en su propio módulo.
//
// MISMA DISCIPLINA QUE EN LO SOCIAL, y por el mismo motivo: si un módulo del ARRANQUE necesita una cadena de
// aquí, NO la importa de aquí. Estos textos viajan en el chunk perezoso de la sección; importarlos desde código
// estático los devuelve al arranque de todo el mundo —incluido quien no vota nunca— y rompe el presupuesto de
// `ci-validate`. Es exactamente lo que costó aprender con `socialLabels`.
//
// Vienen de la aplicación de origen, con dos ajustes: el castellano es el de esta casa («escribe», no
// «ingresa»), y el nombre del evento es «El reto del jugador» (decisión del 20-09-2026), nunca «Game Awards»,
// que es una marca ajena.

// Lo que se dice cuando algo se cae, con la voz de cada tema (ver `themes/premios.ts`). Se resuelve por paleta
// en el componente, igual que en el hub social: el mundo del tema lo cuenta, y debajo va, atenuado, lo que de
// verdad hay que saber.
const PREMIOS_ERROR_LEAD = premiosVoiceByPalette('error');
const PREMIOS_OFFLINE_LEAD = premiosVoiceByPalette('offline');

export const PREMIOS_UI = {
  /** Nombre del evento. La sección se llama «Premios»; la edición, esto más su año. */
  eventName: 'El reto del jugador',
  sectionAria: 'Premios',

  portada: {
    lead: 'Acepta el reto y compite por el primer puesto.',
    openNow: 'La votación está abierta',
    closed: 'La votación está cerrada',
    scheduled: 'La votación todavía no ha empezado',
    daysLeft: (dias: number) => (dias === 1 ? 'Queda 1 día' : `Quedan ${dias} días`),
    lastDay: 'Último día para votar',
    oneVote: 'Un voto por persona',
    start: 'Empezar a votar',
    resume: 'Seguir votando',
    edit: 'Corregir mi voto',
    seeResults: 'Ver los resultados',
    // SIN SESIÓN. El botón no lleva a ninguna parte: entra con Google ahí mismo y deja la portada como estaba,
    // ya con el botón de votar. Mandar antes a otra pantalla sería pedir dos pasos para uno.
    signIn: 'Identifícate para votar',
    signingIn: 'Entrando…',
    signInHint: 'Tus elecciones van asociadas a tu cuenta de Google. Los resultados publicados se ven sin entrar.',
    signInFailed: 'No se ha podido entrar. Inténtalo de nuevo.',
    // EL CUPO, dicho en la portada y no al final: es lo que decide cómo se vota —de una tacada o corrigiendo
    // sobre la marcha— y enterarse después de enviar llega tarde.
    opportunities: (cuantas: number) =>
      cuantas === 1
        ? 'Tienes una oportunidad: lo que envíes queda como esté.'
        : `Tienes ${cuantas} oportunidades: el envío y ${cuantas - 1} correcciones.`,
    opportunitiesLeft: (quedan: number) =>
      quedan === 1 ? 'Te queda 1 oportunidad' : `Te quedan ${quedan} oportunidades`,
    /** Solo a quien vota con cuenta ligera: es la única diferencia práctica que le hace tener perfil. */
    moreWithSocial: 'Con cuenta social tendrías entre 5 y 20, según tu rango.',
    // Sin edición abierta ni resultados: es enero y aquí no hay nada. Se dice sin dramatismo.
    empty: 'Ahora mismo no hay ninguna edición en marcha.',
    emptyHint: 'Cuando se abra la siguiente, aparecerá aquí.',
  },

  votar: {
    sectionAria: 'Votación',
    chooseOne: 'Elige tu favorito',
    chosen: 'Tu elección',
    previous: 'Anterior',
    next: 'Siguiente',
    // EL PIE DE LA VOTACIÓN, como en la porra de origen: avanzar y retroceder en una fila, y debajo la salida
    // hacia la revisión, que está siempre disponible — se puede enviar con categorías sin votar.
    finish: 'Finalizar',
    progressCount: (actual: number, total: number) => `${actual} / ${total}`,
    progressPercent: (pct: number) => `${pct} %`,
    votedMark: 'Votada',
    pendingMark: 'Sin votar',
    nomineeAria: (nombre: string) => `Votar por ${nombre}`,
    nomineeChosenAria: (nombre: string) => `${nombre}, tu elección actual`,
  },

  revisar: {
    sectionAria: 'Revisión de tus elecciones',
    title: 'Revisa tus elecciones',
    subtitle: 'Puedes cambiar cualquier voto antes de enviarla.',
    /** La misma pantalla cuando solo se mira: ni se revisa nada ni se va a enviar, así que no se dice. */
    readTitle: 'Tus elecciones',
    nameLabel: 'Nombre para la clasificación',
    namePlaceholder: 'Escribe tu nombre o apodo',
    nameHint: 'Es el que verá el resto en la clasificación.',
    voted: (votadas: number, total: number) => `${votadas} de ${total} categorías votadas`,
    notVoted: 'Sin votar',
    pending: (cuantas: number) =>
      cuantas === 1 ? 'Queda 1 categoría por votar' : `Quedan ${cuantas} categorías por votar`,
    /** La papeleta se envía COMPLETA: mientras falte una, el botón no se ofrece y aquí se dice por qué. */
    mustComplete: 'Hay que votarlas todas para poder enviarla.',
    submit: 'Enviar mis elecciones',
    submitting: 'Enviando…',
    back: 'Volver a votar',
    goToCategory: (categoria: string) => `Ir a ${categoria}`,
    editVotes: 'Seguir votando',
    firstPending: 'Ir a la primera sin votar',
    /** Recibe las que quedarán DESPUÉS de enviar esta, que es lo que se está a punto de gastar. */
    editsLeft: (tras: number) =>
      tras === 1 ? 'Te quedará 1 oportunidad más' : `Te quedarán ${tras} oportunidades más`,
    noEditsLeft: 'Esta es tu última oportunidad',
  },

  enviada: {
    sectionAria: 'Elecciones enviadas',
    title: 'Elecciones enviadas',
    body: 'Tu voto ha quedado registrado.',
    // LAS TRES COSAS QUE SE DICEN AL CONFIRMAR, cada una en su ficha, como en la porra de origen: qué pasa con
    // tu voto, qué pasa con el de los demás y cuándo se sabrá el resultado.
    thanks: (nombre: string) => `Gracias, ${nombre}`,
    // DOS FICHAS, no tres. La tercera decía «tu papeleta solo la ves tú y quien administra»: es cierto, pero es
    // una nota de privacidad en la pantalla de la celebración, y ahí lo que hay que decir es lo que pasa ahora.
    cards: {
      oneVote: 'Un voto por persona, con tu cuenta.',
      results: 'Los resultados se publican al cerrar la edición.',
    },
    /** Lo último que se lee: esto se juega cada temporada y la gracia está en volver. */
    comeBack: 'El reto se juega cada temporada: vuelve cuando se abra el siguiente.',
    confirmTitle: 'Confirmación',
    edit: 'Corregir mi voto',
    /** Repasar lo votado sin tocar nada ni gastar oportunidad: la misma papeleta, en modo lectura. */
    see: 'Ver mis votos',
    /** Cuando se reenvía sin tocar nada: se dice que no ha costado, porque el contador no se ha movido. */
    unchanged: 'No habías cambiado nada, así que tus elecciones se quedan como estaban y no te ha costado ninguna oportunidad.',
    resultsSoon: 'Los resultados se publicarán al cerrarse la edición.',
    editHint: (quedan: number) =>
      quedan === 0
        ? 'Has gastado todas tus oportunidades: queda tal y como está.'
        : quedan === 1
          ? 'Te queda 1 oportunidad para corregirla mientras la votación siga abierta.'
          : `Te quedan ${quedan} oportunidades para corregirla mientras la votación siga abierta.`,
    toResults: 'Ver los resultados',
    toLists: 'Volver a mis listas',
  },

  // LAS DOS PUERTAS DE SALIDA del flujo, que antes no tenían pantalla y acababan en la portada sin explicar nada:
  // llegar cuando el plazo ya se ha cerrado, y volver a entrar habiendo agotado las correcciones.
  cerrada: {
    sectionAria: 'Votación cerrada',
    title: 'La votación está cerrada',
    body: 'Esta edición ya no admite votos.',
    bodyPending: 'Los resultados se publicarán en cuanto estén listos.',
    scheduled: 'La votación todavía no ha empezado.',
    toResults: 'Ver los resultados',
    toHome: 'Volver a Premios',
  },

  // COMPARTIR: un botón, dos aparatos. En móvil y tablet se abre la hoja del sistema; en el escritorio que no la
  // tiene, se copia el enlace. El rótulo dice lo que va a pasar en cada caso, que no es lo mismo.
  compartir: {
    button: 'Compartir con tus amigos',
    copy: 'Copiar el enlace para tus amigos',
    copied: '¡Enlace copiado! Reta a tus amigos para ver quién es el mejor.',
    failed: 'No se ha podido copiar. El enlace es el de la barra del navegador.',
    /** Lo que se manda al invitar a votar. Lleva el nombre de la edición, que es lo que la sitúa en el año. */
    inviteTitle: (edicion: string) => `Vota en ${edicion}`,
    inviteText: 'Acepta el reto: elige quién crees que gana cada categoría.',
    resultsTitle: (edicion: string) => `Resultados de ${edicion}`,
    resultsText: 'Mira quién ha ganado y cómo ha quedado la clasificación.',
  },

  resultados: {
    sectionAria: 'Resultados',
    title: 'Resultados',
    winners: 'Ganadores',
    leaderboard: 'Clasificación',
    // Las dos mitades de la pantalla, cada una con su rótulo de cuántas cosas trae.
    winnersCount: (cuantas: number) => (cuantas === 1 ? '1 categoría' : `${cuantas} categorías`),
    /**
     * Propio y no el del panel: «14 papeleta(s)» es una cadena de administración, no de una pantalla pública. Y
     * en lo público ya no se dice «papeleta» —se habla de lo que cada cual elige—, así que aquí se cuenta gente
     * que participó, que además es lo que se quiere saber mirando unos resultados.
     */
    ballots: (cuantas: number) => (cuantas === 1 ? '1 participación' : `${cuantas} participaciones`),
    participants: (cuantos: number) => (cuantos === 1 ? '1 participante' : `${cuantos} participantes`),
    noWinners: 'Esta edición se publicó sin ganadores marcados.',
    /** El premio propio, arriba del todo y ya dibujado: si te ha tocado, es lo primero que vienes a ver. */
    yourAward: 'Tu premio',
    yourAwardHint: (puesto: number) => `Has quedado ${puesto}.º en esta edición.`,
    positionAria: (puesto: number) => `Puesto ${puesto}`,
    points: (puntos: number) => (puntos === 1 ? '1 punto' : `${puntos} puntos`),
    yourRow: 'Tu posición',
    /** Deshace el paso: a la portada, al histórico del panel o a donde se estuviera. */
    back: 'Volver',
    trophy: 'Ver mi trofeo',
    download: 'Descargar la lámina',
    // LA GALERÍA: desde la clasificación se MIRA, y quien quiera el archivo lo pide dentro.
    see: 'Ver el trofeo',
    seeAll: 'Ver los premios',
    awardOf: (actual: number, total: number) => `${actual} de ${total}`,
    awardPrev: 'Anterior',
    awardNext: 'Siguiente',
    empty: 'Esta edición todavía no tiene resultados publicados.',
    // La clasificación enseña la cara de una amistad y la inicial del resto: es la misma regla de reciprocidad
    // del espacio social, aplicada aquí (ver §4.1 del plan).
    avatarAria: (nombre: string) => `Perfil de ${nombre}`,
  },

  // EL PANEL. Vive dentro del de administración de la app, como una vista más: no hay un segundo `/admin`.
  admin: {
    /** Rótulo del grupo de pestañas del panel, para quien navega sin ver. */
    tabsAria: 'Secciones del panel de retos',
    // PORRAS dentro del panel, «Premios» de cara al público: quien administra habla de la porra, y el nombre
    // corto distingue de un vistazo esta pantalla de la sección que ve todo el mundo.
    open: 'Retos',
    sectionAria: 'Administración de retos',
    title: 'Retos',
    back: 'Volver al panel',
    tabs: { season: 'Temporada', categories: 'Categorías' },

    season: {
      title: 'La edición',

      // ═══ LOS ESTADOS, ENUMERADOS ═══════════════════════════════════════════════════════════════════════
      // El ciclo entero a la vista con el actual marcado, en vez de una sola frase suelta: de un vistazo se ve
      // dónde está la edición, qué viene después y por qué la sección se ofrece o no.
      stagesTitle: 'El ciclo de la edición',
      stages: [
        {
          id: 'none' as const,
          label: 'Sin edición',
          hint: 'No hay votación en marcha. Se abre poniéndole nombre y día de cierre.',
        },
        {
          id: 'open' as const,
          label: 'Votación abierta',
          hint: 'Se vota hasta las 23:59 del día de cierre. Se puede cerrar antes a mano.',
        },
        {
          id: 'pending' as const,
          label: 'Cerrada, sin publicar',
          // El fin del ciclo se cuenta AQUÍ, en el paso que lo provoca, en vez de en una frase suelta debajo.
          hint: 'Toca marcar ganadores y publicarla: al hacerlo pasa al histórico y se vuelve a «Sin edición».',
        },
      ],
      stageCurrent: 'Estado actual',
      /** El pie del bloque: las dos notas de una línea, juntas y atenuadas. */
      offeredYes: 'Se ofrece en Ajustes y en el espacio social',
      offeredNo: 'No se ofrece: solo se llega con el enlace',
      lastPublished: (id: string) => `última publicada: ${id}`,
      // Corregir la edición en marcha sin cerrarla: una errata en el nombre o un día de cierre mal puesto.
      edit: 'Editar la edición',
      editSave: 'Guardar cambios',
      edited: 'Edición actualizada.',
      nameLabel: 'Nombre de la edición',
      namePlaceholder: 'El reto del jugador 2026',
      nameHint: 'De aquí sale el identificador del archivo. Sin nombre se usa el año.',
      closesLabel: 'Último día para votar',
      closesHint: 'Se cierra a las 23:59 de ese día, hora peninsular.',
      openAction: 'Abrir votación',
      closeAction: 'Cerrar ahora',
      publishAction: 'Publicar en el histórico',
      // Publicar es irreversible y destructivo: retira las papeletas y vacía los nominados.
      publishWarn: 'Al publicar se archiva la clasificación, se retiran las papeletas y se vacían los nominados. No se puede deshacer.',
      /**
       * SIN GANADORES NO HAY PUNTOS. La clasificación se calcula cruzando cada voto con el ganador de su
       * categoría: publicar sin marcar ninguno archiva una edición con todo el mundo a cero, y como al publicar
       * se retiran las papeletas, ya no hay con qué recalcularla. Es el único error de esta pantalla que no se
       * puede arreglar después.
       */
      publishNoWinners: 'No has marcado ningún ganador. Si publicas ahora, la clasificación se archiva con todo el mundo a cero y las papeletas ya no estarán para rehacerla.',
      publishSomeWinners: (marcados: number, total: number) =>
        `Vas a publicar con ${marcados} de ${total} categorías con ganador; las demás no darán puntos.`,
      closesAt: (fecha: string) => `Se cierra el ${fecha}`,
      leftovers: (cuantas: number) => `Se retiraron ${cuantas} papeleta(s) sueltas de una edición anterior.`,
      opened: (nombre: string) => `Edición «${nombre}» abierta.`,
      closed: 'Votación cerrada.',
      published: (nombre: string, votos: number) => `«${nombre}» publicada con ${votos} papeleta(s).`,
      errorDay: 'Hace falta un día de cierre que no esté en el pasado.',
      // El interruptor que decide si la sección se ofrece en Ajustes y en el espacio social.
      visibility: 'Dónde se ve',
      visibilityHint: 'Con «Según el calendario» aparece sola mientras haya votación o resultados recientes, y se retira un mes después de publicar el resultado.',
      visibleAuto: 'Según el calendario',
      visibleOn: 'Siempre a la vista',
      visibleOff: 'Oculta',
      visibilitySaved: 'Guardado dónde se ve la sección.',
    },

    // Marcar quién ganó cada categoría. Vive en un documento que solo lee el administrador: hasta que se publica
    // la edición, esto no lo ve nadie más.
    winners: {
      title: 'Ganadores',
      hint: 'Se guardan donde no los ve nadie hasta publicar la edición.',
      pick: 'Sin ganador',
      save: 'Guardar ganadores',
      saved: (cuantos: number) => `${cuantos} ganador(es) guardado(s).`,
      skipped: (cuantas: number) => `${cuantas} categoría(s) sin nominados se han omitido.`,
      migrated: (cuantas: number) => `${cuantas} categoría(s) dejan de exponer su ganador.`,
      empty: 'No hay categorías con nominados: ponlos antes de marcar ganadores.',
      count: (marcados: number, total: number) => `${marcados} de ${total} categorías con ganador`,
    },

    // El censo de papeletas de la edición en curso.
    ballots: {
      title: 'Votos',
      hint: 'Las papeletas de esta edición. Se retiran al publicarla.',
      total: (cuantas: number) => (cuantas === 1 ? '1 papeleta' : `${cuantas} papeletas`),
      none: 'Todavía no ha votado nadie.',
      voted: (cuantas: number, total: number) => `${cuantas}/${total} categorías`,
      edits: (cuantas: number) => (cuantas === 0 ? 'sin correcciones' : `${cuantas} corrección(es)`),
      sentAt: 'Enviada',
      // La clasificación PROVISIONAL, con los ganadores marcados hasta ahora: es lo que se va a publicar.
      preview: 'Clasificación provisional',
      previewHint: 'Con los ganadores marcados ahora mismo. Es lo que se publicará.',
      // Retirar la papeleta de alguien: para las pruebas y para lo que haya que quitar a mano. No se deshace.
      remove: (nombre: string) => `Retirar la papeleta de ${nombre}`,
      removeConfirm: (nombre: string) =>
        `¿Retirar la papeleta de ${nombre}? Su voto se pierde y la clasificación se recalcula sin él. No se puede deshacer.`,
    },

    // Las ediciones ya publicadas.
    history: {
      title: 'Histórico',
      hint: 'Ediciones publicadas. De un archivo solo se puede cambiar el nombre.',
      empty: 'Todavía no se ha publicado ninguna edición.',
      ballots: (cuantas: number) => `${cuantas} papeleta(s)`,
      rename: 'Renombrar',
      renamed: (nombre: string) => `Renombrada a «${nombre}».`,
      remove: 'Borrar del histórico',
      // Borrar un archivo es irreversible: los votos de esa edición se retiraron al publicarla.
      removeConfirm: (nombre: string) =>
        `¿Borrar «${nombre}» del histórico? Es lo único que queda de esa edición y no se puede recuperar.`,
      removed: (nombre: string) => `«${nombre}» borrada del histórico.`,
      repointed: (nombre: string) => `La pantalla pública pasa a enseñar «${nombre}».`,
      repointedEmpty: 'Ya no queda ninguna edición publicada que enseñar.',
      open: 'Ver resultados',
    },

    categories: {
      title: 'Categorías y nominados',
      hint: 'Los nominados se ponen cada edición; las categorías se quedan de un año para otro.',
      nominees: (cuantos: number) => (cuantos === 1 ? '1 nominado' : `${cuantos} nominados`),
      edit: 'Editar',
      create: 'Nueva categoría',
      newTitle: 'Categoría nueva',
      titleEs: 'Título (español)',
      titleEn: 'Título (inglés)',
      titleEnHint: 'Si lo dejas vacío se usa el español.',
      titleEsPlaceholder: 'Juego del año',
      titleEnPlaceholder: 'Game of the year',
      weightLabel: 'Peso',
      weightHint: 'Lo que vale acertarla. La mayoría van a 1; «Juego del año», a 3.',
      nomineesLabel: 'Nominados',
      nomineePlaceholder: (n: number) => `Nominado ${n}`,
      addNominee: 'Añadir nominado',
      removeNominee: (n: number) => `Quitar el nominado ${n}`,
      save: 'Guardar',
      saving: 'Guardando…',
      cancel: 'Cancelar',
      saved: (titulo: string) => `«${titulo}» guardada.`,
      created: (titulo: string) => `«${titulo}» creada.`,
      weight: (peso: number) => `Peso ${peso}`,
      empty: 'Todavía no hay categorías.',
      errorTitle: 'La categoría necesita un título en español.',
      // Borrar y reordenar: dos acciones que cambian lo que ve todo el mundo.
      remove: 'Eliminar',
      removeConfirm: (titulo: string) => `¿Eliminar «${titulo}»? Se pierde con sus nominados.`,
      removed: (titulo: string) => `«${titulo}» eliminada.`,
      removedKept: 'Era la última, así que se ha vaciado en vez de borrarse (la colección no puede quedarse sin documentos).',
      moveUp: (titulo: string) => `Subir ${titulo}`,
      moveDown: (titulo: string) => `Bajar ${titulo}`,
      reordered: 'Orden guardado.',
    },
  },

  // EL PALMARÉS: las ediciones ganadas, enseñadas como logros en el perfil.
  palmares: {
    title: 'Palmarés',
    // Se dice «en» y no «ganó»: un empate a primer puesto es de dos, y «ganó» sonaría a que fue el único.
    entry: (rank: number, edicion: string) => `${rank}.º en ${edicion}`,
    medalAria: (rank: number, edicion: string) => `Trofeo: ${rank}.º puesto en ${edicion}`,
    /**
     * EL TROFEO ES UN ENLACE al archivo de esa edición, y hay que decir a dónde lleva: con el rótulo suelto, un
     * lector de pantalla anunciaba «enlace, Trofeo: 1.º puesto en…» y no había forma de saber que al pulsar se
     * sale del perfil. Puesto en el enlace, sustituye a lo que digan la medalla y el rótulo de dentro, que si no
     * se leerían los dos seguidos.
     */
    entryAria: (rank: number, edicion: string) => `${rank}.º en ${edicion}: ver los resultados`,
    rarity: 'Excepcional',
    empty: 'Todavía no ha ganado ninguna edición.',
  },

  errores: {
    /** El titular lo pone el TEMA; debajo va, atenuado, lo que de verdad ha pasado. */
    leadByPalette: PREMIOS_ERROR_LEAD,
    offlineByPalette: PREMIOS_OFFLINE_LEAD,
    load: 'No se han podido cargar los premios.',
    // SIN CONEXIÓN no es lo mismo que un error: la votación sigue en pie y sus listas también; lo único que no
    // llega es el estado de la edición. Por eso se dice aparte y sin dramatismo.
    offline: 'Sin conexión: no se puede saber cómo va la edición.',
    submit: 'No se han podido enviar tus elecciones. Inténtalo de nuevo.',
    closed: 'La votación se ha cerrado mientras votabas.',
    needsSession: 'Entra con tu cuenta de Google para votar.',
    /** La misma sesión de la app: el botón llama al inicio de sesión de casa, no hay una segunda puerta. */
    needsSessionTitle: 'Identifícate para votar',
    needsSessionAria: 'Identificarse para votar',
    needsSessionHint: 'Un voto por persona: tus elecciones van asociadas a tu cuenta de Google.',
    retry: 'Reintentar',
  },
} as const;
