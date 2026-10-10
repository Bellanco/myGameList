/**
 * Versión de esquema del documento público de Firestore (`profiles`). Las configuraciones (`privateConfig`,
 * `publicConfig`) ya no la llevan: nadie la leía (docs/plan-firestore-sin-sobrantes.md).
 *
 * Vive aquí, y no en el repositorio, porque tiene DOS consumidores que deben coincidir siempre: quien SELLA los
 * documentos al escribirlos (`firebaseRepository`, y el auto-saneado del arranque) y quien DETECTA los que se
 * quedaron atrás (la señal `stale-schema` del panel de administración). Mientras el panel tuvo su propia copia,
 * subir la versión aquí habría dejado de marcar a los perfiles pendientes de migrar: exactamente la información que
 * el panel existe para dar.
 *
 * Aditiva: las reglas no validan un conjunto exacto de campos, así que subirla no obliga a redesplegarlas.
 */
export const FIRESTORE_SCHEMA_VERSION = 1;
