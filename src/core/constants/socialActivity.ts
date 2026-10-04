/**
 * Cuándo alguien deja de contar como activo en el espacio social, y lo que eso ahorra.
 *
 * UNA sola definición para el panel de administración (la señal «inactivo +30 d» del censo) y para el feed (el
 * corte de los amigos que llevan mucho sin aparecer): si divergieran, el panel diría «inactivo» de alguien cuya
 * actividad el feed sigue leyendo, o al revés. Sin dependencias: entra en el panel y en el social sin traer nada.
 */

/** 30 días sin actividad (`profiles.updatedAt`): ni se lee su gist ni sale en el feed ni en «Perfiles». */
export const PROFILE_INACTIVITY_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Edad que se le acepta a la copia del perfil de un amigo INACTIVO. Quien lleva un mes sin abrir la app no cambia
 * de nick ni de vitrina cada hora, y releerlo con la edad del rango de quien mira (hasta 30 min) era pagar una
 * lectura por amigo dormido varias veces al día. Si vuelve, su latido lo pone al día y se le ve al día siguiente.
 */
export const INACTIVE_PROFILE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Cuántos usuarios recientes enseña «Perfiles» para descubrir gente (decisión del 04-10-2026). Es el tope de la
 * consulta, y por tanto su coste: una lectura por perfil, y solo cuando se abre esa pantalla. De ellos se quitan
 * tus amigos y tú, así que «Otros» puede enseñar menos.
 */
export const SOCIAL_DISCOVER_LIMIT = 34;
