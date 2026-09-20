import { useState } from 'react';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { copyText } from '../../../core/utils/clipboard';
import { Icon } from '../Icon';

const L = PREMIOS_UI.compartir;

/**
 * COMPARTIR LA PORRA, desde donde se esté y con lo que tenga el aparato.
 *
 * UN SOLO BOTÓN, dos comportamientos, y los dos son el mismo gesto para quien lo pulsa:
 *
 *   · con hoja del sistema (`navigator.share`: móvil y tablet, y Safari/Edge de escritorio) se abre la lista de
 *     destinos que esa persona tenga instalados. No hay que enumerar ninguna red ni mantener enlaces por
 *     servicio: la lista la pone el dispositivo, y funciona con WhatsApp, Telegram, correo o lo que sea;
 *   · sin ella (Firefox y Chrome de escritorio) se copia el enlace al portapapeles y se dice que está copiado.
 *
 * Es el mismo criterio que `ShareReviewModal`, con una diferencia: allí el enlace está a la vista y el botón
 * nativo puede no pintarse; aquí el botón tiene que estar SIEMPRE, porque es la única vía. Por eso el rótulo
 * cambia con lo que va a pasar —«compartir» o «copiar enlace»— en vez de prometer lo mismo en los dos casos.
 *
 * NO PUBLICA NADA NI TOCA LA RED: lo que se comparte es una dirección de la propia aplicación, pública de por sí
 * (el calendario y una edición publicada se leen sin cuenta). No hay token, ni cuota, ni nada que caduque.
 */
export interface PremiosCompartirProps {
  /** Ruta dentro de la app, con su barra inicial. Se convierte en absoluta con el dominio en el que se esté. */
  path: string;
  /** Titular del mensaje compartido. */
  title: string;
  /** La frase que acompaña al enlace donde el destino la admita. */
  text: string;
}

/** ¿Hay hoja de compartir del sistema? Se mira en cada render: no cambia, pero no merece un efecto. */
function haySistemaDeCompartir(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** La dirección absoluta de una ruta de la app. Fuera del navegador se devuelve tal cual (tests, SSR). */
function urlAbsoluta(path: string): string {
  if (typeof window === 'undefined' || !window.location?.origin) return path;
  try {
    return new URL(path, window.location.origin).toString();
  } catch {
    return path;
  }
}

export function PremiosCompartir({ path, title, text }: PremiosCompartirProps) {
  // Ni «copiado» ni «no se ha podido» son estados que deban sobrevivir a nada: se dicen y se olvidan al volver a
  // pulsar. Un aviso pegajoso en una pantalla que se comparte varias veces seguidas miente sobre el último
  // intento.
  const [aviso, setAviso] = useState<'' | 'copiado' | 'fallo'>('');
  const nativo = haySistemaDeCompartir();

  const compartir = async () => {
    const url = urlAbsoluta(path);
    setAviso('');

    if (nativo) {
      try {
        await navigator.share({ title, text, url });
      } catch {
        // Cerrar la hoja de compartir lanza, y cancelar no es un fallo que haya que contarle a nadie.
      }
      return;
    }

    setAviso((await copyText(url)) ? 'copiado' : 'fallo');
  };

  return (
    <div className="premios-compartir">
      <button type="button" className="btn premios-compartir__btn" onClick={() => void compartir()}>
        <Icon name="share-nodes" />
        <span>{nativo ? L.button : L.copy}</span>
      </button>
      {/* `role="status"` y no un párrafo a secas: quien no ve la pantalla tiene que enterarse de que se ha
          copiado, y es lo único que cambia al pulsar cuando no hay hoja del sistema. */}
      <p className="premios-compartir__status" role="status">
        {aviso === 'copiado' ? L.copied : aviso === 'fallo' ? L.failed : ''}
      </p>
    </div>
  );
}
