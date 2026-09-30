// Textos de la tarjeta «Instalar la aplicación» de Ajustes › Diseño, la puerta para quien cerró el aviso del
// principio o no llegó a verlo.
//
// En un fichero propio y diminuto a propósito, como `onboardingCardLabels`: los de Ajustes (`settingsLabels`)
// viajan en el arranque, y esto solo lo necesita una pantalla perezosa.
export const INSTALL_CARD = {
  title: 'Instalar la aplicación',
  /** Lo que se gana, en una frase: lo mismo que promete el aviso del principio. */
  lead: 'Ábrela como una app más: con su icono, sin la barra del navegador y aunque no haya conexión.',
  /** Hay oferta del navegador: el botón abre su diálogo. */
  add: 'Instalar',
  /** Safari de iOS no ofrece nada que atrapar: se instala a mano desde el menú de compartir. */
  ios: 'Pulsa Compartir y después «Añadir a la pantalla de inicio».',
} as const;
