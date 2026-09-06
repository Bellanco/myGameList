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
// Mientras `ENABLE_ACHIEVEMENTS_PUBLISH` esté en false, los espejos de otras personas que pinta la parte social
// los inventa la siembra de desarrollo (`dev/achievementsSeed`), que no existe en producción.
export const ENABLE_ACHIEVEMENTS = true;
export const ENABLE_ACHIEVEMENTS_PUBLISH = false;
