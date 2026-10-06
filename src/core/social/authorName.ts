/**
 * EL NOMBRE DE UN PERFIL AL HIDRATARLO desde su gist social.
 *
 * Lo normal es que mande el del gist (`profile.name`): es donde lo escribe su dueño, y el `displayName` de
 * Firestore es una copia. La excepción es un nombre elegido en la papeleta de los premios (`namePending`): se
 * guarda en Firestore porque desde allí puede no estar el token de GitHub, y hasta que el dueño abra el hub en un
 * dispositivo que lo tenga, el gist sigue con el ANTERIOR. Ahí manda Firestore.
 */
export function resolveAuthorName(
  entry: { displayName: string; namePending?: boolean },
  gistName: string | undefined,
): string {
  if (entry.namePending && entry.displayName) return entry.displayName;
  return gistName || entry.displayName;
}
