// TEXTOS DEL BUSCADOR GENERAL (docs/plan-notificaciones-y-buscador.md). Van aparte y no en `labels.ts` porque solo
// los usa el buscador, que llega por `lazy()`: en `labels.ts` viajarían en el arranque de todo el mundo.

/** ¿Se escribe en un Mac? Decide si el atajo se enseña como ⌘K o como Ctrl+K. */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export const SEARCH_UI = {
  /** El botón flotante de los listados. */
  launcher: (mac: boolean) => `Buscar (${mac ? '⌘K' : 'Ctrl+K'})`,
  dialogLabel: 'Buscar en la aplicación',
  inputLabel: 'Buscar juegos, reseñas, amistades y pantallas',
  // Corto a propósito (decisión del usuario, 13-10-2026): sin instrucciones dentro del panel.
  placeholder: 'Buscar',
  groups: {
    games: 'Tus juegos',
    reviews: 'Reseñas',
    friends: 'Amistades',
    pages: 'Ir a…',
  },
  /** El «Ver más» de un grupo recortado. */
  showMore: (remaining: number) => `Ver ${remaining} más`,
  empty: (query: string) => `No hay nada que coincida con «${query}».`,
  /** Para el lector de pantalla, cada vez que cambian los resultados. */
  resultsStatus: (count: number) => (count === 0 ? 'Sin resultados' : `${count} resultado${count === 1 ? '' : 's'}`),
  details: {
    ownReview: 'Tu reseña',
    reviewBy: (name: string) => `Reseña de ${name}`,
    friend: 'Perfil de tu amistad',
    page: 'Pantalla',
    settings: 'Ajustes',
  },
  pages: {
    stats: 'Estadísticas',
    achievements: 'Logros',
    reviews: 'Mis reseñas',
    social: 'Espacio social',
    profiles: 'Perfiles',
    settingsDesign: 'Diseño',
    settingsFilters: 'Filtros',
    settingsData: 'Datos',
    inbox: 'Bandeja de importación',
  },
} as const;
