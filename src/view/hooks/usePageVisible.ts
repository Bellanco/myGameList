import { useEffect, useState } from 'react';

/**
 * ¿SE ESTÁ MIRANDO ESTA PESTAÑA?
 *
 * Lo usan las dos cápsulas del carril —el aviso de logro y el del administrador— para lo mismo: **no gastar su
 * vida contra una pestaña que nadie tiene delante**. Las dos duran unos segundos y se van solas, y ese reloj
 * corría igual con la pestaña de fondo: te ibas a otra cosa doce segundos, volvías, y el aviso ya no estaba —y
 * en el caso del administrador se había gastado además una de las veces que tenía para decirse—. Comprobado en
 * Firefox: pintada, fuera doce segundos, de vuelta, y ya no había nada.
 *
 * Es la misma idea que la pausa con el ratón encima o con el foco dentro: el aviso está para leerse, así que el
 * tiempo solo corre mientras se pueda leer.
 */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  );

  useEffect(() => {
    const apuntar = () => setVisible(document.visibilityState !== 'hidden');
    apuntar();
    document.addEventListener('visibilitychange', apuntar);
    return () => document.removeEventListener('visibilitychange', apuntar);
  }, []);

  return visible;
}
