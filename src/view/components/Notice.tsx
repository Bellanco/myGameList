import { memo, type ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from '../../core/constants/icons';

/** Qué clase de aviso es. El tono decide el icono, el halo y la tinta del rótulo. */
export type NoticeTone = 'ok' | 'warn' | 'err' | 'info';

/**
 * El dibujo de cada tono. Del sprite de la app, y elegidos por lo que YA significan en ella: el check es el de
 * guardar, la campana la del aviso y el aspa la de cerrar/cancelar. Un aviso no es sitio para estrenar iconos.
 */
const TONE_ICON: Record<NoticeTone, IconName> = {
  ok: 'check',
  warn: 'bell',
  err: 'close',
  info: 'bell',
};

interface NoticeProps {
  tone?: NoticeTone;
  /** El rótulo de arriba, en versalitas y con el color del tono: «Correcto», «Sin conexión»… */
  kicker?: ReactNode;
  /** La línea que manda: qué ha pasado. */
  title?: ReactNode;
  /** El detalle, atenuado: qué significa o qué hacer. */
  children?: ReactNode;
  /** Sustituye al icono del tono cuando hay uno que dice más (el de recargar en la versión nueva). */
  icon?: IconName;
  /** Botones del aviso (hoy solo el «Recargar»). */
  actions?: ReactNode;
  /**
   * La misma cápsula en pequeño, para el aviso que vive DENTRO de un bloque y nace con su pantalla —el «sin
   * conexión» del hub, el requisito del editor de perfil—, donde una cápsula elevada se leería como algo que
   * alguien ha dejado encima del formulario.
   */
  inline?: boolean;
  className?: string;
  role?: string;
  'aria-label'?: string;
}

/**
 * EL AVISO DE LA APLICACIÓN. Uno solo, y es LA CÁPSULA DEL AVISO DE LOGRO.
 *
 * Antes había cuatro bloques a medida diciendo lo mismo de cuatro maneras (estado, versión nueva, sin conexión
 * del hub y requisito del perfil): dos tarjetas con lomo copiadas y dos bandas ámbar copiadas. Unificarlos en la
 * forma de siempre habría dejado la app hablando con dos voces —la cápsula para los logros y el administrador, y
 * una banda gris para todo lo demás—, así que el aviso se muda a la cápsula, que es la pieza que el proyecto ya
 * tiene resuelta. Es el mismo camino que hizo el aviso del administrador (`AnnouncementToast`).
 *
 * LO QUE ESO TRAE DE REGALO: los skins de paleta cuelgan de `.ach-toast`, así que el aviso sale con el chaflán
 * del HUD en Sin futuro y con la placa recta en Cámara de pruebas sin una línea escrita por tema.
 *
 * NO ES PULSABLE, y por eso no lleva `.ach-toast-body`: el logro y el anuncio llevan dentro un botón o un enlace
 * que ocupa la cápsula entera —el logro lleva a /logros, el anuncio a otra web—, pero un «juego guardado» no
 * lleva a ninguna parte.
 *
 * ES PRESENTACIONAL Y NO SE ANUNCIA SOLO, que es deliberado: el de estado y el de versión nueva escriben en una
 * región viva que está SIEMPRE montada aparte (una región viva solo anuncia lo que cambia mientras ella existe,
 * así que montarla con el mensaje ya dentro no anuncia nada), y los del hub se declaran `role="status"` en el
 * propio aviso. Si esta pieza trajera el `role` de serie, los dos primeros se anunciarían dos veces.
 */
export const Notice = memo(function Notice({
  tone = 'info',
  kicker,
  title,
  children,
  icon,
  actions,
  inline = false,
  className = '',
  role,
  'aria-label': ariaLabel,
}: NoticeProps) {
  // `has-action` no es cosmética: sin acción la cápsula mide lo que mide su texto —como la del logro—, y con
  // ella se estira para que el botón tenga su sitio al extremo en vez de encajarse junto al título.
  const classes = ['ach-toast', 'is-notice', `is-${tone}`, inline ? 'is-compact' : '', actions ? 'has-action' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} role={role} aria-label={ariaLabel}>
      {/* El barrido, solo en la cápsula grande y solo con los efectos encendidos (lo apaga la hoja). En el peso
          ligero sobra: no hay noticia que señalar, el aviso ya estaba ahí al llegar a la pantalla. */}
      {!inline ? <span className="ach-toast-sheen" aria-hidden="true" /> : null}
      <span className="ach-toast-disc" aria-hidden="true">
        <Icon name={icon || TONE_ICON[tone]} />
      </span>
      <span className="ach-toast-text">
        {kicker ? <span className="ach-toast-kicker">{kicker}</span> : null}
        {title ? <span className="ach-toast-name">{title}</span> : null}
        {children ? <span className="ach-toast-desc">{children}</span> : null}
      </span>
      {actions ? <span className="ach-toast-action">{actions}</span> : null}
    </div>
  );
});
