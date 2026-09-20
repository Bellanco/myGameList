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

    categories: {
      title: 'Categorías y nominados',
      hint: 'Los nominados se ponen cada edición; las categorías se quedan de un año para otro.',
      nominees: (cuantos: number) => (cuantos === 1 ? '1 nominado' : `${cuantos} nominados`),
      edit: 'Editar nominados',
      nomineesLabel: 'Un nominado por línea',
      save: 'Guardar',
      saving: 'Guardando…',
      cancel: 'Cancelar',
      saved: (titulo: string) => `Nominados de «${titulo}» guardados.`,
      weight: (peso: number) => `Peso ${peso}`,
      empty: 'Todavía no hay categorías.',
    },
  },

  errores: {
    load: 'No se han podido cargar los premios.',
    submit: 'No se ha podido enviar la papeleta. Inténtalo de nuevo.',
    closed: 'La votación se ha cerrado mientras votabas.',
    needsSession: 'Entra con tu cuenta de Google para votar.',
    retry: 'Reintentar',
  },
} as const;
