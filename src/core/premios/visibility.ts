/**
 * CUÁNDO SE OFRECE LA SECCIÓN en el resto de la aplicación: el punto de Ajustes y el botón del espacio social.
 *
 * La porra es ESTACIONAL: se juega unas semanas al año, así que una entrada fija todo el año apuntaría once
 * meses a una pantalla que dice «no hay ninguna edición en marcha». Y al revés: durante la votación tiene que
 * estar a la vista sin que nadie tenga que saberse la dirección.
 *
 * TRES ESTADOS, y el del administrador manda sobre los otros dos:
 *
 *   · `visible === false` → oculta, aunque haya edición. Es el interruptor de «ya está, recógelo».
 *   · `visible === true`  → a la vista, aunque no haya nada. Sirve para prepararlo todo antes de abrir.
 *   · ausente             → lo decide el calendario: hay votación abierta, o resultados publicados hace poco.
 *
 * LA RUTA RESPONDE SIEMPRE, se ofrezca o no: un enlace compartido en enero tiene que seguir funcionando. Esto
 * decide si se PINTA una entrada, no si se puede entrar.
 */
import type { PremiosVotingConfig } from '../../model/types/premios';
import { SEASON_STAGE, getSeasonStage } from './votingSchedule';

/** Cuánto se considera «reciente» un resultado publicado. Un mes: lo que dura la conversación sobre una edición. */
export const RESULTS_FRESH_MS = 30 * 24 * 60 * 60 * 1000;

export function shouldOfferPremios(
  config: PremiosVotingConfig | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!config) return false;
  if (config.visible === false) return false;
  if (config.visible === true) return true;

  // LA ETAPA Y NO `isVotingOpenNow`, y la diferencia importa: un calendario recién creado, sin fecha de cierre,
  // cuenta como «abierta» para el flujo de votación —es el estado «aún no se ha configurado nada»— pero aquí eso
  // significaría ofrecer la sección sin que exista ninguna edición. Lo que distingue «hay edición» de «no la
  // hay» es la fecha de cierre, que es justo lo que mira la etapa.
  if (getSeasonStage(config, now) === SEASON_STAGE.OPEN) return true;

  // Resultados recientes. Se mide con `updatedAt`, que es lo último que se escribió en el calendario: publicar
  // una edición lo toca, así que sirve de fecha de publicación. Es aproximado a propósito —cualquier cambio del
  // calendario lo refresca— y el error siempre va del lado de ENSEÑAR la sección un rato de más, que es mejor
  // que esconder unos resultados recién publicados.
  if (!config.lastPublishedId) return false;
  const sello = Date.parse(String(config.updatedAt || ''));
  if (Number.isNaN(sello)) return true;
  return now - sello < RESULTS_FRESH_MS;
}
