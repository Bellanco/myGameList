import { memo } from 'react';
import { formatCount } from './format';
import { useCountUp } from './useCountUp';

/**
 * Cifra que sube desde cero al entrar en la pantalla. Se mantiene aparte de `StatTile` para que la tarjeta siga
 * aceptando cualquier contenido (el nombre de un juego, por ejemplo) y solo cuenten las que son números.
 */
export const CountUp = memo(function CountUp({ value, format = formatCount }: { value: number; format?: (value: number) => string }) {
  return <>{format(useCountUp(value))}</>;
});
