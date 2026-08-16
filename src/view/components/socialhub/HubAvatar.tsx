import { useEffect, useState } from 'react';
import { useGenericPhoto } from '../../hooks/useGenericPhoto';

/**
 * Avatar del hub social: muestra la foto (`photoURL`) y, si no hay o la imagen falla al cargar (p. ej. una URL de
 * Google caducada/rotada), cae a la SILUETA de persona a trazo. Renderiza SOLO el `<img>`/`<span>`; el envoltorio
 * clicable (botón) lo pone cada llamador.
 *
 * TAMBIÉN CAE A LA SILUETA CON EL AVATAR GENÉRICO DE GOOGLE (el monograma de la inicial sobre un círculo de color;
 * ver `core/social/googlePhoto`). Se descarta AQUÍ, al pintar, y no solo en el origen, porque esas URLs ya están
 * publicadas en los canales de mucha gente y en los documentos de amistad: filtrarlas en el render las retira de
 * golpe —feed, directorio, solicitudes, panel de administración— sin esperar a que cada usuario reabra la app ni
 * migrar nada. Que el monograma no se pinte es justo el motivo de que la silueta sea única: la inicial sobre color
 * es lo que esta pantalla decidió NO hacer.
 *
 * La silueta es la MISMA para todo el mundo. Antes era la inicial del nick sobre uno de seis tonos elegido por hash
 * del nombre, y eso tenía dos problemas: dos de los seis tonos eran el mismo azul (así que había menos variedad de
 * la que parecía) y el color de alguien cambiaba al cambiarse el nick. Una figura única no promete una identidad que
 * no puede sostener; quien identifica es el nombre, que va al lado. El tono lo pone ahora la PALETA activa
 * (`--deco-avatar-*`), no la persona.
 */
export function HubAvatar({
  photoURL,
  sizeClass = '',
}: {
  photoURL?: string;
  sizeClass?: string;
}) {
  const [failed, setFailed] = useState(false);
  const generic = useGenericPhoto(photoURL);

  // Si cambia la URL (otro perfil, refresco), se reintenta cargar la imagen.
  useEffect(() => {
    setFailed(false);
  }, [photoURL]);

  if (photoURL && !failed && !generic) {
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
    <span className={`hub-avatar hub-avatar-blank ${sizeClass}`.trim()} aria-hidden="true">
      <svg className="hub-avatar-icon" aria-hidden="true">
        <use href="#icon-person" />
      </svg>
    </span>
  );
}
