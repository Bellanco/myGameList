// FASE 2 — MIGRACIÓN A CANAL SECRETO (una vez por sesión).
//
// Sale de `useSocialViewModel` tal cual: es un efecto cerrado que lee el canal y la identidad y, si migra, repunta
// las tres referencias (config local, `privateConfig`, amistades) antes de retirar el gist antiguo. El ORDEN de esas
// operaciones es lo que no puede cambiar (ver los comentarios de dentro); por eso se ha movido sin tocarlo.
import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { SOCIAL_UI } from '../../core/constants/socialLabels';
import {
  deleteGist,
  ensureSecretSocialGist,
  getSocialSyncConfig,
  saveSocialSyncConfig,
  socialGistHasContent,
} from '../../model/repository/socialGistRepository';
import { getLocalMeta, patchLocalMeta } from '../../model/repository/indexedDbRepository';
import { getPrivateConfig, healOwnFriendshipIdentity, setPrivateConfig, type SocialAuthUser } from '../../model/repository/firebaseRepository';
import type { SyncConfig } from '../../model/types/game';

export interface SecretChannelMigrationInput {
  socialSpaceOpen: boolean;
  authUser: SocialAuthUser | null;
  socialCfgGistId: string;
  mainSyncConfig: SyncConfig | null;
  /** El nick del perfil social: viaja a los documentos de amistad al repuntarlos. */
  profileName: string;
  ownPublishablePhoto: string;
  setSocialCfgGistId: Dispatch<SetStateAction<string>>;
  setSocialCfgEtag: Dispatch<SetStateAction<string | null>>;
  setFeedback: (kind: 'ok' | 'warn' | 'err', message: string, duration?: 'short' | 'long') => void;
}

