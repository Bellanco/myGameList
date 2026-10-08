// LA FOTO PROPIA EN LOS CANALES PÚBLICOS: propagarla a tu gist social y al directorio, o retirarla si es el avatar
// genérico de Google. Sale de `useSocialViewModel` tal cual: un efecto cerrado, una vez por sesión y best-effort.
import { useEffect, useRef } from 'react';
import { getSocialSyncConfig, readSocialGist, writeSocialGist } from '../../model/repository/socialGistRepository';
import { getLocalMeta, patchLocalMeta } from '../../model/repository/indexedDbRepository';
import { updateProfilePhoto, type SocialAuthUser } from '../../model/repository/firebaseRepository';
import type { SocialDirectoryEntry } from './socialFeed';

export interface OwnPhotoHealInput {
  socialSpaceOpen: boolean;
  socialCfgGistId: string;
  authUser: SocialAuthUser | null;
  /** ¿La foto de la sesión es el avatar genérico de Google (el monograma)? `undefined` mientras no se sabe. */
  ownPhotoIsGeneric: boolean | undefined;
  /** ¿Aún no se sabe si es genérica? Sin veredicto no se toca nada. */
  ownPhotoVerdictPending: boolean;
  /** El interruptor «mostrar foto» del perfil. */
  showPhoto: boolean;
  patchDirectoryEntries: (match: (entry: SocialDirectoryEntry) => boolean, patch: Partial<SocialDirectoryEntry>) => void;
}

export function useOwnPhotoHeal({
  socialSpaceOpen,
  socialCfgGistId,
  authUser,
  ownPhotoIsGeneric,
  ownPhotoVerdictPending,
  showPhoto,
  patchDirectoryEntries,
}: OwnPhotoHealInput): void {
  // Bloque 2 — pone al día la foto propia EN LOS CANALES PÚBLICOS, en los dos sentidos.
  //
  // PROPAGAR: la foto solo la ven otros si está en NUESTRO gist social público. Gists creados antes del soporte de
  // foto (o sin re-guardar el perfil) no la llevan, así que nadie veía la de nadie.
  //
  // RETIRAR: si lo que la cuenta tiene es el avatar GENÉRICO de Google, hay que quitarlo de donde ya se publicó. Es
  // la única vía de saneado: esas URLs se escribieron cuando "tener URL" contaba como tener foto, y ni el gist ni el
  // doc de directorio se reescriben solos. Filtrarlo al pintar (`HubAvatar`) quita el síntoma en NUESTRA pantalla;
  // esto lo quita del dato, que es lo que leen los demás.
  //
  // Una vez por sesión y best-effort: si falla, se reintenta en la próxima.
  const photoHealAttemptedRef = useRef(false);
  useEffect(() => {
    if (photoHealAttemptedRef.current) return;
    if (!socialSpaceOpen || !socialCfgGistId) return;
    const sessionPhoto = authUser?.photoURL || '';
    if (!sessionPhoto) return;
    // Sin veredicto no se toca nada: publicar ahora sellaría la genérica y armaría la ref, y no habría otra pasada.
    if (ownPhotoVerdictPending) return;
    // Lo que debe quedar publicado: la foto de la sesión, o nada si es el avatar genérico.
    const target = ownPhotoIsGeneric ? '' : sessionPhoto;
    // Con la foto apagada a propósito no hay nada que propagar. Pero una genérica ya publicada SÍ se retira: el
    // opt-out protege lo que el usuario decidió mostrar, no una imagen que nunca fue suya.
    if (!showPhoto && target) return;
    const cfg = getSocialSyncConfig();
    if (!cfg?.token) return;
    photoHealAttemptedRef.current = true;

    void (async () => {
      try {
        // 2b — idempotencia entre sesiones: si ya dejamos el canal en este estado, no releemos ni reescribimos el
        // gist. Vale para los dos sentidos: `''` marca "ya retirada".
        const meta = await getLocalMeta();
        if (meta?.photoHealedFor === target) return;

        const current = await readSocialGist(cfg.token, socialCfgGistId, null);
        const data = current.data;
        if (!data) return;
        // El gist es la fuente de verdad: si el usuario tiene la foto desactivada, NO la republicamos (evita revertir
        // su opt-out por una carrera con la hidratación del perfil, que arranca con showPhoto=true por defecto). La
        // retirada de una genérica no se frena aquí: quitarla nunca va contra lo que el usuario quiso.
        if (data.profile.visibility?.showPhoto === false && target) return;

        if ((data.profile.photoURL || '') !== target) {
          await writeSocialGist(cfg.token, socialCfgGistId, {
            // `photoURL: ''` no se publica: el saneado del gist descarta lo que no sea una URL válida, así que el
            // campo desaparece del canal en vez de quedarse vacío.
            profile: { ...data.profile, photoURL: target },
            activity: data.activity,
            posts: data.posts,
            updatedAt: Date.now(),
          });
          // 2a — sin re-hidratación completa (~30 lecturas). La foto propia ya se ve por el fallback de sesión; solo
          // parcheamos la entrada propia del directorio en memoria por si acaso, y la del directorio cacheado.
          patchDirectoryEntries((e) => e.socialGistId === socialCfgGistId, { photoURL: target });
        }
        // Propaga (o borra) también la foto en el doc público de Firestore (la lee el directorio), para que los demás
        // lo vean sin depender de que cada uno reabra la app y re-publique su gist. Best-effort.
        if (authUser?.uid) {
          await updateProfilePhoto(authUser.uid, target);
        }
        await patchLocalMeta({ photoHealedFor: target });
      } catch {
        // best-effort: no bloquea el feed; se reintenta la próxima sesión.
      }
    })();
  }, [authUser?.uid, authUser?.photoURL, ownPhotoIsGeneric, ownPhotoVerdictPending, showPhoto, socialSpaceOpen, socialCfgGistId, patchDirectoryEntries]);
}
