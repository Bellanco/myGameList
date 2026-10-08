import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TAB_ROUTE } from '../../core/constants/labels';

/**
 * LO QUE SE COMPARTE CON LA APLICACIÓN desde el menú «Compartir» de Android (`share_target` del manifiesto) llega
 * a `/compartir`. Esto no pinta nada: se va a Próximos —que es adonde va lo que alguien quiere jugar, decidido el
 * 08-10-2026—, saca el nombre del juego (`sharedGameName`) y abre su alta con el nombre puesto. Si de lo
 * compartido no sale ningún nombre, se queda en Próximos sin abrir nada: un formulario vacío no ayuda.
 *
 * EL INTÉRPRETE VA CON `import()` porque el arranque está a pocos kilobytes de su tope y esto lo usa poca gente y
 * de tarde en tarde. Si su chunk no llega (sin red justo después de un despliegue: Chromium no reintenta un
 * `import()` fallido), se queda en Próximos sin abrir el alta, que es perder un atajo y no romper nada.
 *
 * Se va con `replace` para que «atrás» no vuelva a `/compartir` y repita el alta. Y una sola vez por montaje:
 * en desarrollo, el modo estricto ejecuta los efectos dos veces y abriría el formulario por duplicado.
 *
 * El juego que ya está en alguna lista no necesita nada aquí: el formulario avisa del duplicado al escribir y
 * no deja guardarlo (`findDuplicate`).
 */
export function ShareTargetEntry({ onGame }: { onGame: (name: string) => void }): null {
  const { search } = useLocation();
  const navigate = useNavigate();
  const atendido = useRef(false);

  useEffect(() => {
    if (atendido.current) return;
    atendido.current = true;
    const parametros = new URLSearchParams(search);
    navigate(TAB_ROUTE.p, { replace: true });
    void import('../../core/import/sharedGameName')
      .then(({ sharedGameName }) => {
        const nombre = sharedGameName({
          title: parametros.get('title'),
          text: parametros.get('text'),
          url: parametros.get('url'),
        });
        if (nombre) onGame(nombre);
      })
      .catch(() => {
        // Sin el intérprete no hay nombre que poner: ya se está en Próximos, que es lo que se puede hacer.
      });
  }, [search, navigate, onGame]);

  return null;
}
