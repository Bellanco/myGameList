// AL CERRAR SESIÓN, LO DE LOS DEMÁS SE VA DEL DISPOSITIVO.
//
// Mientras hay sesión, el espacio social guarda en este navegador datos que no son tuyos: los listados de tus
// amistades —en crudo, con las listas que esconden, sus notas y sus horas—, tus amistades con sus ids de gist (que
// son la llave de sus bibliotecas), el directorio y los perfiles leídos. SECURITY.md recomienda cerrar sesión en un
// navegador compartido, y eso solo protege si al cerrarla no se queda todo ahí para quien venga después
// (09-10-2026). Lo propio —tus juegos, tu configuración de sincronización— no se toca: es tuyo y la app lo
// necesita sin sesión de Google.
import { invalidateMyFriendshipsCache } from './firebaseFriendshipRepository';
import { invalidateOwnProfileCache, invalidateProfileByEmailCache, invalidateSocialDirectoryCache } from './firebaseSocialRepository';
import { clearProfileCacheStore } from './indexedDbRepository';
import { invalidateMySharesCache } from './shareRepository';
import { forgetSocialGistSessionCache } from './socialGistRepository';

/** Borra de memoria y de IndexedDB lo que el espacio social guardó de otras personas. Best-effort: nunca lanza. */
export async function forgetSocialDataOnDevice(): Promise<void> {
  invalidateMyFriendshipsCache();
  invalidateSocialDirectoryCache();
  invalidateOwnProfileCache();
  invalidateProfileByEmailCache();
  invalidateMySharesCache();
  forgetSocialGistSessionCache();
  await clearProfileCacheStore().catch(() => {
    /* Sin IndexedDB (modo privado estricto) no hay nada guardado que borrar. */
  });
}
