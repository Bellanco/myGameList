// Textos de la tarjeta «Instalar la aplicación» de Ajustes › Diseño, la puerta para quien cerró el aviso del
// principio o no llegó a verlo.
//
// En un fichero propio y diminuto a propósito, como `onboardingCardLabels`: los de Ajustes (`settingsLabels`)
// viajan en el arranque, y esto solo lo necesita una pantalla perezosa.
export const INSTALL_CARD = {
  title: 'Instalar la aplicación',
  lead: 'Añádela a tu pantalla de inicio y ábrela como una app más.',
  /** Lo que se gana, en tres líneas: lo mismo que promete el aviso del principio, a la vista antes de decidir. */
  perks: ['Sin la barra del navegador', 'Arranca aunque no haya conexión', 'Con su icono, junto a tus apps'],
  /** Hay oferta del navegador: el botón abre su diálogo. */
  add: 'Añadir a la pantalla de inicio',
  /** Safari de iOS no ofrece nada que atrapar: se instala a mano desde el menú de compartir. */
  ios: 'En Safari, pulsa Compartir y después «Añadir a la pantalla de inicio».',
  /** Ni oferta ni iOS: Chromium sin oferta en esta visita, Firefox para Android… Algunos (Firefox en ordenador) no lo permiten. */
  manual: 'Búscalo en el menú del navegador: «Instalar aplicación» o «Añadir a la pantalla de inicio». Algunos navegadores de ordenador no lo permiten.',
} as const;
