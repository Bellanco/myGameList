// LAS DIRECCIONES DEL HUB SOCIAL, solas: los patrones de react-router de cada sub-ruta. Aparte de `socialRoutes.ts`
// (que además las resuelve con `matchPath`) porque hay quien solo necesita armar una dirección desde fuera del hub:
// la ficha de un juego lleva al perfil de una amistad, y su chunk va precacheado, así que cada byte cuenta en el
// presupuesto total (`scripts/ci-validate.js`). `socialRoutes.ts` las reexporta: quien ya las importaba de allí, sigue.
export const SOCIAL_ROUTES = {
  profileEdit: '/social/profile',
  profiles: '/social/profiles',
  requests: '/social/requests',
  profileDetail: '/social/profiles/:profileId',
  profileReviews: '/social/profiles/:profileId/reviews',
  profilePosts: '/social/profiles/:profileId/posts',
  // El listado de logros de esa persona. Sub-ruta del hub y no de primer nivel (a diferencia de `/logros`, que es
  // el tuyo): sin el perfil delante, la dirección no diría de quién son.
  profileAchievements: '/social/profiles/:profileId/logros',
  profileGlobals: '/social/profiles/:profileId/globales',
  profileReview: '/social/profiles/:profileId/game/:gameId/review',
  activityDetail: '/social/user/:userId/game/:gameId/:eventType',
} as const;
