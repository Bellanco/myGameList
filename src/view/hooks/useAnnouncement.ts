import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ANNOUNCEMENT_PUBLISHED_EVENT,
  afterClicked,
  afterShown,
  isAnnouncementDue,
  parseSeen,
  type Announcement,
  type AnnouncementSeen,
} from '../../core/announcement/announcement';
import { ANNOUNCEMENT_SEEN_KEY } from '../../core/constants/storageKeys';
import { runWhenIdle } from '../../core/utils/idle';

/**
 * EL AVISO DEL ADMINISTRADOR, decidido para ESTA apertura de la app.
 *
 * Tres cosas y ninguna más: traer el documento, preguntarle a la política pura si toca decirlo
 * (`isAnnouncementDue`), y llevar la cuenta de lo que este dispositivo ya sabe. Todo lo que se puede decidir sin
 * navegador vive en `core/announcement/announcement`; aquí solo está lo que necesita un reloj y un
 * `localStorage`.
 *
 * SE DECIDE UNA VEZ, AL ABRIR. No hay reevaluación mientras la app está abierta: el ciclo de insistencia se mide
 * en horas y volver a mirarlo cada minuto solo serviría para que una cápsula apareciera sola en medio de una
 * sesión, que es exactamente lo que nadie espera de un aviso.
 *
 * NO COMPITE CON EL ARRANQUE. La lectura entra por `runWhenIdle` (la misma puerta que usa el resto del trabajo
 * no crítico) y el repositorio por `import()` dinámico, para no arrastrar Firestore al bundle inicial por un
 * documento que casi siempre dice que no hay nada.
 *
 * Y SALE CON RETRASO A PROPÓSITO. Una cápsula que aparece en el mismo fotograma que la app no se lee: la
 * atención está en la lista que se acaba de pintar. `SHOW_DELAY_MS` es el tiempo que tarda alguien en dejar de
 * mirar lo que venía a mirar.
 *
 * ⚑ Y NO SE PINTA CON LA PESTAÑA DE FONDO. Es el caso que hace que un aviso «no salga nunca» sin que nadie
 * entienda por qué: se abre la app en una pestaña y se sigue con otra cosa; a los dos segundos y medio la
 * cápsula se pinta contra un escritorio que nadie está mirando, a los ocho se va sola, y ha gastado una de las
 * tres veces que el aviso tenía para decirse. Al volver no hay nada, y mañana quedan dos. Así que si la pestaña
 * está oculta se espera a que se mire: el reloj de la vida de la cápsula empieza cuando empieza a poder verse.
 *
 * LA CUENTA SE APUNTA AL PINTAR, NO AL DECIDIR (`markShown` lo llama la cápsula al montarse). Es lo que hace que
 * un desbloqueo de logro —que tiene preferencia en el carril y deja al aviso sin pintar— no gaste una de las
 * veces.
 */

/** Lo que se espera desde que la app está en pie hasta que la cápsula aparece. */
const SHOW_DELAY_MS = 2500;

/**
 * Cada cuánto, como mucho, se vuelve a preguntar por el aviso al VOLVER a la app.
 *
 * ⚑ LO QUE ESTO ARREGLA: el aviso se decidía UNA vez, al abrir, y nunca más. Una pestaña abierta desde ayer —o
 * una PWA instalada en el móvil, que no se cierra del todo nunca— no se enteraba de un aviso publicado después:
 * había que recargar a mano. Y al publicar desde el panel pasaba lo mismo, que es donde se ve a la primera:
 * publicas, te vas a las listas y no sale nada.
 *
 * Cinco minutos es lo mismo que dura la respuesta en caché (`Cache-Control: max-age=300` en la función), así que
 * preguntar más a menudo no traería nada nuevo.
 */
const RECHECK_MS = 5 * 60_000;

export interface AnnouncementState {
  /** El aviso que toca enseñar AHORA, o `null` si no hay nada que decir. */
  announcement: Announcement | null;
  /** Lo llama la cápsula al montarse: gasta una de las veces. */
  markShown: () => void;
  /** Se pulsó el enlace: este aviso no se vuelve a decir en este dispositivo. */
  markClicked: () => void;
  /** Se agotó la vida de la cápsula. La cuenta ya está hecha; esto solo la retira de la pantalla. */
  dismiss: () => void;
}

function readSeen(): AnnouncementSeen {
  try {
    return parseSeen(localStorage.getItem(ANNOUNCEMENT_SEEN_KEY));
  } catch {
    return parseSeen(null);
  }
}

function writeSeen(seen: AnnouncementSeen): void {
  try {
    localStorage.setItem(ANNOUNCEMENT_SEEN_KEY, JSON.stringify(seen));
  } catch {
    // Sin persistencia, la cuenta vale para esta sesión: se volverá a decir en la siguiente apertura. Es el lado
    // molesto pero inocuo del fallo, y el contrario —callarlo para siempre— haría inútil el canal.
  }
}

