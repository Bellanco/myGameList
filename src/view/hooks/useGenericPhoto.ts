import { useEffect, useState } from 'react';
import { getKnownPhotoVerdict, isGenericGooglePhoto } from '../../core/social/googlePhoto';

/**
 * ¿La foto de esta URL es el avatar genérico de Google? (ver `core/social/googlePhoto`).
 *
 * Devuelve `undefined` MIENTRAS NO SE SABE, y esa tercera respuesta es la que importa. Para pintar da igual —quien
 * duda pinta la foto—, pero los efectos que PUBLICAN la foto propia corren una sola vez por sesión y se arman con una
 * ref: si salieran antes del veredicto, sellarían la URL genérica en los canales y no habría segunda oportunidad
 * hasta la próxima sesión. Con `undefined` pueden esperar.
 *
 * Arranca con el veredicto YA CACHEADO si lo hay, y así la segunda vez que aparece una misma cara —lo normal en el
 * feed, donde una persona sale en varias tarjetas— se decide en el primer render, sin parpadeo.
 *
 * Mientras llega la respuesta la foto SE PINTA, y se retira al confirmarse genérica. Al revés —silueta primero, foto
 * después— el parpadeo lo pagarían TODAS las fotos reales, que son la mayoría, para ahorrárselo a las genéricas.
 */
export function useGenericPhoto(photoURL: string | null | undefined): boolean | undefined {
  const [generic, setGeneric] = useState<boolean | undefined>(() => getKnownPhotoVerdict(photoURL));

  useEffect(() => {
    const known = getKnownPhotoVerdict(photoURL);
    if (known !== undefined) {
      setGeneric(known);
      return;
    }

    // Al cambiar de foto se vuelve a "no se sabe": mantener el veredicto de la anterior le pondría la silueta a una
    // cara que aún no se ha mirado.
    setGeneric(undefined);
    let alive = true;
    void isGenericGooglePhoto(photoURL).then((value) => {
      if (alive) {
        setGeneric(value);
      }
    });
    return () => {
      alive = false;
    };
  }, [photoURL]);

  return generic;
}
