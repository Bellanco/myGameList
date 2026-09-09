// LA CONFIGURACIÓN LEÍDA, GUARDADA APARTE DEL REPOSITORIO QUE LA TRAE.
//
// Módulo propio y diminuto —dos variables y tres funciones— por la misma razón que existe `deviceSignals`: el
// PRESUPUESTO DE CHUNK. El repositorio que lee el documento importa Firestore, así que cualquiera que quiera
// mirar la caché tendría que arrastrar el SDK a su chunk para leer un objeto de tres campos. Aquí no hay ninguna
// dependencia: la caché se puede consultar desde una vista sin traerse nada detrás.
//
// QUÉ ARREGLA. `useAchievementsConfig` arrancaba SIEMPRE vacío y pedía la configuración por `import()` dinámico,
// así que cada pantalla que lo monta pintaba un fotograma con la configuración vacía antes de la buena. En los
// logros eso se veía: con la apertura comunitaria a cero, el denominador de la cabecera es el que abre tu solo
// progreso, así que al abrir la segunda pantalla la cifra daba un salto y volvía. Con la caché a mano, el estado
// inicial ya es el bueno a partir de la primera lectura de la sesión y no hay salto que ver.
//
// Es caché DE SESIÓN, en memoria: no se persiste ni se sincroniza. La configuración la decide el panel de
// administración y no cambia en caliente para nadie más (ver `achievementsConfigRepository`).
import type { AchievementsConfig } from './visibility';

let cached: AchievementsConfig | null = null;

/** Lo último leído en esta sesión, o `null` si todavía no se ha leído nada. */
export function cachedAchievementsConfig(): AchievementsConfig | null {
  return cached;
}

/**
 * Guarda lo leído y lo devuelve, para poder encadenar en el `return` del repositorio.
 *
 * La IDENTIDAD del objeto importa: quien lo recibe lo mete en un `useState`, y devolver siempre el mismo objeto
 * mientras no cambie evita un render de más en cada pantalla que lo pide.
 */
export function rememberAchievementsConfig(config: AchievementsConfig): AchievementsConfig {
  cached = config;
  return config;
}