export function useSecretChannelMigration({
  socialSpaceOpen,
  authUser,
  socialCfgGistId,
  mainSyncConfig,
  profileName,
  ownPublishablePhoto,
  setSocialCfgGistId,
  setSocialCfgEtag,
  setFeedback,
}: SecretChannelMigrationInput): void {
  // Los canales creados antes de este cambio son gists PÚBLICOS: aparecen listados en el perfil de GitHub de su
  // dueño y en las búsquedas. GitHub no permite cambiar la visibilidad, así que la única vía es clonar a un id
  // nuevo, y solo puede hacerlo el propio usuario: su token es owner-only, así que esto NO se puede hacer desde
  // el panel de administración.
  //
  // Tras migrar hay que repuntar las TRES referencias que quedan: la config local, `privateConfig` (owner-only, la
  // fuente de verdad) y los documentos de amistad (por eso se rearma el saneado de amistades).
  const secretMigrationRef = useRef(false);
  useEffect(() => {
    if (secretMigrationRef.current) return;
    if (!socialSpaceOpen || !authUser?.uid || !socialCfgGistId) return;
    const token = getSocialSyncConfig()?.token || mainSyncConfig?.token || '';
    if (!token) return;
    // Se fija el usuario aquí: dentro de las funciones anidadas el estado ya no se puede estrechar a no-nulo.
    const owner = authUser;
    secretMigrationRef.current = true;
    let cancelled = false;

    // ¿Migró ya OTRO dispositivo? `privateConfig` es la fuente de verdad de la cuenta y solo la escribe su dueño.
    // Sin esta comprobación, dos dispositivos abriendo a la vez clonarían cada uno por su lado y recrearían la
    // deriva que esta migración viene a eliminar. Si ya hay un canal distinto ahí, se adopta en vez de clonar.
    void (async () => {
      // La retirada de los ids que el perfil PÚBLICO aún anuncie ESTABA AQUÍ, y se ha ido a
      // `useSocialStartupTasks`. Estaba dentro de esta cadena porque quien ya migró en otra sesión no vuelve a
      // entrar en ella y se quedaba publicando un gist borrado; con esta migración ya sellada
      // (`socialChannelPrivateFor`), quedarse aquí la habría dejado sin correr nunca más. Allí tiene su propio
      // sello y sigue cubriendo ese caso.
      //
      // SELLO DEL CANAL YA SECRETO. `ensureSecretSocialGist` no puede saber si hay algo que migrar sin LISTAR los
      // gists de la cuenta contra la API de GitHub, y eso pasaba en CADA apertura del hub para descubrir, casi
      // siempre, que no había nada que hacer. Una vez que consta que este canal es secreto, no puede volver a ser
      // público (GitHub no permite cambiar la visibilidad), así que el sello es definitivo para ese id.
      const meta = await getLocalMeta().catch(() => null);
      if (cancelled) return;
      if (meta?.socialChannelPrivateFor === socialCfgGistId) return;

      const shared = await getPrivateConfig(owner.uid).catch(() => null);
      const sharedGistId = String(shared?.socialGistId || '').trim();
      if (sharedGistId && sharedGistId !== socialCfgGistId) {
        const currentConfig = getSocialSyncConfig();
        if (currentConfig) {
          saveSocialSyncConfig({ ...currentConfig, gistId: sharedGistId, etag: null, lastRemoteUpdatedAt: 0 });
        }
        setSocialCfgGistId(sharedGistId);
        setSocialCfgEtag(null);
        return;
      }
      await runSecretMigration(token);
    })();

    async function runSecretMigration(activeToken: string) {
    return ensureSecretSocialGist(activeToken, socialCfgGistId)
      .then((result) => {
        // Demasiado grande para leerlo entero por la API: no se migra y se dice. Callarlo dejaría un canal
        // público para siempre sin que nadie sepa por qué.
        if (result.tooLarge) {
          // Sin sellar a propósito: sigue siendo público y hay que reintentarlo (puede adelgazar al rotar la
          // actividad). Sellarlo aquí lo dejaría público para siempre.
          setFeedback('warn', SOCIAL_UI.status.socialGistTooLarge);
          return;
        }
        if (!result.migrated) {
          // Nada que migrar: el canal ya era secreto (o no es de esta cuenta). Se sella para no volver a listar
          // los gists en la próxima apertura.
          void patchLocalMeta({ socialChannelPrivateFor: socialCfgGistId }).catch(() => {});
          return;
        }

        const currentConfig = getSocialSyncConfig();
        if (currentConfig) {
          // ETag y sello remoto son del gist ANTERIOR: se descartan.
          saveSocialSyncConfig({ ...currentConfig, gistId: result.gistId, etag: result.etag, lastRemoteUpdatedAt: 0 });
        }
        setSocialCfgGistId(result.gistId);
        setSocialCfgEtag(result.etag);
        // El canal nuevo ya es secreto: se sella su id para que la próxima apertura no vuelva a listar los gists.
        void patchLocalMeta({ socialChannelPrivateFor: result.gistId }).catch(() => {});
        // RETIRADA DEL GIST ANTIGUO. Es lo único que quita de circulación lo ya publicado: si se quedara, seguiría
        // siendo público e indexable para siempre. Se hace AL FINAL y con verificación previa, en este orden:
        // clonar → repuntar las tres referencias (arriba) → comprobar que el clon tiene el contenido → borrar.
        // Invertirlo dejaría al usuario apuntando a un gist inexistente si algo fallara a media faena.
        void (async () => {
          // Las referencias se repuntan AQUÍ y se ESPERAN, antes de borrar nada. Antes se dejaba que el efecto de
          // saneado de amistades corriera por su cuenta (rearmando su ref) mientras el borrado seguía adelante:
          // si el borrado ganaba la carrera, un amigo que hidratara en ese hueco leía un gist ya inexistente y se
          // quedaba sin su actividad —cacheada 30 minutos— hasta la siguiente rehidratación.
          //
          // Y si alguna NO se pudo repuntar, no se borra: el fallo cae en el `catch` de abajo, que conserva los dos
          // gists y avisa, igual que cuando el clon no convence. Tragárselo y seguir dejaba ese puntero —el de tus
          // otros dispositivos o el de tus amigos— en un gist que ya no existe; así apunta a uno que sigue vivo.
          await setPrivateConfig(owner.uid, { socialGistId: result.gistId });
          // `force`: aquí la garantía manda sobre el ahorro. Lo que viene después BORRA el gist antiguo, así que
          // un saneado que se saltara por huella dejaría a los amigos apuntando a un id que va a desaparecer.
          await healOwnFriendshipIdentity(owner.uid, {
            name: profileName.trim(),
            photo: ownPublishablePhoto,
            socialGistId: result.gistId,
            gamesGistId: mainSyncConfig?.gistId || '',
          }, { force: true });
          // Ya está repuntado. Antes había que decírselo al efecto de saneado poniéndole su `ref` a mano; ahora
          // no hace falta: el saneado con `force` deja escrita la huella nueva, así que la tarea de arranque la
          // encuentra al día y no repite nada.

          const copied = await socialGistHasContent(token, result.gistId, result.copiedEntries);
          if (!copied) {
            // El clon no tiene lo que debía: NO se borra el original. Mejor dos gists que ninguno.
            setFeedback('warn', SOCIAL_UI.status.socialGistMigratedKept);
            return;
          }
          // Se retiran TODOS los públicos superados, no solo el de la sesión: con deriva puede haber dos, y dejar
          // el que tiene las reseñas expuesto sería no haber arreglado nada.
          const results = await Promise.all(
            result.supersededGistIds.map((id) => deleteGist(token, id).catch(() => false)),
          );
          const allDeleted = results.every(Boolean);
          // Un público con contenido que NO se copió no se borra: se avisa para que decida su dueño.
          if (result.keptPublicGistIds.length > 0 || !allDeleted) {
            setFeedback('warn', SOCIAL_UI.status.socialGistMigratedKept);
            return;
          }
          setFeedback('ok', SOCIAL_UI.status.socialGistMigrated);
        })().catch(() => {
          // Esta cadena corre suelta (`void`), así que sin este catch cualquier fallo suyo —la verificación del
          // clon o el borrado, que van contra la red— se convertía en un rechazo NO CAPTURADO: en el navegador
          // acaba en la consola y en el manejador global de errores, y no en el aviso que le toca. Lo que ya está
          // hecho no se deshace (el canal nuevo está creado y repuntado), así que el estado seguro es el mismo que
          // cuando la verificación no convence: se conservan los dos gists y se avisa.
          setFeedback('warn', SOCIAL_UI.status.socialGistMigratedKept);
        });
      })
      .catch(() => {
        // Best-effort: si falla (red, rate-limit), se reintenta en la próxima sesión. Nada queda a medias: o se
        // creó el gist nuevo y se repuntó todo, o no se tocó nada.
        secretMigrationRef.current = false;
      });
    }

    // El desmontaje del hub cancela la cadena: sin esto, cerrar el espacio social mientras la lectura de
    // `LocalMeta` está en vuelo dejaba que la migración siguiera su curso contra un componente ya desmontado.
    return () => {
      cancelled = true;
    };
    // Se depende de `authUser?.uid` y NO del objeto `authUser` entero, que es lo que pide ESLint: Firebase
    // entrega una instancia nueva en cada refresco de token, así que con el objeto esta migración se relanzaría
    // sola cada hora sin que haya cambiado de usuario. Lo que decide aquí es la identidad, y esa es el uid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socialSpaceOpen, authUser?.uid, socialCfgGistId, mainSyncConfig?.token, setFeedback, profileName, ownPublishablePhoto, mainSyncConfig?.gistId]);
}
