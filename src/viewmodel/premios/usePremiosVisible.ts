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
 *      usuarios). Lo que llega son las FECHAS del calendario, y la regla se aplica aquí con la hora de quien
 *      mira: así la entrada aparece y se retira sola sin que nadie toque nada.
 *
 * SIN PUERTA DE SESIÓN, y es el arreglo del 20-09-2026: antes solo se refrescaba con sesión guardada, de modo
 * que quien usa la app sin cuenta se quedaba para siempre con «no enseñar nada» — la sección estaba abierta para
 * todo el mundo y no se ofrecía a casi nadie. La puerta existía porque la lectura era de Firestore; con la
 * respuesta servida desde casa, ya no hace falta.
 */
import { useEffect, useState } from 'react';
import { PREMIOS_VISIBLE_KEY } from '../../core/constants/storageKeys';

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

  useEffect(() => {
    let vivo = true;
    // TODO lo de la porra llega por `import()`, también la REGLA: este hook lo usa el menú de Ajustes, que es
    // cromo de la aplicación, así que cualquier import estático de la sección —aunque sean unas líneas de
    // cálculo— acaba en el grafo de arranque de todo el mundo. Aquí solo se queda la lectura de la caché.
    void Promise.all([
      import('../../model/repository/premiosVisibilityRepository'),
      import('../../core/premios/visibility'),
    ])
      .then(async ([repo, regla]) => {
        const foto = await repo.loadPremiosSnapshot();
        // La foto trae las fechas; la respuesta la da la regla con la hora de AHORA, que es lo que hace que la
        // entrada se retire sola al cerrarse la edición.
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
  }, []);

  return visible;
}
