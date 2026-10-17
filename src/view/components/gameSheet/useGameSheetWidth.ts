import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

/** Los tres anchos del panel, de más estrecho a más ancho (sus medidas, en `styles/gameSheet.scss`). */
export const GAME_SHEET_WIDTHS = ['is-estrecho', 'is-medio', 'is-ancho'] as const;
export type GameSheetWidth = (typeof GAME_SHEET_WIDTHS)[number];

const MOVIL = '(max-width: 600px)';

type EstadoRelleno = 'probando' | 'si' | 'no';

/** Los escalones del realce: la carátula y el título, más grandes (sus medidas, en `styles/gameSheet.scss`). */
export const GAME_SHEET_BOOSTS = ['', 'is-realce-1', 'is-realce-2', 'is-realce-3', 'is-realce-4'] as const;
export type GameSheetBoost = (typeof GAME_SHEET_BOOSTS)[number];

/** El ancho elegido, si cabe el relleno y el realce. */
export interface GameSheetWidthState {
  width: GameSheetWidth;
  showFiller: boolean;
  boost: GameSheetBoost;
}

/**
 * EL ESPACIO EN BLANCO, SIEMPRE EL MÍNIMO (F0.11). El panel va siempre a todo el alto y su ancho se MIDE: se prueba
 * de más estrecho a más ancho (una columna en 600 px, dos en 880 px, dos en 1.240 px) y se queda en el primero en el
 * que todo cabe sin scroll. Solo se ensancha si el cuerpo tiene más de una sección que repartir: con una sola, dos
 * columnas no ganarían altura.
 *
 * EL RELLENO («Lo quieren», F0.4) entra después: primero se elige el ancho sin él; después se prueba a añadirlo y, si
 * así ya no cabe sin scroll, se quita. Nunca ensancha el panel ni provoca scroll.
 *
 * EL REALCE, lo último (17-10-2026, decisión del usuario): el panel va a todo el alto, y una ficha con poco que contar
 * (un deseo sin precio ni saga) dejaba media pantalla en blanco. Con todo ya colocado, se prueba a agrandar la carátula
 * y el título un escalón y otro, y se queda en el mayor que cabe sin scroll. Si el contenido crece después, es lo
 * primero que se va, antes que el relleno: es adorno.
 *
 * Cuándo se mide:
 *  · al abrir y cada vez que cambia la ficha (`key`);
 *  · cada vez que el contenido cambia de tamaño (`ResizeObserver`): la letra que llega tarde, una carátula, las
 *    amistades que llegan después. Ese caso SOLO ensancha (o quita el realce o el relleno), así que no puede entrar en
 *    bucle;
 *  · al cambiar el tamaño de la ventana, que vuelve a empezar por el más estrecho.
 *
 * En el móvil el panel es siempre casi la pantalla entera: no hay ancho que elegir, pero el relleno sí se prueba.
 * Se mide después de `showModal` y ANTES DE PINTAR (`useLayoutEffect`): cada paso vuelve a medir en el mismo
 * fotograma, así que el panel entra ya con su ancho. Con un efecto normal se pintaba un fotograma por paso, y el
 * borde izquierdo saltaba de 600 a 880 px mientras el panel entraba deslizándose.
 */
export function useGameSheetWidth(
  open: boolean,
  key: string,
  scrollRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  hasFiller: boolean,
): GameSheetWidthState {
  const [medida, setMedida] = useState<{ key: string; etapa: number } | null>(null);
  const [relleno, setRelleno] = useState<{ key: string; estado: EstadoRelleno } | null>(null);
  const [realce, setRealce] = useState<{ key: string; nivel: number; fijo: boolean } | null>(null);
  const [pasada, setPasada] = useState(0);
  const etapa = medida?.key === key ? medida.etapa : 0;
  const estadoRelleno = relleno?.key === key ? relleno.estado : null;
  const nivel = realce?.key === key ? realce.nivel : 0;
  const realceFijo = realce?.key === key ? realce.fijo : false;

  useEffect(() => {
    const alCambiar = () => {
      setMedida(null);
      setRelleno(null);
      setRealce(null);
      setPasada((n) => n + 1);
    };
    window.addEventListener('resize', alCambiar);
    return () => window.removeEventListener('resize', alCambiar);
  }, []);

  useEffect(() => {
    const contenido = contentRef.current;
    if (!open || !contenido || typeof ResizeObserver === 'undefined') return undefined;
    const observador = new ResizeObserver(() => setPasada((n) => n + 1));
    observador.observe(contenido);
    return () => observador.disconnect();
  }, [open, key, contentRef]);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!open || !scroll) return;
    const esMovil = window.matchMedia?.(MOVIL).matches ?? false;
    const sobra = scroll.scrollHeight > scroll.clientHeight + 1;
    if (estadoRelleno === 'probando') {
      setRelleno({ key, estado: sobra ? 'no' : 'si' });
      return;
    }
    if (sobra) {
      if (nivel > 0) {
        setRealce({ key, nivel: nivel - 1, fijo: true });
        return;
      }
      if (estadoRelleno === 'si') {
        setRelleno({ key, estado: 'no' });
        return;
      }
      const secciones = scroll.querySelector('.gs-cuerpo')?.children.length ?? 0;
      if (!esMovil && etapa < GAME_SHEET_WIDTHS.length - 1 && secciones > 1) {
        // Con otro ancho, el relleno y el realce se vuelven a probar desde cero.
        setMedida({ key, etapa: etapa + 1 });
        setRelleno(null);
        setRealce(null);
      }
      return;
    }
    if (estadoRelleno === null && hasFiller) {
      setRelleno({ key, estado: 'probando' });
      return;
    }
    if (!realceFijo && nivel < GAME_SHEET_BOOSTS.length - 1) setRealce({ key, nivel: nivel + 1, fijo: false });
  }, [open, key, etapa, estadoRelleno, hasFiller, nivel, realceFijo, pasada, scrollRef]);

  return {
    width: GAME_SHEET_WIDTHS[etapa],
    showFiller: hasFiller && (estadoRelleno === 'probando' || estadoRelleno === 'si'),
    boost: GAME_SHEET_BOOSTS[nivel],
  };
}
