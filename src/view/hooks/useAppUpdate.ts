import { useCallback, useEffect, useState } from 'react';
import { APP_UPDATE_EVENT, reloadNow } from '../../core/utils/appUpdate';
import { flushLocalState } from '../../model/repository/localRepository';
import { isSyncInFlight } from '../../model/repository/syncMachineRepository';

/**
 * Qué hacer cuando `core/utils/appUpdate` avisa de que hay una versión nueva ya activa.
 *
 * LA REGLA: recargar sola cuando no cuesta nada, preguntar cuando podría costar algo.
 *  - Pestaña OCULTA y sin trabajo a medias → se recarga en el acto. El usuario vuelve y ya está en la versión
 *    nueva, sin haber visto ni un parpadeo. Es el caso más común en móvil: se cambia de app y se vuelve.
 *  - Pestaña VISIBLE y EN USO → no se recarga sola. Recargar bajo los pies de quien está mirando pierde el
 *    scroll, los filtros y lo que tenga a medio escribir. Se enseña un aviso con un botón y decide el usuario.
 *  - Pestaña VISIBLE pero quieta desde hace rato → se recarga sola (ver abajo).
 *  - Con trabajo a medias (un modal abierto, un borrador sin guardar, un ciclo de sincronización en marcha) →
 *    tampoco, ni siquiera oculta: un modal abierto suele ser una reseña a medio escribir, y eso vive solo en el DOM.
 *
 * Si el usuario ignora el aviso y se va a otra app, la comprobación se repite al ocultarse la pestaña: entonces
 * sí se recarga sola. El aviso no se queda pegado para siempre esperando un clic.
 *
 * Y CON LA PESTAÑA DELANTE PERO SIN NADIE AL OTRO LADO, también. «Visible» no es lo mismo que «en uso»: la app se
 * queda abierta en una pestaña durante horas, y ahí el aviso esperaba un clic que no llegaba nunca. Tras
 * `IDLE_RELOAD_MS` sin tocar nada —ni ratón, ni teclas, ni desplazamiento— y sin trabajo a medias, se recarga
 * sola. No se pisa la regla de arriba, se afina: lo que la regla protege es a quien está USANDO la app, y quien
 * lleva cinco minutos sin tocarla no está escribiendo nada que se pueda perder.
 */

/**
 * Cuánto tiene que llevar la app sin que nadie la toque para recargarse sola estando a la vista.
 *
 * Cinco minutos: lo bastante como para que no pille a nadie pensando delante de la pantalla —leer una ficha,
 * decidir una nota— y lo bastante poco como para que la pestaña que se deja abierta toda la tarde se ponga al día
 * sin tener que pulsar nada.
 */
const IDLE_RELOAD_MS = 5 * 60 * 1000;

/**
 * Cada cuánto se mira si ya toca. Se comprueba con un reloj y no rearmando un temporizador en cada movimiento: la
 * actividad puede ser muy seguida (un desplazamiento son decenas de eventos) y apuntar la hora es lo más barato
 * que se puede hacer en un manejador que va a correr tantas veces.
 */
const IDLE_CHECK_MS = 30 * 1000;

/** Anti-bucle: si algo dispara actualizaciones en cadena, no se recarga sola más de una vez por minuto. */
const RELOAD_STAMP_KEY = 'myGameList.updateReloadedAt';
const RELOAD_GUARD_MS = 60 * 1000;

function autoReloadAllowed(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_STAMP_KEY) || 0);
    return !last || Date.now() - last > RELOAD_GUARD_MS;
  } catch {
    return true; // sin sessionStorage no hay guarda posible; el caso normal es una sola recarga
  }
}

function stampAutoReload(): void {
  try {
    sessionStorage.setItem(RELOAD_STAMP_KEY, String(Date.now()));
  } catch {
    // sin sessionStorage se sigue adelante: la recarga importa más que la guarda
  }
}

/**
 * ¿Hay algo que se perdería al recargar? Tres señales, las tres baratas:
 *  - un `<dialog open>`: los modales de esta app (formulario de juego, compositor de reseña) son diálogos
 *    nativos y su contenido no está persistido en ningún sitio hasta que se guarda;
 *  - un `<textarea>` con texto: el compositor del feed social NO es un modal, va suelto en la pantalla, así que
 *    la comprobación anterior no lo ve. Solo se miran textareas —no cualquier campo— a propósito: el buscador de
 *    la barra de herramientas casi siempre tiene algo escrito y bloquearía la recarga silenciosa a todas horas,
 *    y perder un filtro de búsqueda no es perder trabajo;
 *  - un CICLO DE SINCRONIZACIÓN EN VUELO (`isSyncInFlight`, el mutex que los serializa): recargar a mitad
 *    obliga a repetirlo.
 *
 * Lo que NO cuenta como trabajo a medias, aunque lo parezca: `isDirty`. Aquí se miraba esa marca, y responde a
 * otra pregunta —«¿queda algo por subir?»— que puede ser cierta PARA SIEMPRE: solo se limpia tras una escritura
 * correcta del gist, así que se quedaba puesta en quien no tiene sincronización configurada (cualquier edición
 * la marca, y ahí no hay ciclo que la limpie jamás) y en quien la tiene rota. A esos dos grupos se les apagaba
 * la recarga automática ENTERA —ni oculta ni en reposo— y se quedaban en la versión vieja esperando un clic en
 * el aviso. El caso feo era el segundo: la persona cuya sincronización está averiada es justo la que necesita la
 * versión que la arregla, y su avería impedía instalarla.
 *
 * Recargar con cambios sin subir no pierde nada: viven en localStorage e IndexedDB, la marca sobrevive a la
 * recarga y el primer ciclo tras arrancar los empuja. Lo único que había que proteger de verdad es el ciclo EN
 * MARCHA, y eso lo dice la máquina de estados, no la marca.
 */
