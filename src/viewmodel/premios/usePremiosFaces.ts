/**
 * QUIÉN DE LA CLASIFICACIÓN TIENE PERFIL, para poder enlazarlo.
 *
 * El archivo publicado no lleva uid ni fotos —es público y permanente, ver `docs/plan-unificar-premios.md` §4.1—,
 * solo el pseudónimo. Con él se cruza aquí contra el directorio social, que ya está cacheado, y así una fila de
 * la clasificación deja de ser un nombre suelto y lleva a su perfil. Es lo que convierte la pantalla en un sitio
 * por el que se puede seguir tirando.
 *
 * ⚠️ POR QUÉ AQUÍ NO SE PINTAN CARAS, todavía.
 *
 * La decisión era enseñar la foto con las mismas cuatro puertas del hub, y una de ellas no se puede evaluar desde
 * esta sección: la RECIPROCIDAD necesita saber si quien mira publica su propia foto, y ese interruptor
 * (`visibility.showPhoto`) vive **dentro del gist social**. Resolverlo aquí obligaría a cargar el canal de GitHub
 * solo para decidir si se pinta un círculo.
 *
 * Las salidas, por si se retoma: replicar ese interruptor en `publicConfig/{uid}` —que es owner-only, ya
 * sincroniza preferencias entre dispositivos y se lee con una consulta— o pasar el espectador ya resuelto desde
 * el hub cuando se llegue desde él. Lo que NO vale es asumir que quien tiene foto la publica: quien la ha
 * escondido a propósito vería las de los demás sin enseñar la suya, que es justo el trato que la regla deshace.
 *
 * Mientras tanto, iniciales para todo el mundo, que es lo que ya ve un visitante sin sesión.
 */
import { useEffect, useMemo, useState } from 'react';
import { listSocialDirectory } from '../../model/repository/firebaseSocialRepository';
import type { PremiosArchivedEntry } from '../../model/types/premios';

/** Perfiles reconocidos en la clasificación: pseudónimo → uid de su perfil. */
export type PremiosProfiles = Map<string, string>;

export function usePremiosProfiles(leaderboard: PremiosArchivedEntry[], uid: string): PremiosProfiles {
  const [profiles, setProfiles] = useState<PremiosProfiles>(new Map());

  // Los pseudónimos que de verdad hacen falta. Un archivo antiguo sin ninguno no dispara ninguna lectura.
  const wanted = useMemo(
    () => leaderboard.map((entry) => entry.profileId).filter(Boolean).join(','),
    [leaderboard],
  );

  useEffect(() => {
    let vivo = true;
    // SIN SESIÓN NO SE PIDE NADA: las reglas solo dejan listar el directorio a quien ha entrado, y un visitante
    // anónimo no tiene a dónde ir aunque se le enlace.
    if (!uid || !wanted) {
      setProfiles(new Map());
      return () => {
        vivo = false;
      };
    }

    void listSocialDirectory(60)
      .then((directory) => {
        if (!vivo) return;
        const siguiente: PremiosProfiles = new Map();
        for (const entry of directory) {
          if (entry.profileId) siguiente.set(entry.profileId, entry.uid);
        }
        setProfiles(siguiente);
      })
      .catch(() => {
        // Sin directorio, la clasificación se lee igual: nombres y puntos.
      });

    return () => {
      vivo = false;
    };
  }, [uid, wanted]);

  return profiles;
}
