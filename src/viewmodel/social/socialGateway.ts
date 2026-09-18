import { SOCIAL_UI } from '../../core/constants/socialLabels';

/**
 * La PASARELA del hub social: los DOS pasos que hay que dar para entrar (conectar GitHub y entrar con Google),
 * cuál toca ahora y cuánto se lleva hecho.
 *
 * Es una derivación de tres booleanos y estaba escrita suelta dentro de `useSocialViewModel`, entre un centenar de
 * valores y sin un solo test —siendo lo PRIMERO que ve quien todavía no tiene el hub montado, que es justo cuando
 * más importa que la pantalla diga la verdad—. Como función pura se puede fijar su comportamiento, incluidos los
 * dos casos que a ojo se cuelan: el orden no es el de los booleanos (se puede tener sesión de Google sin haber
 * conectado GitHub) y el último paso no "avanza" al terminar, porque no hay un tercero.
 *
 * TRES REQUISITOS, DOS PASOS. El espacio social (el gist) sigue haciendo falta, pero no es un paso: se crea solo
 * en cuanto hay sesión, y anunciarlo como trabajo del usuario convertía dos gestos en una lista de tres. Cuenta
 * donde de verdad está: el paso de Google no se da por hecho hasta que el espacio existe.
 */
export interface GatewayState {
  /** Sincronización principal conectada: hay token y gist de juegos. */
  hasMainSync: boolean;
  /** Sesión de Google resuelta. */
  hasSocialSession: boolean;
  /**
   * Gist social propio ya creado o enlazado. No es un paso —se crea solo—, pero sí parte del segundo: entrar con
   * Google no está terminado hasta que hay espacio donde publicar.
   */
  hasSocialGist: boolean;
}

export interface GatewayStep {
  id: string;
  title: string;
  subtitle: string;
  done: boolean;
}

export interface GatewayView {
  steps: GatewayStep[];
  /**
   * Paso en el que está el usuario, empezando en 1. Con todo hecho se queda en el ÚLTIMO y no pasa a uno
   * inexistente: la pantalla lo usa para resaltar, no para contar.
   */
  currentStep: number;
}

export function resolveGateway(state: GatewayState): GatewayView {
  const { hasMainSync, hasSocialSession, hasSocialGist } = state;
  // Cada paso mira su propia condición, así que alguien con sesión de Google pero sin GitHub conectado ve el
  // segundo hecho y el primero pendiente. Es correcto: son requisitos independientes, y fingir que van en cadena
  // escondería el que de verdad falta.
  const done = [hasMainSync, hasSocialSession && hasSocialGist];
  const steps: GatewayStep[] = SOCIAL_UI.steps.map((step, index) => ({ ...step, done: done[index] }));

  const currentStep = hasMainSync ? 2 : 1;

  return { steps, currentStep };
}