function hasWorkInProgress(): boolean {
  if (document.querySelector('dialog[open]')) {
    return true;
  }
  const drafts = Array.from(document.querySelectorAll('textarea'));
  if (drafts.some((draft) => draft.value.trim() !== '')) {
    return true;
  }
  // El mutex de `syncMachineRepository`, que es la señal canónica de «hay un ciclo en marcha» y no una lista de
  // estados que haya que mantener al día. Su propio contrato dice lo que hace falta aquí: saltarse un ciclo es
  // seguro porque la marca de pendiente está en disco y el siguiente empuja lo que quedara.
  return isSyncInFlight();
}

export interface AppUpdateState {
  /** Hay una versión nueva activa y la pestaña sigue mostrando la anterior. */
  updateReady: boolean;
  /** Recarga guardando antes lo que quede pendiente de volcar a localStorage. */
  reload: () => void;
}

export function useAppUpdate(): AppUpdateState {
  const [updateReady, setUpdateReady] = useState(false);

  const reload = useCallback(() => {
    // La escritura a localStorage está diferida a un hueco ocioso (ver `localRepository`); recargar sin volcarla
    // perdería la última edición. IndexedDB ya la tiene, pero no hay motivo para dejar las dos copias desalineadas.
    flushLocalState();
    stampAutoReload();
    reloadNow();
  }, []);

  useEffect(() => {
    let pending = false;
    let lastActivity = Date.now();
    let idleWatch: ReturnType<typeof setInterval> | null = null;

    function reloadIfSafe(): void {
      if (!pending || document.visibilityState !== 'hidden' || hasWorkInProgress() || !autoReloadAllowed()) {
        return;
      }
      reload();
    }

    /** Cualquier señal de que hay alguien delante. No decide nada: solo apunta la hora. */
    function noteActivity(): void {
      lastActivity = Date.now();
    }

    /**
     * ¿Lleva ya el rato acordado sin tocarse? Entonces la recarga no le quita nada a nadie.
     *
     * Si hay trabajo a medias NO se recarga y tampoco se rinde: se vuelve a mirar en la siguiente vuelta, porque
     * ese trabajo se puede guardar en cualquier momento y entonces sí tocará.
     */
    function reloadIfIdle(): void {
      if (!pending) return;
      if (document.visibilityState === 'hidden') return; // ese caso ya lo lleva `reloadIfSafe`
      if (Date.now() - lastActivity < IDLE_RELOAD_MS) return;
      if (hasWorkInProgress() || !autoReloadAllowed()) return;
      reload();
    }

    function handleUpdate(): void {
      pending = true;
      setUpdateReady(true);
      // La cuenta de inactividad empieza AQUÍ y no con la última interacción real: si la versión nueva llega
      // después de un rato quieto, recargar en el mismo instante daría un cambio de pantalla salido de la nada.
      lastActivity = Date.now();
      if (!idleWatch) idleWatch = setInterval(reloadIfIdle, IDLE_CHECK_MS);
      reloadIfSafe();
    }

    window.addEventListener(APP_UPDATE_EVENT, handleUpdate);
    // Segunda oportunidad: el aviso llegó con la app en primer plano y el usuario se ha ido a otra cosa.
    document.addEventListener('visibilitychange', reloadIfSafe);
    // Señales de que la app está en uso. `scroll` en captura porque lo que se desplaza son contenedores de dentro,
    // no la ventana; todos pasivos, que ninguno interviene en el gesto.
    const ACTIVITY = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;
    for (const event of ACTIVITY) window.addEventListener(event, noteActivity, { passive: true });
    window.addEventListener('scroll', noteActivity, { passive: true, capture: true });

    return () => {
      window.removeEventListener(APP_UPDATE_EVENT, handleUpdate);
      document.removeEventListener('visibilitychange', reloadIfSafe);
      for (const event of ACTIVITY) window.removeEventListener(event, noteActivity);
      window.removeEventListener('scroll', noteActivity, { capture: true });
      if (idleWatch) clearInterval(idleWatch);
    };
  }, [reload]);

  return { updateReady, reload };
}
