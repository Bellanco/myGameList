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
// PONERLO A TRUE ES LO ÚNICO QUE HAY QUE TOCAR para encender la función. De esta constante cuelga la escritura
// (`publishAchievementMirror`, llamada desde `useSocialViewModel`), y el empaquetador se lleva por delante todo
// ese camino mientras esté apagada: con el interruptor en false, la función ni siquiera viaja en el bundle.
//
// ANTES DE ENCENDERLO, las reglas de `profiles` tienen que admitir el campo `achievements` (`hasOnly` +
// `profileAchievementsAreSane`). Ya están desplegadas; si alguna vez se revirtieran, la publicación empezaría a
// fallar con `permission-denied` en silencio y las vitrinas se quedarían vacías sin que nada lo dijera.
export const ENABLE_ACHIEVEMENTS = true;
export const ENABLE_ACHIEVEMENTS_PUBLISH = false;
