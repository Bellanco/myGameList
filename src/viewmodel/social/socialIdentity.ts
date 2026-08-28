/**
 * Identidad del usuario dentro del canal social.
 *
 * Vive aparte del ViewModel porque la necesitan tanto el compositor como el hook del directorio; dejarla en el
 * primero obligaría al segundo a importar de vuelta, y serían dos módulos importándose entre sí por una función.
 */
/**
 * P1 (privacidad index-only): ¿la entrada de perfil/directorio (`entryId`) es la del usuario actual?
 * Compara por IDENTIDAD (uid o profileId), no por `email` — que sale del documento público en el refactor
 * index-only (ST1). Tolera ambas eras sin tocar este código en el cutover: hoy el id del doc es el `uid`; tras
 * el corte index-only será el `profileId`. Ambos se comprueban.
 */
export function isOwnProfileIdentity(
  entryId: string | null | undefined,
  uid: string | null | undefined,
  ownProfileId: string | null | undefined,
): boolean {
  if (!entryId) return false;
  return (Boolean(uid) && entryId === uid) || (Boolean(ownProfileId) && entryId === ownProfileId);
}
