// Textos del modal de la ruleta.
//
// Aparte de `labels.ts` por el mismo motivo que `shareLabels`: el modal llega por un chunk perezoso (lo abre el
// botón flotante del listado o el perfil de otra persona), y en `labels.ts` viajarían en el arranque. El botón de
// la tarjeta —qué se hace con el juego que ha salido— sí está allí (`UI_MESSAGES.rouletteActions`), porque lo
// escribe quien abre el modal, no el modal.

export const ROULETTE_UI = {
  /** El rótulo de la tarjeta cuando quien abre el modal no le pone uno (la lista de la que sale el juego). */
  defaultTag: 'Tu próximo juego',
  hintSpinning: 'Girando…',
  hintIdle: 'Pulsa para girar',
  hintAgain: 'Pulsa para volver a girar',
  back: 'Atrás',
  close: 'Cerrar',
  empty: 'No hay juegos elegibles para sortear.',
  spinAria: 'Girar la ruleta',
  openReviewAria: 'Ver la reseña completa',
  picking: 'Eligiendo…',
  placeholder: 'Tu próximo juego aparecerá aquí',
} as const;
