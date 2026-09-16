import { useEffect, useRef } from 'react';
import { TAB_IDS, type TabData } from '../../model/types/game';
import { coverUrl } from '../../core/utils/coverUrl';
import {
  hayQueReintentarAlgo,
  olvidarQueNoTiene,
  recordarQueNoTiene,
  tocaReintentar,
} from '../../core/utils/coverMemory';
import { evaluarTopesDeImagenes } from '../../core/utils/coverLimits';
import { claveDeJuego, guardarHechos, leerHechos } from '../../core/utils/coverDone';
import { pedirCupoDeCaratulasLibre } from '../../model/repository/coverQuotaRepository';
import { useCovers } from './useCovers';
import { useIsAdmin } from './useIsAdmin';

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

/**
 * Qué juegos se han intentado ya, para no repetir la biblioteca entera en cada visita.
 *
 * La lista y su formato viven en `core/utils/coverDone`: la escribe este recorrido, pero la LEE también el
 * listado cuando pinta la biblioteca de otra persona, para pedir cada carátula con las plataformas que ya
 * funcionaron y reaprovechar así la que está descargada (ver allí el porqué). Tenerla en un hook de la vista
 * obligaba a ese otro lector a montar el hook entero para consultar un dato guardado.
 */

/** Espera entre juegos. ~6/s de peticiones nuestras, que por detrás son menos de 4/s contra IGDB. */
const PAUSA_MS = 160;

