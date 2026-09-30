// Textos de la guía de primeros pasos.
//
// Aparte de `labels.ts` por el mismo motivo que `rouletteLabels`: la guía llega en un chunk perezoso que solo
// descarga quien la tiene en marcha, y en `labels.ts` viajarían en el arranque de todo el mundo. El único texto
// suyo que vive fuera es el de la tarjeta de Ajustes › Datos (`onboardingCardLabels`), porque la pinta Ajustes.
//
// EL TONO LLEVA GUIÑO a propósito, y el guiño son los nombres de los logros de primeros pasos que ya existen
// («Empieza la partida», «Partida en la nube», «Tutorial superado»): la guía y la pantalla de logros hablan de lo
// mismo con las mismas palabras.
import type { MissionId } from '../onboarding/tourState';
import type { StepId } from '../onboarding/tourSteps';

export interface StepText {
  title: string;
  text: string;
  /** Rótulo del aviso «tócalo tú» de los pasos de acción y navegación. */
  tap?: string;
}

interface MissionText {
  name: string;
  sub: string;
  /** Cabecera de sus burbujas. */
  kicker: string;
  time?: string;
}

export const TOUR_UI = {
  welcome: {
    kicker: 'Nueva partida',
    title: '¡Pulsa Start!',
    text: 'Te acompaño en los primeros minutos: una misión cada vez, y la guía te sigue según vas pasando por las pantallas.',
    start: 'Empezar',
    later: 'Ahora no',
    note: 'Puedes retomarla cuando quieras desde el botón de la izquierda o en Ajustes › Datos.',
  },
  menu: {
    kicker: 'Primeros pasos',
    title: 'Tus misiones',
    resume: 'Seguir',
    exit: 'Salir de la guía',
    note: 'Toca una misión para hacerla ahora. Si sales, la guía vuelve desde Ajustes › Datos.',
    now: 'Ahora',
    done: 'Hecha',
    skipped: 'Saltada',
    secondary: 'Secundaria',
  },
  missions: {
    'first-game': { name: 'Empieza la partida', sub: 'Añade tu primer juego', kicker: 'Misión 1 · Empieza la partida', time: '1 min' },
    cloud: { name: 'Partida en la nube', sub: 'Guarda tus listas en GitHub', kicker: 'Misión 2 · Partida en la nube', time: '1 min' },
    library: { name: 'Trae tu biblioteca', sub: 'Desde Playnite · solo Windows', kicker: 'Misión secundaria' },
    coop: { name: 'Modo cooperativo', sub: 'Lo social, e invita a un amigo', kicker: 'Misión 3 · Modo cooperativo', time: '2 min' },
  } satisfies Record<MissionId, MissionText>,
  steps: {
    'to-lists': { title: 'Vuelve a tus listas', text: 'Esta misión se juega en los listados. Toca aquí y seguimos.', tap: 'Toca «Listados»' },
    lists: {
      title: 'Cuatro listas, una biblioteca',
      text: 'Completados, abandonados, en curso y próximos. Cada juego vive en una, y cambia de lista cuando cambia su historia.',
    },
    add: {
      title: 'Añade tu primer juego',
      text: 'Pulsa el «+». Con el nombre y la nota basta; la reseña puede esperar.',
      tap: 'Tócalo tú: te espero aquí',
    },
    added: {
      title: '¡Empieza la partida!',
      text: 'Tu primer juego ya está en la lista. Tócalo para editarlo o escribir tu reseña. Y si no sabes a qué jugar, el dado elige por ti.',
    },
    'to-settings': { title: 'Rumbo a Ajustes', text: 'Esto se hace en Ajustes › Datos. Toca aquí abajo y te sigo.', tap: 'Toca «Ajustes»' },
    'to-data': { title: 'Aquí, en Datos', text: 'Tus datos viven juntos: importar, exportar y sincronizar.', tap: 'Toca «Datos»' },
    sync: {
      title: 'Guarda la partida',
      text: 'Lo que ganas lo tienes en la tarjeta. Conectar es un solo botón: te identificas en GitHub y vuelves aquí. Sin tokens ni configuración.',
      tap: 'Pulsa «Conectar con GitHub»: te espero a la vuelta',
    },
    synced: {
      title: '¡Partida en la nube!',
      text: 'Conectado. A partir de ahora tus cambios se guardan solos y te siguen a cualquier dispositivo.',
    },
    'library-offer': {
      title: 'Trae tu biblioteca',
      text: '¿Juegas en PC con Windows? Playnite junta Steam, GOG, Epic y compañía, y aquí los traes de una vez. Si no, sáltala: no te pierdes nada.',
    },
    'library-import': {
      title: 'Con el fichero en la mano',
      text: 'Sigue la guía de arriba y, cuando tengas el .json exportado, elígelo aquí. Si ahora no puedes, sigue y vuelve cuando quieras.',
      tap: 'Pulsa «Importar de Playnite»',
    },
    'library-inbox': {
      title: 'Tu biblioteca, en la bandeja',
      text: 'Los juegos esperan aquí 30 días. Clasifícalos en una lista o descártalos: solo entra lo que tú elijas.',
    },
    'to-social': { title: 'Rumbo a lo social', text: 'El modo cooperativo está en Social. Toca aquí y te sigo.', tap: 'Toca «Social»' },
    'coop-sync': {
      title: 'Primero, la nube',
      text: 'Lo social guarda tus listas en tu propio GitHub. Es un solo botón, sin tokens: conecta aquí y volvemos al modo cooperativo.',
      tap: 'Pulsa «Conectar con GitHub»',
    },
    gateway: {
      title: 'Mira qué juegan tus amigos',
      text: 'Son dos pasos: tu GitHub y entrar con Google. Te falta el primero: te llevo y volvemos aquí.',
      tap: 'Toca el botón del paso 1',
    },
    google: {
      title: 'Entra con Google',
      text: 'Te identificas con tu cuenta de Google y se crea tu espacio social. Tus amigos no ven tu correo.',
      tap: 'Pulsa «Entrar con Google»',
    },
    profile: {
      title: 'Elige tu nombre',
      text: 'Es como te verán tus amigos. Escríbelo aquí; para crear el perfil hace falta al menos un juego completado.',
    },
    'profile-save': {
      title: 'Guarda tu perfil',
      text: 'Un toque y listo: tu perfil queda activo y ya puedes buscar a tus amigos.',
      tap: 'Pulsa «Guardar perfil»',
    },
    'coop-done': {
      title: '¡Modo cooperativo activado!',
      text: 'Tu perfil está listo. Ahora falta lo mejor: traer a tu gente.',
    },
    invite: { title: 'Invita a un amigo', text: 'La partida es mejor a dobles. Mándale el enlace y, cuando entre, buscaos en Amigos para enviaros la solicitud.' },
  } satisfies Record<StepId, StepText>,
  /**
   * «VUELVE A ENTRAR»: quien ya tenía lo social y ha perdido la sesión. Nunca se le cuenta cómo crear un espacio,
   * que ya tiene: solo que siga ahí y cómo volver.
   */
  relogin: {
    kicker: 'Tu espacio social',
    title: 'Vuelve a entrar',
    text: 'Tu espacio y tus amigos siguen ahí: entra con Google y vuelves a tu actividad.',
    textNeedsSync: 'Tu espacio y tus amigos siguen ahí: conecta GitHub y entra con Google para volver a tu actividad.',
  },
  /** El ofrecimiento de UNA misión en su pantalla, para quien ya usaba la aplicación. */
  hints: {
    kicker: 'Primeros pasos',
    yes: 'Enséñame',
    no: 'No, gracias',
    coop: { title: '¿Te enseño a entrar en lo social?', text: 'Son dos pasos y tu nombre: te acompaño en cada uno.' },
    cloud: { title: '¿Te enseño a guardar tus listas en la nube?', text: 'Es un solo botón, sin tokens: te acompaño.' },
  },
  nextMission: 'Siguiente misión',
  missionDoneKicker: 'Misión cumplida',
  optional: 'Opcional',
  buttons: {
    next: 'Siguiente',
    skip: 'Saltar',
    skipStep: 'Saltar paso',
    skipMission: 'Saltar misión',
    later: 'Más tarde',
    go: 'Vamos',
    noPlaynite: 'No uso Playnite',
    openGuide: 'Ver la guía',
    continueTour: 'Seguir con la guía',
    fold: 'Plegar la guía',
    close: 'Cerrar',
  },
  pill: {
    title: (done: number, total: number) => `Primeros pasos · ${done} de ${total}`,
    next: (mission: string) => `Sigue: ${mission}`,
    aria: (done: number, total: number) => `Primeros pasos: ${done} de ${total} misiones. Abrir la guía`,
    /** Vuelta de una sola misión: el botón dice cuál, no un recuento de misiones que no se están haciendo. */
    single: 'Sigue donde lo dejaste',
    singleAria: (mission: string) => `Guía: ${mission}. Seguir`,
  },
  finale: {
    kicker: 'Primeros pasos',
    title: 'Tutorial superado',
    text: 'Ya sabes lo básico. La guía se retira; si quieres repasarla, está en Ajustes › Datos.',
    cta: '¡A jugar!',
  },
  regionAria: 'Guía de primeros pasos',
} as const;
