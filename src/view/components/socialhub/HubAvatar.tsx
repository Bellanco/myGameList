import { useEffect, useState } from 'react';
import { avatarInitial, avatarTone } from './avatar';

/**
 * Avatar del hub social: muestra la foto (`photoURL`) y, si la imagen falla al cargar (p. ej. una URL de Google
 * caducada/rotada), conmuta automáticamente al avatar de inicial con color determinista. Renderiza SOLO el
 * `<img>`/`<span>`; el envoltorio clicable (botón) lo pone cada llamador.
 */
export function HubAvatar({
  name,
  photoURL,
  sizeClass = '',
}: {
  name: string;
  photoURL?: string;
  sizeClass?: string;
}) {
  const [failed, setFailed] = useState(false);

  // Si cambia la URL (otro perfil, refresco), se reintenta cargar la imagen.
  useEffect(() => {
    setFailed(false);
  }, [photoURL]);

  if (photoURL && !failed) {
    return (
      <img
        className={`hub-avatar hub-avatar-img ${sizeClass}`.trim()}
        src={photoURL}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className={`hub-avatar ${sizeClass} hub-avatar--${avatarTone(name)}`.trim()} aria-hidden="true">
      {avatarInitial(name)}
    </span>
  );
}
