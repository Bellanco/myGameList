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
    // Sin edición abierta ni resultados: es enero y aquí no hay nada. Se dice sin dramatismo.
    empty: 'Ahora mismo no hay ninguna edición en marcha.',
    emptyHint: 'Cuando se abra la siguiente, aparecerá aquí.',
  },

  votar: {
    sectionAria: 'Votación',
    categoryOf: (actual: number, total: number) => `Categoría ${actual} de ${total}`,
    chooseOne: 'Elige tu favorito',
    chosen: 'Tu elección',
    previous: 'Anterior',
    next: 'Siguiente',
    skip: 'Saltar',
    review: 'Revisar',
    // Lo que se pinta en la tarjeta de un nominado que YA está en tu biblioteca. Es el cruce que hace que esta
    // sección sea parte de la app y no un inquilino (ver docs/plan-unificar-premios.md §6.5).
    inYourLibrary: {
      c: 'Lo terminaste',
      v: 'Lo dejaste',
      e: 'Lo estás jugando',
      p: 'Lo tienes pendiente',
    } as Record<string, string>,
    yourGrade: (nota: string) => `Tu nota: ${nota}`,
    nomineeAria: (nombre: string) => `Votar por ${nombre}`,
    nomineeChosenAria: (nombre: string) => `${nombre}, tu elección actual`,
  },

  revisar: {
    sectionAria: 'Revisión de la papeleta',
    title: 'Revisa tu papeleta',
    subtitle: 'Puedes cambiar cualquier voto antes de enviarla.',
    nameLabel: 'Nombre para la clasificación',
    namePlaceholder: 'Escribe tu nombre o apodo',
    nameHint: 'Es el que verá el resto en la clasificación.',
    voted: (votadas: number, total: number) => `${votadas} de ${total} categorías votadas`,
    notVoted: 'Sin votar',
    pending: (cuantas: number) =>
      cuantas === 1 ? 'Queda 1 categoría por votar' : `Quedan ${cuantas} categorías por votar`,
    submit: 'Enviar papeleta',
    submitting: 'Enviando…',
    back: 'Volver a votar',
    editsLeft: (quedan: number) =>
      quedan === 1 ? 'Podrás corregirla 1 vez más' : `Podrás corregirla ${quedan} veces más`,
    noEditsLeft: 'Esta es tu última corrección',
  },

  enviada: {
    sectionAria: 'Papeleta enviada',
    title: 'Papeleta enviada',
    body: 'Tu voto ha quedado registrado.',
    resultsSoon: 'Los resultados se publicarán al cerrarse la edición.',
    editHint: (quedan: number) =>
      quedan > 0 ? 'Puedes corregirla mientras la votación siga abierta.' : 'Ya no quedan correcciones.',
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

  yaVotaste: {
    title: 'Tu papeleta ya está enviada',
    body: 'Has gastado todas las correcciones, así que queda tal y como está.',
    review: 'Ver lo que voté',
  },

  resultados: {
    sectionAria: 'Resultados',
    title: 'Resultados',
    winners: 'Ganadores',
    leaderboard: 'Clasificación',
    points: (puntos: number) => (puntos === 1 ? '1 punto' : `${puntos} puntos`),
    rank: (puesto: number) => `${puesto}.º`,
    yourRow: 'Tu posición',
    trophy: 'Ver mi trofeo',
    download: 'Descargar',
    empty: 'Esta edición todavía no tiene resultados publicados.',
    // La clasificación enseña la cara de una amistad y la inicial del resto: es la misma regla de reciprocidad
    // del espacio social, aplicada aquí (ver §4.1 del plan).
    avatarAria: (nombre: string) => `Perfil de ${nombre}`,
  },

  // EL PANEL. Vive dentro del de administración de la app, como una vista más: no hay un segundo `/admin`.
  admin: {
    open: 'Premios',
    sectionAria: 'Administración de premios',
    title: 'Premios',
    back: 'Volver al panel',
    tabs: { season: 'Temporada', categories: 'Categorías' },

    season: {
      title: 'La edición',
      stageNone: 'No hay ninguna edición en marcha.',
      stageOpen: 'Se está votando.',
      stagePending: 'Cerrada y pendiente de publicar.',
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
      closesAt: (fecha: string) => `Se cierra el ${fecha}`,
      leftovers: (cuantas: number) => `Se retiraron ${cuantas} papeleta(s) sueltas de una edición anterior.`,
      opened: (nombre: string) => `Edición «${nombre}» abierta.`,
      closed: 'Votación cerrada.',
      published: (nombre: string, votos: number) => `«${nombre}» publicada con ${votos} papeleta(s).`,
      errorDay: 'Hace falta un día de cierre que no esté en el pasado.',
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
    submit: 'No se ha podido enviar la papeleta. Inténtalo de nuevo.',
    closed: 'La votación se ha cerrado mientras votabas.',
    needsSession: 'Entra con tu cuenta de Google para votar.',
    retry: 'Reintentar',
  },
} as const;
