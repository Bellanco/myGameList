import { useEffect, useState } from 'react';
import { readAdminClaim, subscribeSocialAuth } from '../../model/repository/firebaseGateway';

/**
 * ¿Manda quien está mirando? Igual que `useAdminViewModel`, se apoya en el custom claim `admin` del token, y vale
 * lo mismo que allí: esto es SOLO para la interfaz. La barrera de verdad está en `firestore.rules` y en el borde,
 * que comprueban el claim con el token verificado.
 *
 * EMPIEZA SIEMPRE EN `false` y la respuesta llega tarde (tras bajar el SDK de Auth y leer el token), así que no
 * debe decidir nada que ya esté pintado. Por eso dejó de elegir la URL de las carátulas (el modo ampliado,
 * retirado el 08-10-2026): al llegar el claim, todas cambiaban y parpadeaban.
 *
 * Hook aparte y no un campo más de `useScoreScaleSession` porque aquel, además de mirar la sesión, hidrata la
 * escala de puntuación: llamarlo dos veces dispararía esa hidratación dos veces. Aquí solo se escucha.
 *
 * SIN SESIÓN NO SE PREGUNTA NADA. La comprobación del claim pasa por la fachada perezosa y cargarla son 172 kB;
 * `subscribeSocialAuth` está pensado justo para no pagarlos cuando no hay sesión guardada, y esa propiedad se
 * conserva preguntando solo cuando llega un usuario (en cuyo caso el SDK ya está cargado).
 *
 * `enabled = false` NO PREGUNTA EN ABSOLUTO, ni siquiera por la sesión, y es para quien sabe que la respuesta no le
 * sirve. Hace falta porque «no hay sesión guardada» no siempre se puede saber: con el almacenamiento bloqueado
 * (cookies bloqueadas en Safari o Chrome), `hasStoredAuthSession` responde que SÍ por prudencia y la suscripción
 * descarga el SDK. En móvil, además, Auth prepara nada más cargar el iframe de Google. Eso le pasaba a la página
 * PÚBLICA de un enlace compartido, que promete no cargar Firebase ni contactar con terceros, solo por montar las
 * sugerencias del pie (cuando las carátulas de las reseñas preguntaban por el modo ampliado).
 *
 * TAMPOCO SE FUERZA EL REFRESCO DEL TOKEN: aquí se pregunta de pasada, en pantallas normales, así que se lee el
 * token que haya. Quien acabe de recibir el claim lo verá en cuanto el token se renueve o vuelva a entrar; el
 * panel, que sí es donde importa, lo reintenta forzando (ver `useAdminViewModel`).
 */
export function useIsAdmin(enabled = true): boolean {
  const [esAdmin, setEsAdmin] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setEsAdmin(false);
      return undefined;
    }
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
  }, [enabled]);
  return esAdmin;
}
