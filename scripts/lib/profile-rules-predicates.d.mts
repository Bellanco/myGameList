/**
 * Tipos de los predicados de la auditoría. Se escriben a mano porque el módulo es `.mjs` (lo ejecuta Node
 * directamente, sin compilación) y TypeScript necesita saber su forma para poder typechequear el test que los usa.
 */

/** Un motivo por el que las reglas rechazarían el documento. `nuevo` distingue la validación C7 de lo ya vigente. */
export interface AuditFinding {
  nuevo: boolean;
  motivo: string;
}

/** Límites de longitud, los mismos que exigen las reglas. */
export declare const LIMITS: {
  profileId: number;
  displayName: number;
  email: number;
  photoURL: number;
  etag: number;
  gistId: number;
};

/** Motivos por los que las reglas rechazarían una escritura sobre este perfil. Vacío = pasa. */
export declare function auditProfile(data: Record<string, unknown>): AuditFinding[];

/** Igual, para los campos denormalizados de un documento de amistad. */
export declare function auditFriendship(data: Record<string, unknown>): AuditFinding[];
