import { useEffect, useRef } from 'react';
import { TAB_IDS, type TabData } from '../../model/types/game';
import { coverUrl } from '../../core/utils/coverUrl';
import { olvidarQueNoTiene, recordarQueNoTiene } from '../../core/utils/coverMemory';
import { useCovers } from './useCovers';

/**
 * EL LLENADO INICIAL DE LAS CARÁTULAS. Recorre la biblioteca entera pidiendo el emparejamiento de cada juego, a
 * ritmo lento y en segundo plano, para que cuando el mosaico se pinte las imágenes salgan ya de la caché.
 *
 * POR QUÉ HACE FALTA, y no basta con pedirlas al pintar: IGDB admite CUATRO consultas por segundo, y el mosaico
 * pide ~150 carátulas de golpe, cada una con varias consultas por detrás. Medido con una biblioteca real de 302
 * juegos: a lo bruto fallaban 56 de golpe por exceso de peticiones; en fila y despacio, fallan CERO. No es una
 * optimización, es la única forma en que esto funciona.
 *
 * SOLO SI ESTÁ ENCENDIDA la preferencia. Apagada —que es como viene— no se hace ni una sola petición: descargar
 * carátulas implica que nuestro servidor pregunte por los títulos de tu biblioteca, y eso se autoriza a mano.
 *
 * Y SOLO PIDE EL MAPA (`m=1`), no las imágenes: calentar 300 juegos bajándose las portadas serían ~6 MB que
 * todavía no está mirando nadie. Las imágenes llegan luego, perezosas, cuando su caja entra en pantalla.
 */

/** Qué juegos se han intentado ya, para no repetir la biblioteca entera en cada visita. */
const HECHOS_KEY = 'mis-listas-covers-done';
/** Tope de la lista de hechos: por encima de esto se olvida la más antigua (una biblioteca así no existe). */
const MAX_HECHOS = 3000;
/** Espera entre juegos. ~6/s de peticiones nuestras, que por detrás son menos de 4/s contra IGDB. */
const PAUSA_MS = 160;

function leerHechos(): Set<string> {
  try {
    const crudo = localStorage.getItem(HECHOS_KEY);
    const lista = crudo ? (JSON.parse(crudo) as unknown) : [];
    return new Set(Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set(); // sin memoria de lo hecho se repite el trabajo, que es molesto pero no rompe nada
  }
}

function guardarHechos(hechos: Set<string>): void {
  try {
    const lista = [...hechos].slice(-MAX_HECHOS);
    localStorage.setItem(HECHOS_KEY, JSON.stringify(lista));
  } catch {
    // Almacenamiento lleno o bloqueado: se sigue sin memoria, no se interrumpe el llenado.
  }
}

export function useCoverBackfill(data: TabData): void {
  const { covers } = useCovers();
  /* Los datos por referencia y NO como dependencia del efecto: `data` cambia con cada edición, y ponerlo en las
     dependencias reiniciaría el recorrido cada vez que tocas un juego. Los añadidos de esta sesión los resuelve
     la carga perezosa al pintarse, y el recorrido los recoge en la siguiente visita. */
  const datosRef = useRef(data);
  datosRef.current = data;

  useEffect(() => {
    if (!covers) return undefined;

    let cancelado = false;
    const abortar = new AbortController();

    const recorrer = async () => {
      const hechos = leerHechos();
      const pendientes: string[] = [];
      for (const tab of TAB_IDS) {
        for (const juego of datosRef.current[tab] ?? []) {
          if (!juego?.name) continue;
          const url = coverUrl(juego.name, juego.platforms ?? []);
          if (!hechos.has(url)) pendientes.push(url);
        }
      }
      if (!pendientes.length) return;

      let nuevos = 0;
      for (const url of pendientes) {
        if (cancelado) break;
        try {
          const respuesta = await fetch(`${url}&m=1`, { signal: abortar.signal });
          /* Aquí es donde se aprende quién no tiene carátula, y es el objetivo de pasar por todos: sin esto, esos
             juegos vuelven a pedir su imagen en cada visita para recibir el mismo 404. El 204 hace el camino de
             vuelta, para que un título recién corregido estrene carátula sin arrastrar el «no» de antes. */
          if (respuesta.status === 404) recordarQueNoTiene(url);
          else if (respuesta.ok) olvidarQueNoTiene(url);
          // Se apunta pase lo que pase con el resultado: un 404 también es una respuesta, y volver a preguntarlo
          // en cada visita es justo el gasto que esto evita. La caché negativa del servidor caduca sola.
          hechos.add(url);
          nuevos += 1;
        } catch {
          if (cancelado) break;
          // Un fallo de red NO se apunta: que se reintente en la próxima visita.
        }
        // Se guarda cada poco y no al final: si cierras la pestaña a medias, lo andado no se pierde.
        if (nuevos % 25 === 0) guardarHechos(hechos);
        await new Promise((sigue) => setTimeout(sigue, PAUSA_MS));
      }
      guardarHechos(hechos);
    };

    /* En cuanto el navegador tenga un rato libre, no al montar: el listado tiene que pintarse primero, y esto
       compite con las propias carátulas que la pantalla está pidiendo. Mismo criterio que el arranque de Firebase. */
    const arrancar = () => { void recorrer(); };
    const ocioso = typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback(arrancar, { timeout: 4000 })
      : window.setTimeout(arrancar, 2000);

    return () => {
      cancelado = true;
      abortar.abort();
      if (typeof window.cancelIdleCallback === 'function' && typeof ocioso === 'number') {
        window.cancelIdleCallback(ocioso);
      }
      window.clearTimeout(ocioso as number);
    };
  }, [covers]);
}
