export const UI_BREAKPOINTS = {
  tableCompact: 1100,
  filtersCompact: 1400,
} as const;

export const GIST_DEBOUNCE_MS = 1800;
export const SEARCH_DEBOUNCE_MS = 220;

export const HOURS_RANGES = [
  { key: '0-5', label: 'Menos de 5 horas', shortLabel: 'Menos de 5h', check: (h: number) => h > 0 && h <= 5 },
  { key: '5-10', label: 'De 5 a 10 horas', shortLabel: '5 - 10h', check: (h: number) => h > 5 && h <= 10 },
  { key: '10-20', label: 'De 10 a 20 horas', shortLabel: '10 - 20h', check: (h: number) => h > 10 && h <= 20 },
  { key: '20-40', label: 'De 20 a 40 horas', shortLabel: '20 - 40h', check: (h: number) => h > 20 && h <= 40 },
  { key: '40-80', label: 'De 40 a 80 horas', shortLabel: '40 - 80h', check: (h: number) => h > 40 && h <= 80 },
  { key: '80-150', label: 'De 80 a 150 horas', shortLabel: '80 - 150h', check: (h: number) => h > 80 && h <= 150 },
  { key: '150+', label: 'Más de 150 horas', shortLabel: 'Más de 150h', check: (h: number) => h > 150 },
] as const;
