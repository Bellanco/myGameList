// Las TRES cadenas del armazón del espacio social: título, aviso de carga y nombre accesible de la pantalla.
//
// Existen aparte de `socialLabels` por una razón muy concreta y fácil de deshacer sin querer: el esqueleto que se
// pinta mientras el hub se descarga (`SocialHubSkeleton`, el fallback del `Suspense`) tiene que estar cargado ANTES
// que el hub, así que vive en el arranque. Mientras leía esas cadenas de `SOCIAL_UI`, arrastraba con ellas los
// ~8 kB comprimidos de todos los textos del hub al chunk inicial de cualquiera que abriera la aplicación, la usara
// o no. Aquí son unos cien bytes.
//
// No se duplican: `SOCIAL_UI` las toma de aquí, así que hay una sola fuente y no pueden divergir.
export const SOCIAL_SHELL = {
  hubTitle: 'Espacio social',
  loading: 'Cargando espacio social...',
  screenAria: 'Social',
} as const;
