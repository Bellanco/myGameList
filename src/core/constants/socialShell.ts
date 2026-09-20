// Las cadenas del ARMAZÓN del espacio social: las que se pintan antes de que exista el hub.
//
// Existen aparte de `socialLabels` por una razón muy concreta y fácil de deshacer sin querer: el armazón que se
// pinta mientras el hub se descarga (`FeedShell` dentro de `SocialHubSkeleton`, el fallback del `Suspense`) tiene
// que estar cargado ANTES que el hub, así que vive en el arranque. Mientras leía esas cadenas de `SOCIAL_UI`,
// arrastraba con ellas los ~8 kB comprimidos de todos los textos del hub al chunk inicial de cualquiera que
// abriera la aplicación, la usara o no. Aquí son unos cientos de bytes.
//
// No se duplican: `SOCIAL_UI` las toma de aquí, así que hay una sola fuente y no pueden divergir.
export const SOCIAL_SHELL = {
  hubTitle: 'Espacio social',
  loading: 'Cargando espacio social...',
  screenAria: 'Social',
  /**
   * Lo que dice el armazón de la ACTIVIDAD (cabecera, fila de botones y compositor). Bajaron aquí al hacerse
   * compartido ese armazón: lo pintan la pantalla real y su esqueleto, y el esqueleto va en el arranque.
   */
  feed: {
    sectionAria: 'Social',
    title: 'Actividad social',
    subtitle: 'Descubre perfiles públicos, análisis y recomendaciones destacadas de otros jugadores.',
    actionsAria: 'Acciones de la actividad',
    openProfiles: 'Ver perfiles',
    openOwnProfile: 'Ver mi perfil',
    openRequests: 'Solicitudes',
    // La porra de premios. El botón es solo icono, así que este texto ES su nombre accesible, no un adorno.
    openPremios: 'Premios',
    openRequestsAria: (count: number) =>
      count > 0 ? `Solicitudes de amistad, ${count} pendiente${count === 1 ? '' : 's'}` : 'Solicitudes de amistad',
    signOut: 'Cerrar sesión',
    activityTitle: 'Actividad',
    postsTitle: 'Publicaciones',
    postComposerLabel: 'Comparte una noticia o un enlace',
    postPlaceholder: 'Comparte una noticia o un enlace…',
    postPublish: 'Publicar',
  },
} as const;
