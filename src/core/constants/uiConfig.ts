export const HOURS_RANGES = [
  { key: '0-5', label: 'Menos de 5 horas', shortLabel: 'Menos de 5h', check: (h: number) => h > 0 && h <= 5 },
  { key: '5-10', label: 'De 5 a 10 horas', shortLabel: '5 - 10h', check: (h: number) => h > 5 && h <= 10 },
  { key: '10-20', label: 'De 10 a 20 horas', shortLabel: '10 - 20h', check: (h: number) => h > 10 && h <= 20 },
  { key: '20-40', label: 'De 20 a 40 horas', shortLabel: '20 - 40h', check: (h: number) => h > 20 && h <= 40 },
  { key: '40-80', label: 'De 40 a 80 horas', shortLabel: '40 - 80h', check: (h: number) => h > 40 && h <= 80 },
  { key: '80-150', label: 'De 80 a 150 horas', shortLabel: '80 - 150h', check: (h: number) => h > 80 && h <= 150 },
  { key: '150+', label: 'Más de 150 horas', shortLabel: 'Más de 150h', check: (h: number) => h > 150 },
] as const;

/**
 * Anchos a los que el layout cambia de forma. Son los MISMOS números que las `@media` de las hojas
 * (`_table.scss`, `_overlays-and-responsive.scss`), y viven aquí porque hay código que necesita saberlo:
 * `App` conmuta las clases `compact-filters` / `table-compact` del `<body>`, y `GameTable` calcula con ellos la
 * altura estimada de fila que usa el virtualizador. Si se mueven aquí, hay que moverlos también en el SCSS.
 */
export const COMPACT_TABLE_MAX_WIDTH = 1100;
export const COMPACT_FILTERS_MAX_WIDTH = 1400;

/**
 * Lo que tarda una fila en irse del listado, en milisegundos. Mismo número que la animación `rowLeave` de
 * `_motion.scss`, y aquí porque `App` tiene que esperarlo: el borrado se APLAZA hasta que la fila termina de
 * desvanecerse, o no habría nada que animar (el dato desaparece y con él la fila, en el mismo fotograma).
 * Si se toca uno, hay que tocar el otro: de más, la fila ya invisible retrasa el borrado; de menos, se corta.
 */
export const ROW_EXIT_MS = 220;
