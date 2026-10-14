// Textos del formulario de juego (`FormModal`) y de su selector de estrellas (`StarPicker`).
//
// Aparte de `labels.ts` por peso: el modal llega por un chunk perezoso y en `labels.ts` viajarían en el arranque.
// Los mensajes de VALIDACIÓN se quedan allí (`VALIDATION_MESSAGES`): los escribe `useGameListViewModel`, que sí
// está en el arranque.
import { APP_LOCALE } from './locale';

export const FORM_UI = {
  newTitle: 'Nuevo juego',
  editTitle: 'Editar juego',
  // Sin asterisco: lo obligatorio va arriba con campos rellenos y lo opcional en la bandeja de abajo, más ligera.
  nameLabel: 'Nombre',
  // Nunca un ejemplo dentro del campo: «The Witcher 3» o «40» se pueden tomar por un valor ya escrito. Los campos
  // de etiquetas dicen la acción, empezando por el verbo («Añadir etiqueta» es la convención).
  namePlaceholder: 'Nombre del juego',
  platformsPlaceholder: 'Añade una plataforma',
  genresPlaceholder: 'Añade un género',
  genresLabel: 'Géneros',
  platformsLabel: 'Plataformas',
  scoreLabel: 'Puntuación',
  interestLabel: 'Interés',
  yearsLabel: 'Años completado',
  yearsPlaceholder: 'Añade un año',
  hoursLabel: 'Horas jugadas',
  hoursPlaceholder: 'Horas',
  strengthsLabel: 'Puntos fuertes',
  strengthsPlaceholder: 'Lo que más te ha gustado',
  weaknessesLabel: 'Puntos débiles',
  weaknessesPlaceholder: 'Lo que menos te ha gustado',
  reasonsLabel: 'Razones',
  reasonsPlaceholder: '¿Por qué lo dejaste?',
  steamDeck: 'Steam Deck',
  reviewLabel: 'Análisis',
  reviewPlaceholder: 'Un pequeño análisis del juego.',
  charCount: (count: number, max: number) => `${count.toLocaleString(APP_LOCALE)} / ${max.toLocaleString(APP_LOCALE)} caracteres`,
  // A11y-3: mensajes de umbral para lectores de pantalla (texto constante por banda → se anuncian una vez al
  // cruzar el umbral, no en cada pulsación). El conteo numérico se deja como texto visible SIN aria-live.
  charNearLimit: 'Te acercas al límite de caracteres del análisis.',
  charLimitReached: 'Has alcanzado el límite de caracteres del análisis.',
  // Bajo cada campo de etiquetas, siempre: cómo pasa lo escrito a etiqueta (y que con comas entran varias).
  enterToAddHint: 'Pulsa Enter o separa con comas',
  // Sugerencias de un toque bajo cada campo de etiquetas (nombre del grupo y de cada botón, para el lector).
  quickPicks: {
    platforms: 'Tus plataformas más usadas',
    genres: 'Tus géneros más usados',
    years: 'Años recientes',
    strengths: 'Puntos fuertes sugeridos',
    weaknesses: 'Puntos débiles sugeridos',
    reasons: 'Razones sugeridas',
    /** La fila cuando está filtrada por lo que se está escribiendo. */
    matching: 'Coincidencias con lo escrito',
    add: (value: string | number) => `Añadir ${value}`,
  },
  gradeAria: 'Nota',
  gradeNumberAria: 'Nota, en número',
  close: 'Cerrar',
  cancel: 'Cancelar',
  save: 'Guardar',
  // «Añadir otro»: guarda y deja el formulario abierto con un alta nueva. Botón secundario: Guardar manda.
  addAnother: 'Añadir otro',
  batchCount: (count: number) => (count === 1 ? '1 añadido' : `${count} añadidos`),
  savedKeepNotice: (name: string, keepsYears: boolean) =>
    `«${name}» guardado. Se mantienen ${keepsYears ? 'plataformas y año' : 'las plataformas'}.`,
  // El atajo de teclado no se enseña en el pie: solo en la descripción (al pasar por encima) del botón que dispara.
  shortcutTitle: (action: string, isMac: boolean) => `${action} (${isMac ? '⌘' : 'Ctrl'} + Enter)`,
} as const;

export const STAR_PICKER_UI = {
  groupAria: 'Seleccionar puntuación',
  starAria: (star: number) => `${star} estrella${star > 1 ? 's' : ''}`,
} as const;
