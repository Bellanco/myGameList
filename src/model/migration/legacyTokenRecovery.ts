// LEGACY COMPAT — borrar tras migrar (ver .github/prompts/migration/MIGRATION-FORWARD-PLAN.md).
// Fallback de recuperación del token de GitHub para perfiles VIEJOS que aún lo guardan en claro en
// Firestore (`profiles.social.githubToken`). El modelo NUEVO lo guarda CIFRADO en `privateConfig`
// (recoverGithubToken). Una vez todos los perfiles re-guardados, este fallback se puede eliminar.

/** Devuelve el token en claro de un perfil legacy (vacío si no existe). */
export function readLegacyPlaintextToken(profile: { githubToken?: string } | null | undefined): string {
  return String(profile?.githubToken || '').trim();
}
