/**
 * CUÁNDO SE OFRECE LA SECCIÓN en el resto de la aplicación: el punto de Ajustes y el botón del espacio social.
 *
 * LO DECIDE SOLO EL ADMINISTRADOR, con el interruptor «Dónde se ve» del panel: `visible === true` la enseña y
 * cualquier otra cosa —`false` o el campo ausente— la deja oculta.
 *
 * Hubo un tercer estado, «según el calendario»: sin el campo, se enseñaba mientras hubiera votación abierta o
 * resultados de menos de un mes, y abrir o publicar una edición tocaban el interruptor por su cuenta. Se retiró el
 * 29-09-2026 a petición del administrador: la sección aparecía y desaparecía sin que nadie lo hubiera decidido.
 * Para que una votación no arranque escondida sin querer, el panel avisa al abrirla si está oculta y ofrece
 * encenderla ahí mismo (ver `AdminPremios`).
 *
 * LA RUTA RESPONDE SIEMPRE, se ofrezca o no: un enlace compartido en enero tiene que seguir funcionando. Esto
 * decide si se PINTA una entrada, no si se puede entrar.
 */
import type { PremiosVotingConfig } from '../../model/types/premios';

/**
 * De dónde sale el dato para decidirlo.
 *
 * Son dos fuentes y la regla tiene que ser LA MISMA para las dos: el calendario completo, que lee el panel desde
 * Firestore, y la foto que se sirve desde el propio dominio para el menú de Ajustes
 * (`core/premios/visibilitySnapshot`). La foto sigue llevando las fechas del calendario, aunque hoy la regla solo
 * mire el interruptor.
 */
export type PremiosVisibilitySource = Pick<PremiosVotingConfig, 'season' | 'seasonId'> & {
  visible?: boolean | null;
  isOpen?: boolean | null;
  opensAtMillis?: number | null;
  closesAtMillis?: number | null;
  lastPublishedId?: string | null;
  updatedAt?: string | null;
};

export function shouldOfferPremios(config: PremiosVisibilitySource | null | undefined): boolean {
  return config?.visible === true;
}
