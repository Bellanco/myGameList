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
        // El feed y el directorio pintan muchos avatares a la vez, la mayoría fuera de pantalla: sin `lazy` se
        // piden todos de golpe al abrir el hub. `decoding="async"` evita que la decodificación bloquee el hilo
        // principal, y las dimensiones intrínsecas reservan el hueco para que el texto de al lado no salte
        // cuando la imagen llega (el tamaño real lo sigue poniendo el CSS de `sizeClass`).
        loading="lazy"
        decoding="async"
        width={40}
        height={40}
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
