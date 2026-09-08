// Interruptores de despliegue de los logros. Mismo patrón que `ENABLE_GAMES_OVERFLOW_GISTS` en `gistRepository`:
// una constante en el código, no una variable de entorno, para que apagarla sea una línea revisable en el diff.
//
// Están SEPARADOS a propósito, porque protegen dos cosas distintas:
//
//  - `ENABLE_ACHIEVEMENTS` gobierna la INTERFAZ: el apartado del panel, `/logros`, la tira de la ficha y la
//    entrada del feed. Apagarlo esconde la función entera sin tocar nada más.
//  - `ENABLE_ACHIEVEMENTS_PUBLISH` gobierna la ESCRITURA del espejo en `profiles/{uid}.achievements` (F3, ver
//    docs/plan-logros.md §9.1). Va aparte porque publicar es lo único de todo esto que sale del aparato y llega
//    a otras personas: la interfaz se puede enseñar y retocar sin abrir esa puerta, y esa puerta se puede cerrar
//    en caliente sin revertir la versión.
//
// MIENTRAS `ENABLE_ACHIEVEMENTS_PUBLISH` ESTÉ EN FALSE nadie publica su espejo, así que el campo
// `profiles/{uid}.achievements` llega vacío y todo lo que se apoya en él se calla: la tira de la ficha de una
// amistad, el porcentaje comparado del hub (§6.6bis) y la muestra del catálogo del panel. Tus PROPIOS logros no
// dependen de esto: los calcula el evaluador sobre tu biblioteca y se ven igual.
//
// ENCENDIDO PARA EL ESTRENO. De esta constante cuelga la escritura (`publishAchievementMirror`, llamada desde
// `useSocialViewModel`); apagarla se la lleva por delante del bundle entera, así que el interruptor es real en las
// dos posiciones y la batería pasa en ambas.
//
// LAS REGLAS TIENEN QUE ADMITIR `achievements` en `profiles` (`hasOnly` + `profileAchievementsAreSane`) y están
// desplegadas. Si alguna vez se revirtieran, la publicación empezaría a fallar con `permission-denied` EN
// SILENCIO —es best-effort a propósito— y las vitrinas se quedarían vacías sin que nada lo dijera. Es el primer
// sitio donde mirar si un día nadie publica.
export const ENABLE_ACHIEVEMENTS = true;
export const ENABLE_ACHIEVEMENTS_PUBLISH = true;
