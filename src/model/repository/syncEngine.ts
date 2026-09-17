/**
 * EL MOTOR DE SINCRONIZACIÓN, CARGADO CUANDO HACE FALTA.
 *
 * Lo que hay detrás de sincronizar —hablar con la API de gists, validar lo que llega, proyectar el canal social
 * y descifrar un token antiguo— viajaba en el chunk de ARRANQUE de todo el mundo. También del que abre la
 * aplicación para mirar sus listas y nunca ha conectado una cuenta de GitHub, que es quien más necesita que
 * esto empiece rápido.
 *
 * No hacía falta que fuera así: `useSyncViewModel` importaba las funciones pesadas de `gistRepository`, que es
 * una FACHADA y reexporta también la configuración (`getSyncConfig` y compañía, en `gistConfigRepository`).
 * Como la configuración sí se lee de forma síncrona en cada render, la fachada entera acababa en el arranque
 * por culpa de esa parte ligera. Ahora el hook toma la configuración de su módulo —que es donde vive— y lo
 * demás pasa por aquí.
 *
 * QUÉ NO ENTRA AQUÍ, y es deliberado. `mergeCrdt` (el reloj CRDT) se queda en el arranque: son 1,8 kB, su módulo
 * no arrastra nada más y lo usa `reconcileWithLocal`, que es SÍNCRONA y a la que llaman cuatro sitios del ciclo
 * de escritura. Volverla asíncrona por medio kilobyte sería tocar justo el camino que ya costó una pérdida de
 * datos. Lo mismo con `isDeferredNetworkError` y `getRetryAfterMs`, que viven en `githubHttp` (4 kB, sin
 * dependencias) y las usa el manejador de errores, también síncrono: se importan de su módulo directamente.
 *
 * SE CARGA UNA VEZ Y SE GUARDA LA PROMESA: llamar a esto en cada ciclo de sincronización no vuelve a descargar
 * nada, y dos ciclos simultáneos comparten la misma espera en vez de disparar dos cargas.
 *
 * DÓNDE SE LLAMA, que es lo único delicado: **antes de tomar el cerrojo** (`acquireSyncLock`), no dentro. La
 * primera vez esto es una petición de red, y hacerla con el cerrojo en la mano alargaría la ventana en la que
 * nadie más puede sincronizar por el tiempo que tarde la descarga.
 */

type Gist = typeof import('./gistRepository');
type Legacy = typeof import('../migration/legacyTokenRecovery');

export type MotorDeSync = Gist & Legacy;

let enCurso: Promise<MotorDeSync> | null = null;

export function cargarMotorDeSync(): Promise<MotorDeSync> {
  enCurso ??= Promise.all([
    import('./gistRepository'),
    import('../migration/legacyTokenRecovery'),
  ]).then(([gist, legacy]) => ({ ...gist, ...legacy }));
  return enCurso;
}

/** Solo para las pruebas: olvida la carga anterior. */
export function reiniciarMotorDeSync(): void {
  enCurso = null;
}
