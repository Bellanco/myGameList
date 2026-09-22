// EL RELEVO DE UN SPRITE: quién de los que están montados es el que pinta.
//
// UN SOLO SPRITE EN EL DOCUMENTO, aunque lo pidan varias pantallas a la vez. Para las medallas antes no hacía
// falta: el sprite lo montaban cinco sitios que no coinciden nunca en pantalla (la pantalla de logros, la tarjeta
// del panel, la ficha del hub, el feed y el panel de administración). El AVISO DE LOGRO lo cambió: puede salir
// encima de CUALQUIERA de ellas, así que dos `<symbol id="ach-completados">` en el mismo documento pasó de
// imposible a lo normal — y eso es HTML inválido, con el navegador quedándose con el primero.
//
// QUIÉN LO PINTA: el PRIMERO que se monta, y al irse pasa el relevo al siguiente que siga montado. Se lleva con
// una lista por orden de llegada y no con un «dueño o nada», que era la primera versión y tenía un hueco: al
// soltarlo, todos los demás se creían con derecho a pintar a la vez —tres sprites montados y dos pintando en
// cuanto el aviso se cerraba—. Con la lista solo hay un primero, siempre.
//
// El alta va en `useLayoutEffect` a propósito: corre ANTES de que el navegador pinte, así que el relevo no deja
// ni un fotograma sin dibujos ni dos juegos de `<symbol>` a la vista.
//
// UN REGISTRO POR SPRITE, y por eso esto es una fábrica y no un hook suelto: las medallas (`ach-…`) y los iconos
// del aviso (`icon-…`) son juegos de `<symbol>` distintos que pueden —y deben— estar los dos en la página a la
// vez. Lo que no puede repetirse es cada uno consigo mismo.
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';

/** Crea el registro de un sprite y devuelve el hook que dice si a este montaje le toca pintar. */
export function crearRelevoDeSprite(nombre: string): () => boolean {
  const oyentes = new Set<() => void>();
  const montados: symbol[] = [];

  function avisar(): void {
    for (const oyente of oyentes) oyente();
  }

  function suscribir(oyente: () => void): () => void {
    oyentes.add(oyente);
    return () => {
      oyentes.delete(oyente);
    };
  }

  return function useSoyElQuePinta(): boolean {
    const token = useRef<symbol>(undefined as unknown as symbol);
    if (!token.current) token.current = Symbol(nombre);
    const mio = token.current;

    const pinta = useSyncExternalStore(
      suscribir,
      () => montados[0] === mio,
      // En el servidor no hay relevo que negociar: pinta el que se esté renderizando.
      () => true,
    );

    useLayoutEffect(() => {
      montados.push(mio);
      avisar();
      return () => {
        const donde = montados.indexOf(mio);
        if (donde >= 0) montados.splice(donde, 1);
        avisar();
      };
    }, [mio]);

    return pinta;
  };
}
