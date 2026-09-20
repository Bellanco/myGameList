/**
 * ¿Se enseña la entrada a los premios? (el punto de Ajustes y el botón del espacio social).
 *
 * EL PROBLEMA QUE RESUELVE: la respuesta vive en Firestore, y las dos entradas se pintan en sitios que NO cargan
 * Firebase —el menú de Ajustes es parte del cromo de la aplicación—. Preguntar ahí metería el SDK (172 kB) en el
 * arranque de todo el mundo, incluido quien no vota nunca, que es justo lo que este proyecto lleva cuidado.
 *
 * CÓMO SE RESUELVE, en dos tiempos:
 *
 *   1. Se pinta con la ÚLTIMA RESPUESTA conocida, guardada en este navegador. Sin red, sin SDK y sin parpadeo.
 *   2. Se refresca en segundo plano SOLO si ya hay sesión guardada — que es cuando Firebase se carga de todas
 *      formas para restaurarla, así que la lectura del calendario no trae nada nuevo al arranque.
 *
 * Quien nunca ha iniciado sesión se queda con lo que diga su caché, y de fábrica eso es «no enseñar nada». Es el
 * comportamiento correcto: sin cuenta no puede votar, y la sección se sigue pudiendo abrir por su dirección.
 */
import { useEffect, useState } from 'react';
import { PREMIOS_VISIBLE_KEY } from '../../core/constants/storageKeys';
import { hasStoredAuthSession } from '../../model/repository/firebaseGateway';

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
    if (!hasStoredAuthSession()) return;

    let vivo = true;
    // TODO lo de la porra llega por `import()`, también la REGLA: este hook lo usa el menú de Ajustes, que es
    // cromo de la aplicación, así que cualquier import estático de la sección —aunque sean unas líneas de
    // cálculo— acaba en el grafo de arranque de todo el mundo. Aquí solo se queda la lectura de la caché.
    void Promise.all([
      import('../../model/repository/premios/premiosSeasonRepository'),
      import('../../core/premios/visibility'),
    ])
      .then(async ([repo, regla]) => {
        const config = await repo.fetchVotingConfig();
        const siguiente = regla.shouldOfferPremios(config);
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
