import { SOCIAL_UI } from '../../core/constants/socialLabels';

/**
 * La PASARELA del hub social: los tres pasos que hay que completar para entrar (conectar GitHub, validar con
 * Google, crear el espacio social), cuál toca ahora y cuánto se lleva hecho.
 *
 * Es una derivación de tres booleanos y estaba escrita suelta dentro de `useSocialViewModel`, entre un centenar de
 * valores y sin un solo test —siendo lo PRIMERO que ve quien todavía no tiene el hub montado, que es justo cuando
 * más importa que la pantalla diga la verdad—. Como función pura se puede fijar su comportamiento, incluidos los
 * dos casos que a ojo se cuelan: el orden no es el de los booleanos (se puede tener sesión de Google sin haber
 * conectado GitHub) y el último paso no "avanza" al terminar, porque no hay un cuarto.
 */
export interface GatewayState {
  /** Sincronización principal conectada: hay token y gist de juegos. */
  hasMainSync: boolean;
  /** Sesión de Google resuelta. */
  hasSocialSession: boolean;
  /** Gist social propio ya creado o enlazado. */
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
  /** Porcentaje redondeado de pasos completados; alimenta la barra de progreso. */
  progress: number;
}

export function resolveGateway(state: GatewayState): GatewayView {
  const { hasMainSync, hasSocialSession, hasSocialGist } = state;
  // El orden importa y NO es el de los booleanos: cada paso mira su propia condición, así que alguien con sesión
  // de Google pero sin GitHub conectado ve el segundo hecho y el primero pendiente. Es correcto: son requisitos
  // independientes, y fingir que van en cadena escondería el que de verdad falta.
  const done = [hasMainSync, hasSocialSession, hasSocialGist];
  const steps: GatewayStep[] = SOCIAL_UI.steps.map((step, index) => ({ ...step, done: done[index] }));

  const currentStep = !hasMainSync ? 1 : !hasSocialSession ? 2 : 3;
  const progress = Math.round((steps.filter((step) => step.done).length / steps.length) * 100);

  return { steps, currentStep, progress };
}
