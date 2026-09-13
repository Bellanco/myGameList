import { useState } from 'react';
import { readCanPublishHint } from '../../model/repository/socialShellHint';

/**
 * ¿Reservar el hueco del compositor de publicaciones mientras carga la actividad social?
 *
 * Devuelve lo que el hub apuntó la última vez (ver `model/repository/socialShellHint`) y lo CONGELA para todo el
 * montaje: el esqueleto no debe cambiar de forma a mitad de la espera, que es justo lo que se está evitando.
 *
 * Existe como hook —y no como una llamada suelta desde el componente— porque la vista no importa repositorios
 * (`view.instructions.md`); es la misma frontera que usan `useFeedMoveTabs` y el resto de preferencias.
 */
export function useCanPublishHint(): boolean {
  const [hint] = useState(readCanPublishHint);
  return hint;
}