export function useCoverBackfill(data: TabData): void {
  const { covers } = useCovers();
  /* EL MISMO MODO QUE PIDE EL LISTADO, y no el normal a secas. El modo ampliado (`x=1`) vive en un espacio de
     claves aparte —el de KV en el servidor y el de la memoria de «este no tiene» en el navegador—, así que un
     recorrido hecho en modo normal no le sirve de nada a quien luego pinta el mosaico en modo ampliado: ni
     calienta las claves que va a pedir, ni sus «no» los reconoce `coverSrc`, que pregunta CON el modo puesto.
     Con las dos preguntas desalineadas, la cuenta de administración pagaba el recorrido entero para nada y
     además repetía en cada visita los 404 de los juegos sin carátula, que es justo lo que esto evita.
     Que se resuelva tarde (la sesión llega después del primer pintado) solo afecta a esa cuenta: para todos los
     demás es `false` desde el principio y el efecto no se relanza. */
  const ampliado = useIsAdmin();
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
      /* LOS PRIVILEGIOS DEL RANGO MÁS ALTO, resueltos justo antes de empezar a gastar y no al montar: aquí ya se
         sabe si hay sesión y el listado está pintado.
           · El cupo del proxy lo levanta el SERVIDOR, que comprueba el rango de verdad (`/api/cover-quota`).
             Aquí solo se pregunta, y solo cuando tiene sentido preguntarlo; si dice que no, todo sigue igual.
           · Los topes del propio navegador los levanta el cliente, y solo mientras haya sitio de sobra.
         `useIsAdmin` es el disparador porque hoy el rango máximo y la cuenta de administración son lo mismo (ver
         `ADMIN_ONLY_TIER`); si algún día mithril se le concede a alguien más, esta es la línea que hay que
         cambiar — la comprobación de verdad, la del servidor, ya lee el rango del perfil. */
      if (ampliado) {
        void pedirCupoDeCaratulasLibre();
      }
      await evaluarTopesDeImagenes(ampliado);

      const hechos = leerHechos();
      /* ¿HAY ALGÚN «NO TIENE» CUMPLIDO? Se pregunta una sola vez, aquí, porque de la respuesta depende cuánto
         trabajo cuesta el bucle de abajo: si no hay ninguno —lo normal, seis días de cada siete— una biblioteca
         ya recorrida no llega a componer ni una sola URL. */
      const reintentar = hayQueReintentarAlgo();
      /* La clave primero y la URL solo para los que faltan: una biblioteca ya recorrida no llega a componer ni
         una sola URL, que es el caso normal a partir de la segunda visita. */
      const pendientes: { clave: string; url: string }[] = [];
      for (const tab of TAB_IDS) {
        for (const juego of datosRef.current[tab] ?? []) {
          if (!juego?.name) continue;
          const clave = claveDeJuego(juego.name, juego.platforms ?? [], ampliado);
          const hecho = hechos.has(clave);
          if (hecho && !reintentar) continue;
          const url = coverUrl(juego.name, juego.platforms ?? [], ampliado);
          /* LOS «NO TIENE» VUELVEN A LA COLA cuando cumplen su semana, aunque estén dados por hechos. Es lo que
             cierra el círculo: la marca del navegador caduca a la vez que la caché negativa del servidor, así
             que esta pregunta llega justo cuando al otro lado toca volver a mirar en IGDB. Un juego al que le
             falta la carátula acaba teniéndola sin que nadie haga nada, y si sigue sin ella se vuelve a callar
             otra semana en vez de preguntarlo en cada visita. */
          if (hecho && !tocaReintentar(url)) continue;
          pendientes.push({ clave, url });
        }
      }
      if (!pendientes.length) return;

      let nuevos = 0;
      let guardados = 0;
      for (const { clave, url } of pendientes) {
        if (cancelado) break;
        /* No es que este juego no tenga carátula: es que no se ha podido preguntar por él —ni por ninguno de
           los que vienen detrás—. Ver más abajo por qué eso se para. */
        let noHayNadaQueHacer = false;
        try {
          const respuesta = await fetch(`${url}&m=1`, { signal: abortar.signal });
          /* QUÉ CUENTA COMO RESPUESTA SOBRE ESTE JUEGO, que es la distinción que sostiene todo lo demás.
               · 404 — «no tiene carátula». Es un dato, y aprenderlo es el objetivo de pasar por todos: sin esto
                       esos juegos vuelven a pedir su imagen en cada visita para recibir el mismo 404.
               · 2xx — «sí tiene», y el 204 hace además el camino de vuelta, para que un título recién corregido
                       estrene carátula sin arrastrar el «no» de antes.
               · EL RESTO (429 del cupo, 403, 500, 501 sin credenciales) NO DICE NADA DE ESTE JUEGO: dice que no
                 se ha podido preguntar. Los dos que hablan del servidor entero paran además el recorrido. Se apuntaba igual, y esa es la misma confusión que el servidor tiene
                 prohibida —ver el comentario de `consultar` en `_lib/igdbCover.ts`: un fallo de infraestructura
                 nunca puede escribirse como si fuera un dato—. Quien importe una biblioteca de más de 500 juegos
                 topa el cupo a los dos minutos, y el resto del recorrido quedaba marcado como hecho para siempre
                 en ese navegador: esos juegos ya no los calienta nadie y acaban resolviéndose en ráfaga al
                 pintar el mosaico, que es exactamente el escenario que este recorrido existe para evitar. */
          if (respuesta.status === 429 || respuesta.status === 501) {
            noHayNadaQueHacer = true;
          } else if (respuesta.status === 404) {
            recordarQueNoTiene(url);
            hechos.add(clave);
            nuevos += 1;
          } else if (respuesta.ok) {
            olvidarQueNoTiene(url);
            hechos.add(clave);
            nuevos += 1;
          }
        } catch {
          if (cancelado) break;
          // Un fallo de red NO se apunta: que se reintente en la próxima visita.
        }
        /* Y ahí se PARA, no se sigue. Son las dos respuestas que hablan del servidor y no de este juego, así
           que lo que queda de recorrido recibiría exactamente la misma: cientos de peticiones que no resuelven
           nada y que encima llegan cuando el servidor ya está diciendo que no.
             · 429 — se acabó el cupo. Vuelve al cambiar la hora, o el día si el tope es el del servicio entero.
             · 501 — este entorno no tiene credenciales de IGDB (desarrollo sin `.dev.vars`, sobre todo). No es
                     que falte una carátula: es que aquí no hay carátulas, y recorrer la biblioteca entera de
                     una en una con su pausa es gasto puro.
           Lo andado queda guardado al salir del bucle y la próxima visita sigue por donde iba. */
        if (noHayNadaQueHacer) break;
        /* Se guarda cada poco y no al final: si cierras la pestaña a medias, lo andado no se pierde. Y se mide
           contra lo YA guardado, no con un resto: `nuevos` no avanza cuando la petición falla, así que un
           `% 25` volvía a serializar la lista entera en cada fallo seguido —y con la red caída, en todos. */
        if (nuevos - guardados >= 25) {
          guardarHechos(hechos);
          guardados = nuevos;
        }
        await new Promise((sigue) => setTimeout(sigue, PAUSA_MS));
      }
      guardarHechos(hechos);
    };

    /* En cuanto el navegador tenga un rato libre, no al montar: el listado tiene que pintarse primero, y esto
       compite con las propias carátulas que la pantalla está pidiendo. Mismo criterio que el arranque de Firebase. */
    const arrancar = () => { void recorrer(); };
    /* Qué API se usó, para cancelar con la que toca. Los identificadores de `requestIdleCallback` y de
       `setTimeout` son dos numeraciones INDEPENDIENTES, así que llamar a `clearTimeout` con un id de idle —como
       se hacía— puede cancelar el temporizador que otra parte de la app tuviera con ese mismo número. */
    const conIdle = typeof window.requestIdleCallback === 'function';
    const ocioso = conIdle
      ? window.requestIdleCallback(arrancar, { timeout: 4000 })
      : window.setTimeout(arrancar, 2000);

    return () => {
      cancelado = true;
      abortar.abort();
      if (conIdle) {
        window.cancelIdleCallback?.(ocioso);
      } else {
        window.clearTimeout(ocioso);
      }
    };
  }, [covers, ampliado]);
}
