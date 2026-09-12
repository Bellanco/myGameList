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
 *     aviso.porque()    → POR QUÉ no está saliendo ahora mismo, dicho en una frase
 *     aviso.otravez()   → olvida esa cuenta y recarga: la próxima apertura vuelve a decirlo
 *
 * Y PARA CAMBIAR EL TEXTO no hay nada que instalar: con `npm run dev`, `/admin` → «Aviso a los usuarios» guarda
 * de verdad contra el servidor de desarrollo (ver el plugin `local-announcement-api` en `vite.config.ts`), que
 * lo deja en `.announcement.local.json`.
 */
import { ANNOUNCEMENT_SEEN_KEY } from '../core/constants/storageKeys';
import { NO_SEEN, parseSeen } from '../core/announcement/announcement';

declare global {
  interface Window {
    aviso?: {
      visto: () => unknown;
      porque: () => Promise<string>;
      otravez: () => void;
    };
  }
}

const RELOJ = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' });

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
    /**
     * LA PREGUNTA QUE SE HACE UNO MIRANDO LA PANTALLA: «¿y por qué no sale?». Las respuestas son cinco y ninguna
     * se ve desde fuera —el aviso puede estar apagado, ya pulsado, agotado, en su espera entre avisos, o no
     * haberse publicado nunca—, así que sin esto la única salida era ir leyendo el almacenamiento a mano.
     */
    porque: async () => {
      const { loadAnnouncement } = await import('../model/repository/announcementRepository');
      const aviso = await loadAnnouncement(true);
      if (!aviso) return 'No hay ningún aviso publicado (o el que hay está incompleto).';
      if (!aviso.active) return 'El aviso está apagado desde el panel.';

      const seen = parseSeen(localStorage.getItem(ANNOUNCEMENT_SEEN_KEY));
      const mio = seen.id === aviso.id ? seen : NO_SEEN;
      if (mio.clicked) return 'Ya pulsaste el enlace en este aparato: no se vuelve a decir.';
      if (mio.shown >= aviso.repeats) {
        return `Ya se ha dicho las ${aviso.repeats} veces acordadas. Con «Publicar como aviso nuevo» vuelve a salir.`;
      }

      const vuelve = mio.lastAt + aviso.intervalHours * 3600_000;
      if (Date.now() < vuelve) {
        return `Se dijo hace poco (${mio.shown} de ${aviso.repeats}). Vuelve a salir el ${RELOJ.format(new Date(vuelve))}.`;
      }
      return 'Toca decirlo: sale a los 2,5 s de abrir la app, y espera si la pestaña está de fondo.';
    },

    otravez: () => {
      localStorage.removeItem(ANNOUNCEMENT_SEEN_KEY);
      window.location.reload();
    },
  };
}
