import { useCallback, useEffect, useState } from 'react';
import { APP_UPDATE_EVENT, reloadNow } from '../../core/utils/appUpdate';
import { flushLocalState } from '../../model/repository/localRepository';
import { loadSyncDirtyState } from '../../model/repository/syncStateRepository';

/**
 * Qué hacer cuando `core/utils/appUpdate` avisa de que hay una versión nueva ya activa.
 *
 * LA REGLA: recargar sola cuando no cuesta nada, preguntar cuando podría costar algo.
 *  - Pestaña OCULTA y sin trabajo a medias → se recarga en el acto. El usuario vuelve y ya está en la versión
 *    nueva, sin haber visto ni un parpadeo. Es el caso más común en móvil: se cambia de app y se vuelve.
 *  - Pestaña VISIBLE → NUNCA se recarga sola. Recargar bajo los pies de quien está mirando pierde el scroll, los
 *    filtros y lo que tenga a medio escribir. Se enseña un aviso con un botón y decide el usuario.
 *  - Con trabajo a medias (un modal abierto, cambios locales sin subir) → tampoco, ni siquiera oculta: un modal
 *    abierto suele ser una reseña a medio escribir, y eso vive solo en el DOM.
 *
 * Si el usuario ignora el aviso y se va a otra app, la comprobación se repite al ocultarse la pestaña: entonces
 * sí se recarga sola. El aviso no se queda pegado para siempre esperando un clic.
 */

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
 *  - `isDirty`: hay ediciones locales que todavía no han subido al gist. Sobreviven a la recarga (están en
 *    localStorage e IndexedDB), pero si hay un ciclo de sync en vuelo, cortarlo obliga a repetirlo.
 */
function hasWorkInProgress(): boolean {
  if (document.querySelector('dialog[open]')) {
    return true;
  }
  const drafts = Array.from(document.querySelectorAll('textarea'));
  if (drafts.some((draft) => draft.value.trim() !== '')) {
    return true;
  }
  return loadSyncDirtyState().isDirty;
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

    function reloadIfSafe(): void {
      if (!pending || document.visibilityState !== 'hidden' || hasWorkInProgress() || !autoReloadAllowed()) {
        return;
      }
      reload();
    }

    function handleUpdate(): void {
      pending = true;
      setUpdateReady(true);
      reloadIfSafe();
    }

    window.addEventListener(APP_UPDATE_EVENT, handleUpdate);
    // Segunda oportunidad: el aviso llegó con la app en primer plano y el usuario se ha ido a otra cosa.
    document.addEventListener('visibilitychange', reloadIfSafe);
    return () => {
      window.removeEventListener(APP_UPDATE_EVENT, handleUpdate);
      document.removeEventListener('visibilitychange', reloadIfSafe);
    };
  }, [reload]);

  return { updateReady, reload };
}
