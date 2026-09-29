// Textos de la tarjeta «Primeros pasos» de Ajustes › Datos, desde la que se abre o se repite la guía.
//
// En un fichero propio y diminuto a propósito: los de Ajustes (`settingsLabels`) viajan en el arranque, y los de
// la guía (`onboardingLabels`) son un chunk entero que la pantalla de Ajustes arrastraría sin usar.
export const TOUR_CARD = {
  title: 'Primeros pasos',
  text: 'Una guía corta por lo básico: añadir juegos, guardar tus listas en la nube y el modo cooperativo. Te sigue según navegas.',
  open: 'Ver la guía',
  resume: 'Seguir la guía',
  repeat: 'Repetir la guía',
  doneNote: 'Ya la terminaste. Puedes repetirla cuando quieras.',
} as const;
