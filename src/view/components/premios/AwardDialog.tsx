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
/** Un premiado de la galería: el puesto y el nombre que va escrito en la lámina. */
export interface AwardEntry {
  rank: number;
  nickname: string;
}

export interface AwardDialogProps {
  /** Los premiados de la edición, en orden de puesto. La galería recorre esta lista. */
  entries: AwardEntry[];
  /** Por cuál se abre. */
  inicial: number;
  seasonName: string;
  onClose: () => void;
}

/**
 * ES UNA GALERÍA, no una lámina suelta. Abierta por cualquiera de los premiados, se pasa de uno a otro con sus
 * flechas: ver los cinco no obliga a cerrar, buscar la fila siguiente y volver a abrir. La descarga vive DENTRO,
 * en la lámina que se esté mirando, que es lo que separa «ver» de «llevarse»: desde la clasificación se mira, y
 * el que quiera el archivo lo pide aquí.
 */
export function AwardDialog({ entries, inicial, seasonName, onClose }: AwardDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [listo, setListo] = useState(false);
  const [indice, setIndice] = useState(() => Math.min(Math.max(inicial, 0), Math.max(entries.length - 1, 0)));

  const actual = entries[indice];
  const rank = actual?.rank ?? 0;
  const name = actual?.nickname ?? '';

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    let vivo = true;
    setListo(false);
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

  if (!actual || !getAward(rank)) return null;

  return (
    <dialog ref={dialogRef} className="premios-award" onClose={onClose}>
      <canvas
        ref={canvasRef}
        className="premios-award__canvas"
        role="img"
        aria-label={PREMIOS_UI.palmares.medalAria(rank, seasonName)}
      />

      {/* Quién es el de la lámina que se está mirando, y por dónde va la galería. El canvas lo lleva dibujado,
          pero dibujado no es legible para quien no ve la pantalla. */}
      <p className="premios-award__who">
        <strong>{PREMIOS_UI.palmares.entry(rank, name)}</strong>
        {entries.length > 1 ? (
          <span className="premios-admin__muted">{L.awardOf(indice + 1, entries.length)}</span>
        ) : null}
      </p>

      <div className="premios-award__actions">
        {entries.length > 1 ? (
          <>
            <button
              type="button"
              className="btn"
              disabled={indice === 0}
              onClick={() => setIndice((i) => Math.max(0, i - 1))}
            >
              {L.awardPrev}
            </button>
            <button
              type="button"
              className="btn"
              disabled={indice === entries.length - 1}
              onClick={() => setIndice((i) => Math.min(entries.length - 1, i + 1))}
            >
              {L.awardNext}
            </button>
          </>
        ) : null}
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
