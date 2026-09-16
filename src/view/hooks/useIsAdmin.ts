import { useEffect, useState } from 'react';
import { isAdminEmail } from '../../core/security/admin';
import { subscribeSocialAuth } from '../../model/repository/firebaseGateway';

/**
 * ¿Manda quien está mirando? Igual que `useAdminViewModel`, se apoya en `isAdminEmail`, y vale lo mismo que allí:
 * esto es SOLO para la interfaz. La barrera de verdad está en `firestore.rules`, y lo que hay detrás de este
 * `true` —el modo ampliado de las carátulas— no concede acceso a nada: como mucho, peores emparejamientos para
 * quien lo fuerce.
 *
 * Hook aparte y no un campo más de `useScoreScaleSession` porque aquel, además de mirar la sesión, hidrata la
 * escala de puntuación: llamarlo dos veces dispararía esa hidratación dos veces. Aquí solo se escucha.
 */
export function useIsAdmin(): boolean {
  const [esAdmin, setEsAdmin] = useState(false);
  useEffect(() => subscribeSocialAuth((user) => setEsAdmin(isAdminEmail(user?.email))), []);
  return esAdmin;
}
