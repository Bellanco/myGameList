/**
 * EL AVISO A LOS USUARIOS, desde la consola. Solo en desarrollo (`import.meta.env.DEV`): el empaquetador se
 * lleva por delante lo que cuelga de un `DEV` falso, así que ni una línea entra en producción.
 *
 * PARA QUÉ. El aviso se dice como mucho N veces y con horas de por medio (por defecto tres veces, una al día), y
 * esa cuenta vive en el dispositivo. Es justo lo que se quiere en producción y lo que hace imposible probarlo:
 * lo ves una vez, recargas y ya no vuelve a salir hasta mañana. Sin esto, la única forma de repetirlo era buscar
 * la clave a mano en el almacenamiento local.
 *
 * CÓMO SE USA, desde la consola del navegador:
 *
 *     aviso.visto()     → qué recuerda este aparato: campaña, veces, cuándo fue la última y si se pulsó
 *     aviso.otravez()   → olvida esa cuenta y recarga: la próxima apertura vuelve a decirlo
 *
 * Y PARA CAMBIAR EL TEXTO no hay nada que instalar: con `npm run dev`, `/admin` → «Aviso a los usuarios» guarda
 * de verdad contra el servidor de desarrollo (ver el plugin `local-announcement-api` en `vite.config.ts`), que
 * lo deja en `.announcement.local.json`.
 */
import { ANNOUNCEMENT_SEEN_KEY } from '../core/constants/storageKeys';
import { parseSeen } from '../core/announcement/announcement';

declare global {
  interface Window {
    aviso?: {
      visto: () => unknown;
      otravez: () => void;
    };
  }
}

export function installAnnouncementTools(): void {
  window.aviso = {
    visto: () => {
      const seen = parseSeen(localStorage.getItem(ANNOUNCEMENT_SEEN_KEY));
      return {
        campaña: seen.id || '(ninguna)',
        veces: seen.shown,
        última: seen.lastAt ? new Date(seen.lastAt).toLocaleString('es-ES') : '(nunca)',
        pulsado: seen.clicked,
      };
    },
    otravez: () => {
      localStorage.removeItem(ANNOUNCEMENT_SEEN_KEY);
      window.location.reload();
    },
  };
}
