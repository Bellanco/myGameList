// Textos del formulario de juego (`FormModal`) y de su selector de estrellas (`StarPicker`).
//
// Aparte de `labels.ts` por peso: el modal llega por un chunk perezoso y en `labels.ts` viajarían en el arranque.
// Los mensajes de VALIDACIÓN se quedan allí (`VALIDATION_MESSAGES`): los escribe `useGameListViewModel`, que sí
// está en el arranque.
import { APP_LOCALE } from './locale';

export const FORM_UI = {
  // El hint también hace de "spacer" invisible (aria-hidden) en los campos que no son de etiquetas, para que
  // las columnas de una misma fila queden alineadas aunque solo una lleve texto de ayuda.
  enterToAddHint: 'Pulsa Enter o separa con comas',
  newTitle: 'Nuevo juego',
  editTitle: 'Editar juego',
  nameLabel: 'Nombre *',
  namePlaceholder: 'Ej: The Witcher 3',
  genresLabel: 'Géneros',
  genresPlaceholder: 'Ej: Acción',
  platformsLabel: 'Plataformas',
  platformsPlaceholder: 'Ej: PC',
  scoreLabel: 'Puntuación',
  scoreToggle: 'Puntuar este juego',
  scoreToggleHint: 'Activa la puntuación de este juego. Si no la activas, no cuenta en la ruleta.',
  interestLabel: 'Interés',
  yearsLabel: 'Años completado',
  yearsPlaceholder: (year: number) => `Ej: ${year}`,
  hoursLabel: 'Horas jugadas',
  hoursPlaceholder: 'Ej: 120',
  strengthsLabel: 'Puntos fuertes',
  strengthsPlaceholder: 'Ej: Combate',
  weaknessesLabel: 'Puntos débiles',
  weaknessesPlaceholder: 'Ej: Repetitivo',
  reasonsLabel: 'Razones',
  reasonsPlaceholder: 'Ej: Falta de tiempo',
  steamDeck: 'Steam Deck',
  reviewLabel: 'Análisis',
  reviewPlaceholder: 'Ej: Historia sólida, combate excelente y gran ambientación.',
  charCount: (count: number, max: number) => `${count.toLocaleString(APP_LOCALE)} / ${max.toLocaleString(APP_LOCALE)} caracteres`,
  // A11y-3: mensajes de umbral para lectores de pantalla (texto constante por banda → se anuncian una vez al
  // cruzar el umbral, no en cada pulsación). El conteo numérico se deja como texto visible SIN aria-live.
  charNearLimit: 'Te acercas al límite de caracteres del análisis.',
  charLimitReached: 'Has alcanzado el límite de caracteres del análisis.',
  close: 'Cerrar',
  cancel: 'Cancelar',
  save: 'Guardar',
} as const;

export const STAR_PICKER_UI = {
  groupAria: 'Seleccionar puntuación',
  starAria: (star: number) => `${star} estrella${star > 1 ? 's' : ''}`,
} as const;