export function useAnnouncement(): AnnouncementState {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  // La cuenta de este dispositivo, en un `ref`: cambia como efecto de pintar, no es algo que se pinte.
  const seenRef = useRef<AnnouncementSeen>(readSeen());
  // El mismo aviso, a mano y sin esperar al siguiente render: es lo que leen `markShown` y `markClicked`.
  //
  // ⚑ Y NO SE APUNTA DESDE EL ACTUALIZADOR de `setAnnouncement`: React puede invocarlo dos veces por render (es
  // lo que hace el modo estricto en desarrollo para cazar efectos escondidos), y ahí dentro escribir la cuenta
  // gastaría DOS de las veces por una sola cápsula.
  const currentRef = useRef<Announcement | null>(null);
  // El `id` cuya aparición ya está contada, para que montar la cápsula dos veces no cuente dos.
  const countedRef = useRef('');

  /**
   * ⚑ AQUÍ NO HAY NINGUNA GUARDA DE «ESTO YA SE HA PEDIDO», y la hubo: un `ref` que se marcaba a la primera y
   * hacía salir al efecto en las siguientes. Parecía la forma evidente de pedir el documento una sola vez, y
   * dejaba el aviso SIN SALIR NUNCA en desarrollo —que es donde se prueba—: el modo estricto monta, desmonta y
   * vuelve a montar cada efecto, así que el primer montaje marcaba el `ref` y se cancelaba a sí mismo al
   * desmontar, y el segundo se encontraba la marca puesta y no pedía nada.
   *
   * No hace falta ninguna guarda: el efecto no tiene dependencias (una vez por montaje) y quien evita la
   * petición repetida es la caché de sesión del repositorio, que además es la que sirve a las demás pantallas.
   */
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let esperandoVista: (() => void) | null = null;
    let ultimaConsulta = 0;

    /** Pinta la cápsula, o espera a que la pestaña se mire si ahora mismo está de fondo. */
    const pintar = (value: Announcement): void => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        const alVolver = () => {
          if (document.visibilityState === 'hidden') return;
          document.removeEventListener('visibilitychange', alVolver);
          esperandoVista = null;
          pintar(value);
        };
        document.addEventListener('visibilitychange', alVolver);
        esperandoVista = () => document.removeEventListener('visibilitychange', alVolver);
        return;
      }
      currentRef.current = value;
      setAnnouncement(value);
    };

    /**
     * Pregunta por el aviso y, si toca decirlo, lo programa.
     *
     * ⚑ LA RECONSULTA SALTA LA CACHÉ (`force`). La de sesión vive en el repositorio y devuelve siempre lo que se
     * leyó la primera vez, así que volver a preguntarle sin más daría exactamente la misma respuesta y esto no
     * serviría para nada: lo que se viene a buscar al volver a la app es justo lo que ha cambiado fuera.
     */
    const preguntar = (espera: number, force = false): void => {
      ultimaConsulta = Date.now();
      void import('../../model/repository/announcementRepository')
        .then((module) => module.loadAnnouncement(force))
        .then((value) => {
          // `isAnnouncementDue` ya descarta el `null`; se comprueba aparte para que el tipo lo sepa.
          if (cancelled || !value || !isAnnouncementDue(value, seenRef.current, Date.now())) return;
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => pintar(value), espera);
        })
        .catch(() => {
          // Sin aviso. No es un error de nada: la app no depende de esto para funcionar.
        });
    };

    const cancelIdle = runWhenIdle(() => preguntar(SHOW_DELAY_MS));

    /**
     * AL VOLVER A LA APP se vuelve a mirar, si ha pasado el rato. Es lo que hace que un aviso publicado hoy le
     * llegue a quien tiene la pestaña abierta desde ayer sin tener que recargar, y lo que hace que publicar
     * desde el panel y volver a las listas enseñe lo que se acaba de publicar. Sale sin el retraso de la
     * apertura: aquí la app ya estaba en pie y la atención vuelve a ella.
     */
    const alVolver = (): void => {
      if (cancelled || document.visibilityState === 'hidden') return;
      if (Date.now() - ultimaConsulta < RECHECK_MS) return;
      preguntar(0, true);
    };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);

    /**
     * Y AL PUBLICAR DESDE EL PANEL, al instante: es la misma pestaña, así que no hay ni recarga ni vuelta a la
     * app que disparen lo de arriba. No hace falta forzar la lectura —el propio guardado ha dejado la caché de
     * sesión con lo que se acaba de escribir—, y el nombre del evento viaja con el repositorio.
     */
    const alPublicar = (): void => {
      if (!cancelled) preguntar(SHOW_DELAY_MS);
    };
    window.addEventListener(ANNOUNCEMENT_PUBLISHED_EVENT, alPublicar);

    return () => {
      cancelled = true;
      cancelIdle();
      if (timer) clearTimeout(timer);
      esperandoVista?.();
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
      window.removeEventListener(ANNOUNCEMENT_PUBLISHED_EVENT, alPublicar);
    };
  }, []);

  const markShown = useCallback(() => {
    const current = currentRef.current;
    if (!current || countedRef.current === current.id) return;
    countedRef.current = current.id;
    seenRef.current = afterShown(current, seenRef.current, Date.now());
    writeSeen(seenRef.current);
  }, []);

  const markClicked = useCallback(() => {
    const current = currentRef.current;
    if (current) {
      seenRef.current = afterClicked(current, seenRef.current);
      writeSeen(seenRef.current);
    }
    // Pulsar cierra la cápsula: ya se está yendo a otro sitio.
    currentRef.current = null;
    setAnnouncement(null);
  }, []);

  const dismiss = useCallback(() => {
    currentRef.current = null;
    setAnnouncement(null);
  }, []);

  return { announcement, markShown, markClicked, dismiss };
}
