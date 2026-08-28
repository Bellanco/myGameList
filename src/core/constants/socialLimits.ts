/**
 * Cotas de longitud del canal social. Una sola definición para los DOS extremos del canal.
 *
 * Las usaba solo el esquema Zod, que corre al ESCRIBIR el gist propio. Pero el gist de un amigo se lee, se
 * normaliza y se pinta sin pasar por ese esquema —Zod se carga perezosamente y solo para publicar—, así que por
 * ese lado no había ningún tope: un `gameName` o un `actorName` de tamaño arbitrario en el gist de alguien
 * entraba en memoria, se cacheaba en IndexedDB y se pintaba en el feed de quien lo tuviera agregado.
 *
 * No es un problema de inyección (React escapa el texto y las URLs van validadas aparte): es de COSTE. Y es el
 * mismo agujero que la allowlist de subclaves cerró en el perfil de Firestore, que quedaba abierto en el gist.
 *
 * Sin dependencias a propósito: el esquema arrastra Zod y la normalización va en el bundle base, así que este
 * módulo tiene que poder entrar en los dos sin traerse nada detrás.
 */

/** Nombres públicos: perfil, actor de una actividad, juego. Generoso; nunca rechaza un dato válido de hoy. */
export const SOCIAL_NAME_MAX = 500;

/** Adelanto del texto de una reseña. El real es ≤160 (`SNIPPET_MAX_CHARS`); el margen cubre trimEnd y legacy. */
export const SOCIAL_SNIPPET_MAX = 200;

/** Texto libre (publicaciones, recomendaciones legacy). */
export const SOCIAL_TEXT_MAX = 5000;

/**
 * Identificadores compuestos (`id`, `key` de una entrada). No son texto que se lea, pero se usan como clave de
 * React y viajan a la caché de IndexedDB, así que tampoco pueden venir sin tope del gist de otro.
 */
export const SOCIAL_ID_MAX = 200;
