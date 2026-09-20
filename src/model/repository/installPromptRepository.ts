// LA INVITACIÓN A INSTALAR: quién guarda la oferta del navegador y quién recuerda que se dijo que no.
//
// El navegador ofrece instalar UNA vez y muy pronto —Chrome dispara `beforeinstallprompt` antes de que React
// llegue a montar nada—, y ese evento no se repite: si nadie lo atrapa al vuelo, la oferta se pierde para toda
// la visita. Por eso el listener se registra desde `main.tsx` (ver `listenForInstallPrompt`) y no desde el
// componente que pinta el aviso, que nace tarde.
//
// El evento no está en la librería de tipos del DOM porque no es estándar: solo lo implementan los navegadores
// basados en Chromium. En Firefox y en Safari no llega nunca, y entonces no hay aviso — que es lo correcto: no
// se puede ofrecer un botón que no sabe hacer nada. En iOS la instalación se hace a mano desde el menú de
// compartir y esto no la alcanza; queda anotado como pendiente, no como olvido.
import { INSTALL_HINT_KEY } from '../../core/constants/storageKeys';

/** El evento no estándar de Chromium. Solo lo que se usa de él. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Evento propio para que la UI reaccione a la oferta (o a su desaparición) sin recargar. */
export const INSTALL_PROMPT_EVENT = 'mgl:install-prompt';

/** La oferta guardada, a la espera de que alguien la use. `null` = no hay nada que ofrecer ahora mismo. */
let deferred: BeforeInstallPromptEvent | null = null;

/** ¿Hay oferta de instalación guardada? */
export function hasInstallOffer(): boolean {
  return deferred !== null;
}

/**
 * ¿Se está ejecutando ya como app instalada?
 *
 * Dos señales porque ningún navegador cubre las dos: `display-mode: standalone` es la estándar, y
 * `navigator.standalone` es la de Safari en iOS, que es justamente donde la estándar no llegaba. Si no se puede
 * saber (jsdom, `matchMedia` ausente), se responde que NO: el aviso sigue estando condicionado a que el
 * navegador ofrezca instalar, así que equivocarse por aquí no enseña nada de más.
 */
export function isRunningInstalled(): boolean {
  try {
    if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) {
      return true;
    }
  } catch {
    /* sin matchMedia: se prueba la otra señal */
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** ¿Se descartó ya la invitación en este navegador? Sin almacenamiento se responde que no: se ofrecerá otra vez. */
export function readInstallDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_HINT_KEY) === 'off';
  } catch {
    return false;
  }
}

/** Apunta el «ahora no». Silencioso: es una preferencia de cortesía, no un dato. */
export function persistInstallDismissed(): void {
  try {
    localStorage.setItem(INSTALL_HINT_KEY, 'off');
  } catch {
    /* Sin almacenamiento la invitación volverá en la próxima visita. No es un error que contar. */
  }
}

/** Avisa a quien esté pintando el aviso de que la oferta ha cambiado de estado. */
function announce(): void {
  window.dispatchEvent(new Event(INSTALL_PROMPT_EVENT));
}

/**
 * Atrapa la oferta del navegador. Se llama UNA vez, desde el arranque de la app.
 *
 * `preventDefault()` es lo que evita que Chromium enseñe su propia barra: la invitación se da en el idioma y en
 * el sitio de la app —el carril de abajo, el mismo del consentimiento—, no en una franja del navegador.
 */
export function listenForInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    announce();
  });

  // Instalada desde el menú del navegador, sin pasar por el aviso: la oferta ya no vale y el aviso sobra.
  window.addEventListener('appinstalled', () => {
    deferred = null;
    persistInstallDismissed();
    announce();
  });
}

/**
 * Enseña el diálogo del navegador y devuelve si se aceptó.
 *
 * La oferta se consume SIEMPRE, se acepte o no: el evento no se puede reutilizar y volver a mostrarlo lanzaría.
 * Al rechazar en el diálogo del navegador no se apunta el «ahora no» en el almacenamiento —quien cierra ese
 * diálogo no ha dicho que no quiera que se le vuelva a ofrecer nunca, solo que ahora no—; el navegador ya
 * decide por su cuenta cuándo volver a ofrecerlo.
 */
export async function showInstallPrompt(): Promise<boolean> {
  const offer = deferred;
  if (!offer) return false;
  deferred = null;
  try {
    await offer.prompt();
    const { outcome } = await offer.userChoice;
    return outcome === 'accepted';
  } catch {
    return false;
  } finally {
    announce();
  }
}
