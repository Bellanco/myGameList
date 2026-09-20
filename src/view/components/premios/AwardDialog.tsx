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
 * `<dialog>` NATIVO: el foco atrapado, la tecla de escape y la inercia de lo que queda detrás salen gratis. El
 * canvas lleva `role="img"` y su nombre accesible, porque para un lector de pantalla un canvas es una caja vacía
 * y el nombre dibujado dentro no existe en el DOM.
 *
 * SOLO SE OFRECE A QUIEN TIENE SESIÓN. El arte es un collage con material de terceros y el rótulo de un certamen
 * ajeno, así que no se enseña en la página pública de resultados: ahí va la medalla tipográfica de la casa (ver
 * `PalmaresMedal`). Nota honesta: los ficheros viven en `public/awards/`, de modo que quien adivine su URL puede
 * abrirlos en blanco. No se enlazan en ninguna parte pública, el dominio va con `noindex` y `robots.txt` cierra
 * el paso; si algún día hiciera falta privacidad de verdad, el camino es servirlos desde KV tras comprobar el
 * token, como se hace con las reseñas compartidas.
 */
export interface AwardDialogProps {
  rank: number;
  name: string;
  seasonName: string;
  onClose: () => void;
}

export function AwardDialog({ rank, name, seasonName, onClose }: AwardDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    let vivo = true;
    void drawAward(canvasRef.current, { rank, name })
      .then(() => {
        if (vivo) setListo(true);
      })
      .catch(() => {
        // Sin lámina no hay trofeo que enseñar, pero el diálogo se cierra igual.
      });
    return () => {
      vivo = false;
    };
  }, [name, rank]);

  const descargar = useCallback(() => {
    if (!canvasRef.current) return;
    // El nombre del fichero dice de qué edición es: en la carpeta de descargas, «trofeo.jpg» no dice nada.
    const limpio = seasonName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-');
    void downloadCanvas(canvasRef.current, `${limpio || 'premios'}-${rank}.jpg`);
  }, [rank, seasonName]);

  if (!getAward(rank)) return null;

  return (
    <dialog ref={dialogRef} className="premios-award" onClose={onClose}>
      <canvas
        ref={canvasRef}
        className="premios-award__canvas"
        role="img"
        aria-label={PREMIOS_UI.palmares.medalAria(rank, seasonName)}
      />
      <div className="premios-award__actions">
        <button type="button" className="btn btn-primary" disabled={!listo} onClick={descargar}>
          {L.download}
        </button>
        <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>
          {PREMIOS_UI.admin.categories.cancel}
        </button>
      </div>
    </dialog>
  );
}
