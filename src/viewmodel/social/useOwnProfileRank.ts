// TU RANGO Y LO QUE YA ESTÁ PUBLICADO DE TI, de una sola lectura de tu documento de perfil.
//
// Sale de `useSocialViewModel` con sus cinco estados, que solo escribe este efecto. Se llama ARRIBA del todo, donde
// vivían esos estados, porque los leen piezas que van antes que la hidratación del perfil: el directorio (el rango
// decide su TTL de caché) y tus logros (lo publicado es el suelo de la próxima publicación).
import { useEffect, useState } from 'react';
import { DEFAULT_PROFILE_TIER, type ProfileTier } from '../../core/constants/tiers';
import { resolveOwnProfile, type SocialAuthUser } from '../../model/repository/firebaseRepository';

/** Sin espejo publicado todavía (o sin leer): cadena vacía y sin instante, que es «no hay cota». */
const NO_PUBLISHED_MIRROR = { list: '', at: 0 };

export function useOwnProfileRank(authUser: SocialAuthUser | null) {
  // Rango del PROPIO usuario: decide cada cuánto se rehidrata el feed (ver PROFILE_TIER_FEED_TTL_MS). Manda el de
  // quien mira porque las lecturas de gists ajenos van con SU token y cuentan contra SU rate-limit.
  const [ownTier, setOwnTier] = useState<ProfileTier>(DEFAULT_PROFILE_TIER);
  /**
   * Tu fecha de alta (ms), del documento de perfil. La necesitan «De la vieja escuela» y «Otro año más», que son
   * los dos únicos logros del catálogo que miden algo que NO sale de tu biblioteca.
   *
   * Viaja con la misma lectura que el rango —una sola, ya cacheada 60 s por `getOwnProfileRef`— así que no cuesta
   * ni una petición. 0 mientras no se sepa, que es lo que deja los dos logros sin conceder en vez de regalarlos.
   */
  const [ownProfileCreatedAt, setOwnProfileCreatedAt] = useState(0);
  /**
   * ¿Tiene esta cuenta un perfil PUBLICADO? Es decir, existe `profiles/{uid}` y su social está activo.
   *
   * No vale `ownProfileId` para esto, aunque lo parezca: ese id se SIEMBRA en local (`seedProfileIdFromRemote`)
   * aunque no haya documento en Firestore, así que lo tiene también quien nunca abrió el social. Lo que sí lo
   * garantiza es haber leído el documento.
   */
  const [ownProfilePublished, setOwnProfilePublished] = useState(false);
  /** Tu espejo tal y como está PUBLICADO. Es el suelo de la próxima publicación: de ahí no se baja. */
  // El espejo publicado ENTERO —cadena e instante—, no solo la cadena: el `at` es la cota de las fechas que
  // llegan tarde (ver `mergeForPublish`).
  const [ownPublishedMirror, setOwnPublishedMirror] = useState<{ list: string; at: number }>(NO_PUBLISHED_MIRROR);
  /**
   * ¿Se sabe ya el rango propio? `ownTier` arranca en bronce porque es el valor por defecto real, pero "bronce
   * porque aún no se ha leído el perfil" y "bronce porque ese es su rango" NO son lo mismo para el directorio: el
   * primero elegiría el TTL de caché equivocado y obligaría a rehidratarlo entero al conocerse el rango.
   */
  const [tierResolved, setTierResolved] = useState(false);

  // Rango propio → cadencia del feed. Una sola lectura del perfil propio (ya cacheada 60 s en memoria por
  // `getOwnProfileRef`). Cualquier fallo deja bronce: degradar es lo seguro.
  //
  // `tierResolved` es lo que evita que el privilegio del rango llegue SIEMPRE un paso tarde. Antes se hidrataba con
  // el bronce por defecto y, al llegar el rango de verdad, la hidratación entera se repetía: medido, un bronce
  // hidrataba UNA vez y un plata/oro/mithril DOS —la segunda releyendo hasta ~50 gists de amigos—, y con la caché
  // caliente esa segunda pasada tapaba con el esqueleto un feed ya pintado. Es decir, cuanto más alto el rango,
  // peor la experiencia: justo lo contrario de lo que el rango promete. Ahora se espera a saberlo, igual que se
  // espera a `friendshipsResolved`, y la primera evaluación de la caché ya usa el TTL que toca.
  useEffect(() => {
    if (!authUser?.uid) {
      setOwnTier(DEFAULT_PROFILE_TIER);
      setOwnProfileCreatedAt(0);
      setOwnProfilePublished(false);
      setOwnPublishedMirror(NO_PUBLISHED_MIRROR);
      setTierResolved(false);
      return;
    }
    let cancelled = false;
    void resolveOwnProfile(authUser)
      .then((profile) => {
        if (cancelled) return;
        setOwnTier(profile?.tier || DEFAULT_PROFILE_TIER);
        // De paso, la fecha de alta y si el perfil está publicado: es el mismo documento y la misma lectura.
        setOwnProfileCreatedAt(profile?.createdAt || 0);
        setOwnProfilePublished(Boolean(profile?.socialEnabled));
        setOwnPublishedMirror({ list: profile?.achievementsMirror || '', at: profile?.achievementsMirrorAt || 0 });
      })
      .catch(() => {
        /* sin rango conocido → bronce */
      })
      .finally(() => {
        // Resuelto SIEMPRE, también si la lectura falla: sin esto, un Firestore caído dejaría el feed sin hidratar
        // (y con el esqueleto puesto) en vez de degradar a la cadencia de bronce, que es lo seguro.
        if (!cancelled) setTierResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authUser]);

  return { ownTier, ownProfileCreatedAt, ownProfilePublished, ownPublishedMirror, tierResolved };
}
