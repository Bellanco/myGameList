import { useEffect, useRef, useState } from 'react';
import { ANNOUNCEMENT_UI } from '../../core/constants/announcementLabels';
import type { Announcement } from '../../core/announcement/announcement';
import { Icon } from './Icon';
// La hoja se importa AQUÍ, atada al componente, por lo mismo que la de la medalla: esta cápsula se pinta desde un
// chunk perezoso y colgarla de `index.scss` la haría viajar en el arranque de todo el mundo por algo que casi
// nunca hay. La forma común con el aviso de logro vive en `styles/_capsule.scss`, que esta hoja `@use`.
import '../../styles/announcement.scss';

/**
 * EL AVISO DEL ADMINISTRADOR · la cápsula.
 *
 * ES LA MISMA QUE LA DEL LOGRO (`stats/AchievementToast`, §7.4 del plan de logros) y a propósito: el carril de
 * abajo a la izquierda ya está resuelto ahí —convive con la barra inferior, se aparta del banner de
 * consentimiento, se para al leerla y cada paleta la cuadra en su propio skin—, y un segundo lenguaje de aviso
 * para decir una cosa parecida solo serviría para que la app hablara con dos voces.
 *
 * LO QUE CAMBIA:
 *
 *  1. **El disco es un icono**, no una medalla. Un aviso no se ha conseguido.
 *  2. **El cuerpo es un `<a>` de verdad**, no un botón. Aquí no se navega por estado: se sale de la aplicación,
 *     así que tiene que poder abrirse en otra pestaña, copiarse y verse en la barra de estado antes de pulsar.
 *     De ahí también el `rel="noopener noreferrer"`, que es obligado en cualquier enlace con `target="_blank"`.
 *  3. **Vive OCHO segundos** y no cinco. El logro solo pide que lo mires; este pide que lo pulses, y cinco
 *     segundos para leer tres filas y alcanzar el enlace se quedaban cortos. Sigue SIN botón de cerrar, como el
 *     del logro: una X en un aviso de cortesía es una X que nadie pulsa y un tabulador que roba.
 *  4. **Se anuncia solo.** El logro delega en la región viva del `StatusBanner`, que ya existía; este no tiene
 *     banner detrás, así que lleva la suya. Ver abajo por qué el texto llega un instante después.
 *
 * LA CUENTA DE VECES LA APUNTA EL MONTAJE (`onShown`), no la decisión de enseñarlo: si un desbloqueo de logro se
 * queda el carril —tiene preferencia— esta cápsula no llega a pintarse, y lo que no se ve no se ha dicho.
 */

/** Vida de la cápsula. En pausa mientras se lee. */
const LIFE_MS = 8000;

/**
 * Lo que se espera para escribir dentro de la región viva.
 *
 * ⚑ NO ES UN ADORNO: una región viva solo anuncia los cambios que ocurren MIENTRAS ella existe, así que montarla
 * con el texto ya dentro no anuncia nada (es la misma razón por la que `StatusBanner` y `UpdateNotice` la tienen
 * siempre montada y vacía). Aquí la cápsula entera nace con el aviso, así que la región se monta vacía y el
 * texto entra un tick después.
 */
const ANNOUNCE_DELAY_MS = 120;

interface AnnouncementToastProps {
  announcement: Announcement;
  /** Lo llama al montarse: es lo que gasta una de las veces que se insiste. */
  onShown?: () => void;
  /** Se pulsó el enlace. */
  onOpen?: () => void;
  /** Se agotó la vida de la cápsula. */
  onDone?: () => void;
  /**
   * LA MUESTRA DEL PANEL: la misma cápsula sin carril fijo, sin reloj y sin región viva. El administrador tiene
   * que ver lo que va a publicar tal y como se va a ver, y la única forma honesta de conseguirlo es que sea
   * ESTE componente y no un dibujo parecido.
   */
  preview?: boolean;
}

export function AnnouncementToast({
  announcement,
  onShown,
  onOpen,
  onDone,
  preview = false,
}: AnnouncementToastProps) {
  const [paused, setPaused] = useState(false);
  const [announced, setAnnounced] = useState('');
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const shownRef = useRef(onShown);
  shownRef.current = onShown;

  const { id, title, body, url, icon, kicker } = announcement;

  useEffect(() => {
    if (preview) return;
    shownRef.current?.();
  }, [preview, id]);

  useEffect(() => {
    if (preview || paused) return;
    const reloj = window.setTimeout(() => doneRef.current?.(), LIFE_MS);
    return () => window.clearTimeout(reloj);
  }, [preview, paused, id]);

  useEffect(() => {
    if (preview) return;
    const reloj = window.setTimeout(() => setAnnounced(ANNOUNCEMENT_UI.linkAria(title, body)), ANNOUNCE_DELAY_MS);
    return () => window.clearTimeout(reloj);
  }, [preview, title, body]);

  const capsule = (
    <div className="ach-toast is-announce">
      <span className="ach-toast-sheen" aria-hidden="true" />
      {/* La pausa la lleva el ENLACE, que es lo que de verdad se puede enfocar y pulsar; su área se extiende a la
          cápsula entera desde la hoja (`.ach-toast-body::after`), así que el reloj se para al pasar el ratón por
          cualquier parte, relleno incluido. Es el mismo montaje que en el aviso de logro. */}
      <a
        className="ach-toast-body"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ANNOUNCEMENT_UI.linkAria(title, body)}
        onClick={() => onOpen?.()}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        <span className="ach-toast-disc" aria-hidden="true">
          <Icon name={icon} />
        </span>
        <span className="ach-toast-text">
          <span className="ach-toast-kicker">{kicker || ANNOUNCEMENT_UI.kickerFallback}</span>
          <span className="ach-toast-name">{title}</span>
          {body ? <span className="ach-toast-desc">{body}</span> : null}
        </span>
      </a>
    </div>
  );

  if (preview) {
    return <div className="ann-preview">{capsule}</div>;
  }

  return (
    <div className="ach-toast-stack">
      <div className="sr-only" role="status" aria-live="polite">{announced}</div>
      {capsule}
    </div>
  );
}
