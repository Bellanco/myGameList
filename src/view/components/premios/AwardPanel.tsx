import { useCallback, useEffect, useRef, useState } from 'react';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { getAward } from '../../../core/premios/awards';
import { downloadCanvas, drawAward } from '../../../core/premios/awardCanvas';

const L = PREMIOS_UI.resultados;

/**
 * LA LÁMINA DEL PODIO: el cartel del puesto con el nombre del premiado encima.
 *
 * SE DIBUJA EN EL NAVEGADOR, a la resolución nativa de la lámina y escalado por CSS: lo que se ve y lo que se
 * descarga son el mismo píxel. No se guarda nada en ningún sitio — el premio se deriva del archivo publicado
 * (puesto + nombre), así que generarlo al vuelo sale más barato que almacenar cinco imágenes por edición.
 *
 * VA EN LA PÁGINA, NO EN UN MODAL. Fue un `<dialog>` con su galería —flechas de anterior y siguiente, y un botón
 * de cerrar— y era demasiado aparato para lo que hace: tapaba la clasificación que se estaba mirando, y ver a
 * otro premiado costaba cerrarlo, buscar su fila y volver a abrirlo. Aquí la lámina vive encima de los
 * ganadores y CAMBIA al pulsar cualquier trofeo, que es la galería que hacía falta. Lo único que queda es la
 * descarga, porque es lo que separa mirar de llevarse.
 *
 * SOLO SE OFRECE A QUIEN TIENE SESIÓN. El arte es un collage con material de terceros y el rótulo de un certamen
 * ajeno, así que no se enseña en la página pública de resultados: ahí va la medalla tipográfica de la casa (ver
 * `PalmaresMedal`). Nota honesta: los ficheros viven en `public/awards/`, de modo que quien adivine su URL puede
 * abrirlos en blanco. No se enlazan en ninguna parte pública, el dominio va con `noindex` y `robots.txt` cierra
 * el paso; si algún día hiciera falta privacidad de verdad, el camino es servirlos desde KV tras comprobar el
 * token, como se hace con las reseñas compartidas.
 *
 * El canvas lleva `role="img"` y su nombre accesible, porque para un lector de pantalla un canvas es una caja
 * vacía y el nombre dibujado dentro no existe en el DOM.
 */
export interface AwardPanelProps {
  /** El puesto premiado que se está mirando. */
  rank: number;
  /** El nombre que va escrito en la lámina. */
  nickname: string;
  seasonName: string;
}

export function AwardPanel({ rank, nickname, seasonName }: AwardPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let vivo = true;
    setListo(false);
    void drawAward(canvasRef.current, { rank, name: nickname })
      .then(() => {
        if (vivo) setListo(true);
      })
      .catch(() => {
        // Sin lámina no hay trofeo que enseñar; el resto de la pantalla sigue en pie.
      });
    return () => {
      vivo = false;
    };
  }, [nickname, rank]);

  /**
   * SE TRAE LA LÁMINA A LA VISTA AL CAMBIARLA. El trofeo que se pulsa puede estar catorce renglones más abajo, y
   * sin esto lo que cambia queda fuera de la pantalla: se pulsaría y no pasaría nada. `nearest` mueve lo justo,
   * y quien pide menos movimiento lo recibe de golpe.
   *
   * LA PRIMERA NO SALTA: la pantalla abre ya con una lámina puesta (la tuya, o la del primero), y arrastrar ahí
   * a quien acaba de entrar le escondería el podio, que es por donde se empieza a leer.
   */
  const primera = useRef(true);
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    const suave = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    panelRef.current?.scrollIntoView?.({ block: 'nearest', behavior: suave ? 'smooth' : 'auto' });
  }, [nickname, rank]);

  const descargar = useCallback(() => {
    if (!canvasRef.current) return;
    // El nombre del fichero dice de qué edición es: en la carpeta de descargas, «trofeo.jpg» no dice nada.
    const limpio = seasonName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-');
    void downloadCanvas(canvasRef.current, `${limpio || 'premios'}-${rank}.jpg`);
  }, [rank, seasonName]);

  if (!getAward(rank)) return null;

  return (
    <div className="premios-award" ref={panelRef}>
      <canvas
        ref={canvasRef}
        className="premios-award__canvas"
        role="img"
        aria-label={PREMIOS_UI.palmares.medalAria(rank, seasonName)}
      />

      {/* Quién es el de la lámina que se está mirando. El canvas lo lleva dibujado, pero dibujado no es legible
          para quien no ve la pantalla. */}
      <div className="premios-award__actions">
        <p className="premios-award__who">
          <strong>{PREMIOS_UI.palmares.entry(rank, nickname)}</strong>
        </p>
        <button type="button" className="btn btn-primary" disabled={!listo} onClick={descargar}>
          {L.download}
        </button>
      </div>
    </div>
  );
}
