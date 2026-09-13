// La PISTA del armazón de la actividad social: si la última vez esta persona podía publicar.
//
// Vive en su propio módulo, y no en `view/hooks/preferences` con las de apariencia, por el presupuesto de
// arranque: la lee el esqueleto de la actividad —que va en el chunk inicial— y la escribe el hub —que va en el
// suyo—. Importarla desde donde están las demás convertiría ese módulo y sus dependencias en código compartido
// entre ambos, el bundler los extraería y el arranque crecería. Mismo motivo, y mismo patrón, que
// `feedMovePreference`.
//
// Tampoco usa `createPreferenceStore`: no hay nada que replicar a la nube (es del dispositivo), nada que aplicar
// al DOM y nadie a quien notificar — se lee una vez, al pintar el esqueleto.
import { SOCIAL_CAN_POST_KEY } from '../../core/constants/storageKeys';

/**
 * ¿Reservar el hueco del compositor en el esqueleto?
 *
 * Por defecto NO: quien nunca ha entrado en el espacio social empieza en bronce, que es el rango que no publica,
 * así que lo más probable es que no haya compositor que reservar. Y si no hay `localStorage` (modo privado con
 * el almacenamiento bloqueado), lo correcto es exactamente lo mismo: no prometer un hueco que quizá no llegue.
 */
export function readCanPublishHint(): boolean {
  try {
    return localStorage.getItem(SOCIAL_CAN_POST_KEY) === '1';
  } catch {
    return false;
  }
}

/** Apunta lo que el hub acaba de resolver, para el esqueleto de la PRÓXIMA entrada. Silencioso: es una pista. */
export function writeCanPublishHint(canPublish: boolean): void {
  try {
    localStorage.setItem(SOCIAL_CAN_POST_KEY, canPublish ? '1' : '0');
  } catch {
    /* Sin almacenamiento, el esqueleto se queda con su valor por defecto. No es un error que contar. */
  }
}
