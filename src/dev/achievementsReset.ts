/**
 * REINICIO DE LOS LOGROS, solo en desarrollo. Existe con `import.meta.env.DEV`: el empaquetador se lleva por
 * delante lo que cuelga de un `DEV` falso, así que ni una línea de esto entra en producción.
 *
 * PARA QUÉ. Los logros se DERIVAN de la biblioteca en cada render, así que no hay nada que «desconceder»… salvo
 * dos rastros que sí persisten en el aparato y que no hay forma de tocar desde la interfaz:
 *
 *   · LA MARCA DE AGUA (`ACHIEVEMENTS_PEAK_KEY`). Por diseño **nunca baja**: es lo que impide que un logro se
 *     retire cuando borras cinco duplicados o corriges unos años mal puestos (§5.5). Muy bien para un usuario de
 *     verdad y muy incómodo para uno de pruebas, que acumula sesión tras sesión lo que ya no le corresponde.
 *   · EL SELLO DE LA RULETA (`ROULETTE_USED_KEY`), que es el único dato del catálogo que se registra en vez de
 *     derivarse: la ruleta es una función pura y sin él no habría forma de saber que se usó.
 *
 * NO SIEMBRA NADA, y esa es la diferencia con el andamio que había antes: aquello fabricaba espejos de otras
 * personas para poder mirar pantallas que sin publicación no tenían con qué pintarse. Esto solo BORRA lo tuyo.
 *
 * CÓMO SE USA, desde la consola del navegador:
 *
 *     logros.marca()     → qué guarda la marca de agua ahora mismo
 *     logros.olvidar()   → borra marca y sello, y recarga: el aparato vuelve a estar recién instalado
 */
import { ACHIEVEMENTS_PEAK_KEY, ROULETTE_USED_KEY } from '../core/constants/storageKeys';

declare global {
  interface Window {
    logros?: { marca: () => string; olvidar: () => string };
  }
}

export function installAchievementReset(): void {
  window.logros = {
    marca: () => {
      try {
        return localStorage.getItem(ACHIEVEMENTS_PEAK_KEY) || '(vacía)';
      } catch {
        return '(sin almacenamiento)';
      }
    },
    olvidar: () => {
      try {
        localStorage.removeItem(ACHIEVEMENTS_PEAK_KEY);
        localStorage.removeItem(ROULETTE_USED_KEY);
      } catch {
        return 'Sin almacenamiento: no hay nada que olvidar.';
      }
      // Se recarga porque la marca se lee al evaluar, y evaluar pasa en el render: sin recargar, la pantalla
      // sigue enseñando lo de antes y parece que el borrado no ha hecho nada.
      setTimeout(() => location.reload(), 0);
      return 'Marca de agua y sello de la ruleta borrados. Recargando…';
    },
  };
  // eslint-disable-next-line no-console
  console.info('[dev] logros.marca() · logros.olvidar()');
}
