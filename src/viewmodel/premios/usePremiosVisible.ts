/**
 * ¿Se enseña la entrada a los premios? (el punto de Ajustes y el botón del espacio social).
 *
 * EL PROBLEMA QUE RESUELVE: el calendario vive en Firestore, y las dos entradas se pintan en sitios que NO
 * cargan Firebase —el menú de Ajustes es cromo de la aplicación—. Preguntar ahí metería el SDK (172 kB) en el
 * arranque de todo el mundo, y además una lectura de Firestore desde el navegador es una petición a un tercero,
 * que es justo lo que la política promete que no ocurre sin sesión.
 *
 * CÓMO SE RESUELVE, en dos tiempos:
 *
 *   1. Se pinta con la ÚLTIMA RESPUESTA conocida, guardada en este navegador. Sin red y sin parpadeo.
 *   2. Se refresca contra `/api/premios`, del PROPIO ORIGEN (Pages Function sobre KV, como el aviso a los
 *      usuarios). Lo que llega es la foto del calendario, y la regla se aplica aquí. Desde el 29-09-2026 la
 *      regla solo mira el interruptor del administrador (ver `core/premios/visibility`).
 *
 * SIN PUERTA DE SESIÓN, y es el arreglo del 20-09-2026: antes solo se refrescaba con sesión guardada, de modo
 * que quien usa la app sin cuenta se quedaba para siempre con «no enseñar nada» — la sección estaba abierta para
 * todo el mundo y no se ofrecía a casi nadie. La puerta existía porque la lectura era de Firestore; con la
 * respuesta servida desde casa, ya no hace falta.
 */
import { useEffect, useRef, useState } from 'react';
import { PREMIOS_VISIBLE_KEY } from '../../core/constants/storageKeys';
import {
  PREMIOS_VISIBILITY_CHANNEL,
  PREMIOS_VISIBILITY_EVENT,
} from '../../core/premios/visibilitySnapshot';

/**
 * CADA CUÁNTO SE VUELVE A PREGUNTAR AL VOLVER A LA APP, como mucho. El mismo plazo que el aviso a los usuarios
 * (`RECHECK_MS` de `useAnnouncement`) y por lo mismo: la vuelta a la pestaña pide saltándose la caché, así que
 * sin tope cada cambio de ventana era una invocación de Pages Functions y una lectura de KV, dos cupos DIARIOS
 * del plan gratuito (ver `docs/plan-capacidad-gratuita.md`). El aviso del panel no pasa por aquí: ese fuerza
 * siempre, porque es quien acaba de publicar.
 */
const RECHECK_MS = 5 * 60_000;

function leerCache(): boolean {
  try {
    return localStorage.getItem(PREMIOS_VISIBLE_KEY) === 'on';
  } catch {
    return false;
  }
}

function guardarCache(visible: boolean): void {
  try {
    localStorage.setItem(PREMIOS_VISIBLE_KEY, visible ? 'on' : 'off');
  } catch {
    // Sin almacenamiento se decide en cada visita; no se pierde nada importante.
  }
}

export function usePremiosVisible(): boolean {
  const [visible, setVisible] = useState(leerCache);
  /** Fuerza una relectura cuando el panel publica una foto nueva. */
  const [sello, setSello] = useState(0);
  /** Cuándo se preguntó por última vez: lo mira la vuelta a la app para no repetir antes de `RECHECK_MS`. */
  const ultimaConsultaRef = useRef(0);

  // EL PANEL PUBLICA Y ESTO SE ENTERA, en esta pestaña y en las demás. Sin esto, quien tuviera la app abierta
  // cuando el administrador abre la edición no veía aparecer la entrada hasta recargar: la respuesta está
  // cacheada a propósito, y una caché sin invalidación es una caché que miente.
  useEffect(() => {
    const refrescar = () => setSello((n) => n + 1);
    window.addEventListener(PREMIOS_VISIBILITY_EVENT, refrescar);

    // Y AL VOLVER A LA APP, que es como se entera quien la tenía abierta en otra pestaña o en otro aparato: el
    // administrador abre la edición desde el móvil y aquí la entrada aparece al volver, sin recargar. Solo al
    // volver a primer plano y como mucho una vez cada `RECHECK_MS`: esta relectura salta la caché HTTP, así que
    // la cabecera de cinco minutos de `/api/premios` no la frena.
    const alVolver = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - ultimaConsultaRef.current < RECHECK_MS) return;
      refrescar();
    };
    document.addEventListener('visibilitychange', alVolver);

    let canal: BroadcastChannel | null = null;
    try {
      canal = new BroadcastChannel(PREMIOS_VISIBILITY_CHANNEL);
      canal.onmessage = refrescar;
    } catch {
      // Sin canal, cada pestaña se entera al recargar.
    }

    return () => {
      window.removeEventListener(PREMIOS_VISIBILITY_EVENT, refrescar);
      document.removeEventListener('visibilitychange', alVolver);
      canal?.close();
    };
  }, []);

  useEffect(() => {
    let vivo = true;
    ultimaConsultaRef.current = Date.now();
    // TODO lo de la porra llega por `import()`, también la REGLA: este hook lo usa el menú de Ajustes, que es
    // cromo de la aplicación, así que cualquier import estático de la sección —aunque sean unas líneas de
    // cálculo— acaba en el grafo de arranque de todo el mundo. Aquí solo se queda la lectura de la caché.
    void Promise.all([
      import('../../model/repository/premiosVisibilityRepository'),
      import('../../core/premios/visibility'),
    ])
      .then(async ([repo, regla]) => {
        // Con `sello` por delante se pide de nuevo saltando la caché: es la vuelta que da el aviso del panel.
        const foto = await repo.loadPremiosSnapshot(sello > 0);
        // La respuesta la da la regla, que hoy solo mira el interruptor del administrador (ver
        // `core/premios/visibility`).
        const siguiente = regla.shouldOfferPremios(foto);
        guardarCache(siguiente);
        if (vivo) setVisible(siguiente);
      })
      .catch(() => {
        // Si no se puede preguntar, se conserva lo último que se supo.
      });

    return () => {
      vivo = false;
    };
  }, [sello]);

  return visible;
}
