import { useState, type KeyboardEvent } from 'react';

/**
 * SEÑALAR UNA PARTE DE UN GRÁFICO. El mismo gesto en todas las figuras del panel, en un solo sitio.
 *
 * Cada figura tenía como mucho un `title` del sistema, que en una pantalla táctil no existe y en el escritorio
 * tarda un segundo en aparecer. Lo que hace falta es lo de siempre: al señalar una parte, esa parte manda, las
 * demás se apartan y algún sitio de la tarjeta cuenta su dato exacto (ver `ChartDetail`).
 *
 * DOS ESTADOS Y NO UNO:
 *  - `hovered`: lo que se está señalando ahora mismo, con el puntero o con el foco. Es pasajero.
 *  - `pinned`: lo que se dejó FIJADO con un toque o con Intro. Es el estado que permanece, y el que se anuncia
 *    con `aria-pressed`.
 *
 * El puntero manda mientras esté encima y, al salir, la lectura vuelve a lo fijado. Con un solo estado no se
 * podía fijar nada en una pantalla táctil: el toque llega DESPUÉS de su propio `pointerenter`, así que el gesto
 * encontraba la parte ya señalada y la interpretaba como «suéltala».
 */
export interface ChartFocus {
  /** Parte que hay que destacar: la señalada ahora o, si no hay ninguna, la fijada. */
  active: string | null;
  /** Parte fijada. De aquí sale `aria-pressed`, nunca del puntero. */
  pinned: string | null;
  /**
   * Sufijo de clase de una parte: nada mientras no haya nada señalado, `is-active` para la señalada e `is-dim`
   * para las demás. Se concatena a la clase base (`className={`polar-sector${focus.stateOf(tag)}`}`).
   */
  stateOf: (key: string) => string;
  /**
   * Solo señalar con el puntero. Para las piezas que NO deben entrar en el recorrido del teclado: un enjambre de
   * trescientos puntos, uno por juego, convertiría el tabulador en un castigo, y su dato ya está en la tabla
   * alternativa del gráfico.
   */
  hoverProps: (key: string) => {
    onPointerEnter: () => void;
    onPointerLeave: () => void;
  };
  /**
   * Pieza señalable y operable dentro de un SVG: se anuncia como botón, entra en el recorrido del teclado y se
   * puede fijar con Intro o con la barra espaciadora.
   */
  controlProps: (key: string, label: string) => {
    role: 'button';
    tabIndex: 0;
    'aria-pressed': boolean;
    'aria-label': string;
    onClick: () => void;
    onKeyDown: (event: KeyboardEvent<Element>) => void;
    onPointerEnter: () => void;
    onPointerLeave: () => void;
    onFocus: () => void;
    onBlur: () => void;
  };
  /** Lo mismo para un `<button>` de verdad, que ya trae el rol, el foco y la tecla de serie. */
  buttonProps: (key: string) => {
    'aria-pressed': boolean;
    onClick: () => void;
    onPointerEnter: () => void;
    onPointerLeave: () => void;
    onFocus: () => void;
    onBlur: () => void;
  };
}

export function useChartFocus(): ChartFocus {
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const active = hovered ?? pinned;

  /** Un toque fija la parte, y otro la suelta: en una pantalla sin ratón no hay «pasar por encima». */
  const toggle = (key: string) => setPinned((current) => (current === key ? null : key));

  const enter = (key: string) => () => setHovered(key);
  const leave = () => setHovered(null);

  return {
    active,
    pinned,
    stateOf: (key) => (!active ? '' : key === active ? ' is-active' : ' is-dim'),
    hoverProps: (key) => ({ onPointerEnter: enter(key), onPointerLeave: leave }),
    controlProps: (key, label) => ({
      role: 'button',
      tabIndex: 0,
      'aria-pressed': key === pinned,
      'aria-label': label,
      onClick: () => toggle(key),
      onKeyDown: (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        // Sin esto, la barra espaciadora desplaza la página por debajo de la figura.
        event.preventDefault();
        toggle(key);
      },
      onPointerEnter: enter(key),
      onPointerLeave: leave,
      onFocus: enter(key),
      onBlur: leave,
    }),
    buttonProps: (key) => ({
      'aria-pressed': key === pinned,
      onClick: () => toggle(key),
      onPointerEnter: enter(key),
      onPointerLeave: leave,
      onFocus: enter(key),
      onBlur: leave,
    }),
  };
}
