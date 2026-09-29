// Textos de «Invita a un amigo»: el enlace, su vista previa y los botones de compartir y copiar.
//
// En su propio fichero porque lo pintan DOS chunks perezosos —el último paso de la guía de primeros pasos y la
// pantalla de Amigos del hub social— y ninguno de los dos debería arrastrar los textos enteros del otro.
export const INVITE_UI = {
  /** La dirección COMPLETA, con la pestaña de entrada: es la que se ve, la que se copia y la que se comparte. */
  url: 'https://mygamelist.pages.dev/completados',
  shareTitle: 'My Game List',
  shareText: 'Llevo aquí mis listas de juegos. ¿Te apuntas y nos seguimos?',
  share: 'Compartir enlace',
  copy: 'Copiar enlace',
  copied: 'Enlace copiado',
  copyFailed: 'No se pudo copiar: mantén pulsado el enlace para copiarlo.',
  later: 'Ahora no',
  previewAlt: 'Vista previa del enlace: la portada de My Game List',
} as const;
