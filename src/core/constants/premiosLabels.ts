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

  errores: {
    load: 'No se han podido cargar los premios.',
    submit: 'No se ha podido enviar la papeleta. Inténtalo de nuevo.',
    closed: 'La votación se ha cerrado mientras votabas.',
    needsSession: 'Entra con tu cuenta de Google para votar.',
    retry: 'Reintentar',
  },
} as const;
