import { useEffect, useState } from 'react';
import { readAdminClaim, subscribeSocialAuth } from '../../model/repository/firebaseGateway';

/**
 * ¿Manda quien está mirando? Igual que `useAdminViewModel`, se apoya en el custom claim `admin` del token, y vale
 * lo mismo que allí: esto es SOLO para la interfaz. La barrera de verdad está en `firestore.rules`, y lo que hay
 * detrás de este `true` —el modo ampliado de las carátulas— no concede acceso a nada: como mucho, peores
 * emparejamientos para quien lo fuerce.
 *
 * Hook aparte y no un campo más de `useScoreScaleSession` porque aquel, además de mirar la sesión, hidrata la
 * escala de puntuación: llamarlo dos veces dispararía esa hidratación dos veces. Aquí solo se escucha.
 *
 * SIN SESIÓN NO SE PREGUNTA NADA. La comprobación del claim pasa por la fachada perezosa y cargarla son 172 kB;
 * `subscribeSocialAuth` está pensado justo para no pagarlos cuando no hay sesión guardada, y esa propiedad se
 * conserva preguntando solo cuando llega un usuario (en cuyo caso el SDK ya está cargado).
 *
 * TAMPOCO SE FUERZA EL REFRESCO DEL TOKEN: aquí se pregunta de pasada, en pantallas normales, así que se lee el
 * token que haya. Quien acabe de recibir el claim lo verá en cuanto el token se renueve o vuelva a entrar; el
 * panel, que sí es donde importa, lo reintenta forzando (ver `useAdminViewModel`).
 */
export function useIsAdmin(): boolean {
  const [esAdmin, setEsAdmin] = useState(false);
  useEffect(() => {
    let vivo = true;
    const desuscribir = subscribeSocialAuth((user) => {
      if (!user) {
        if (vivo) setEsAdmin(false);
        return;
      }
      void readAdminClaim().then((manda) => {
        if (vivo) setEsAdmin(manda);
      });
    });
    return () => {
      vivo = false;
      desuscribir();
    };
  }, []);
  return esAdmin;
}
