// Panel de administración: censo de usuarios y acciones de moderación sobre `profiles` / `friendships`.
//
// TODO lo que hay aquí lo autoriza `isAdmin()` en firestore.rules (mismo correo + email verificado). Para
// cualquier otra sesión, cada función de este módulo responde `permission-denied`: el módulo no concede nada por
// sí mismo, solo habla con Firestore como el resto de repositorios.
//
// Lo que este módulo NO puede hacer, y es intencionado: `privateConfig`, `publicConfig` y `userMap` son
// owner-only en las reglas (ahí vive el token cifrado del usuario), así que el admin ni los lee ni los borra.
// El borrado de un usuario desde aquí es, por tanto, PARCIAL — ver `deleteUserProfile`.
//
// PRIVACIDAD: del `email` legacy que arrastran los perfiles antiguos solo se expone si EXISTE, nunca su valor.
// Para purgarlo no hace falta leerlo, y no tiene sentido volver a pasear PII por el cliente para enseñarla en una
// tabla. Lo mismo con el id del gist de juegos y con el token en claro legacy.
//
// ESTE FICHERO ES UNA FACHADA. Llegó a 1.038 líneas con cuatro áreas dentro —censo, moderación, cutover y
// borrado—, así que abrirlo para tocar una obligaba a hojear las otras tres. Ahora cada una vive en `admin/` y
// aquí solo queda el punto de entrada, para que `useAdminViewModel` y los tests sigan importando de un sitio:
//
//   admin/adminShared.ts      centinela, umbrales, forma del resultado y ayudantes de acceso
//   admin/adminCensus.ts      la tabla de usuarios y sus señales — lo único que solo LEE
//   admin/adminModeration.ts  las acciones sobre un usuario concreto
//   admin/adminCutover.ts     cutover de identidad y borrado: las dos más destructivas
export {
  ADMIN_PROFILES_LIMIT,
  loadAdminCensus,
  type AdminCensus,
  type AdminUserRow,
} from './admin/adminCensus';

export { FOSSIL_PENDING_MS, type AdminActionResult, type LegacyProfileField } from './admin/adminShared';

export {
  healUserFriendshipIdentity,
  purgeFossilFriendshipRequests,
  purgeLegacyProfileFields,
  setUserDisplayName,
  setUserSocialEnabled,
  setUserTier,
  type AdminFriendshipSweepResult,
} from './admin/adminModeration';

export {
  deleteUserProfile,
  migrateForeignProfileDoc,
  type IdentityCutoverOutcome,
  type IdentityCutoverResult,
} from './admin/adminCutover';
