// CUÁNTO SE CONSERVA UNA CUENTA SIN USO (docs/plan-cuentas-inactivas.md).
//
// Firebase Auth guarda a todo el que ha pulsado «Entrar con Google» —correo, nombre y foto—, haya llegado o no a
// crear su espacio social, y hasta ahora no lo borraba nadie: ni la baja de cuenta ni el panel. Estas son las
// reglas con las que el panel decide qué cuentas han caducado y el servidor las borra (`/api/admin/accounts`):
//
//   - SIN PERFIL (solo entró con Google): dos meses sin abrir la app con la sesión iniciada.
//   - CON PERFIL (espacio social, activo o suspendido): un año.
//   - Quien votó en los premios cuenta como con perfil aunque no lo tenga: la edición es anual y su historial va
//     por su uid; con dos meses se le borraría entre una edición y la siguiente.
//   - Nunca caducan: el administrador y quien tiene una papeleta en curso.
//
// El plazo cuenta desde el ÚLTIMO USO, no desde el alta (decisión del usuario, 15-10-2026): quien usa la app a
// diario sin espacio social no se borra nunca.
//
// Puro y sin dependencias: lo importan tanto el panel como las Pages Functions (que solo pueden importar del bundle
// módulos sin dependencias, ver `functions/_lib/http.ts`).

const DAY_MS = 24 * 60 * 60 * 1000;

/** Sin perfil: dos meses. */
export const NO_PROFILE_RETENTION_MS = 60 * DAY_MS;
/** Con perfil (o con participación en los premios): un año. */
export const PROFILE_RETENTION_MS = 365 * DAY_MS;
/** Cuándo empieza a avisarse de que una cuenta va a caducar: el panel la enseña para avisar a mano. */
export const EXPIRING_NOTICE_MS = 30 * DAY_MS;

/** Lo que se sabe de una cuenta para decidir si caduca. Las fechas, en milisegundos; 0 = no consta. */
export interface RetentionFacts {
  /** Alta en Firebase Auth. */
  createdAt: number;
  /** Último uso según Firebase Auth: la última renovación de la sesión (o el último inicio, si no consta). */
  authLastUsedAt: number;
  /** Si tiene documento en `profiles`. */
  hasProfile: boolean;
  /** `profiles.updatedAt`, que el cliente toca una vez al día mientras se usa. 0 sin perfil. */
  profileUpdatedAt: number;
  /** Tiene una papeleta de los premios en curso (`premiosBallots/{uid}`). */
  hasBallot: boolean;
  /** Figura en el registro de votantes o de trofeos de alguna edición publicada. */
  premiosParticipant: boolean;
  /** Tiene el custom claim de administrador. */
  admin: boolean;
}

export type RetentionRule = 'no-profile' | 'profile';
export type RetentionState = 'active' | 'expiring' | 'expired' | 'protected';
export type RetentionProtection = 'admin' | 'ballot';

export interface RetentionVerdict {
  rule: RetentionRule;
  state: RetentionState;
  /** La fecha que cuenta como último uso: la más reciente de las que constan (o el alta). */
  lastUsedAt: number;
  /** Cuándo caduca (o caducó). 0 si está protegida. */
  expiresAt: number;
  protection?: RetentionProtection;
}

/** Una cuenta tal como la cuentan el servidor y el panel (`AccountRow` / `AdminAccount`), en lo que importa aquí. */
export interface RetentionAccount {
  createdAt: number;
  authLastUsedAt: number;
  profile: 'social' | 'suspended' | null;
  profileUpdatedAt: number;
  hasBallot: boolean;
  premiosParticipant: boolean;
  admin: boolean;
}

/** Los datos de caducidad de una cuenta. Un perfil suspendido sigue siendo un perfil: cuenta con el plazo de un año. */
export function retentionFactsOf(account: RetentionAccount): RetentionFacts {
  return {
    createdAt: account.createdAt,
    authLastUsedAt: account.authLastUsedAt,
    hasProfile: account.profile !== null,
    profileUpdatedAt: account.profileUpdatedAt,
    hasBallot: account.hasBallot,
    premiosParticipant: account.premiosParticipant,
    admin: account.admin,
  };
}

/** El último uso: la fecha más reciente que conste. Sin ninguna, el alta (una cuenta sin uso cuenta desde que nació). */
export function lastUseOf(facts: Pick<RetentionFacts, 'createdAt' | 'authLastUsedAt' | 'profileUpdatedAt'>): number {
  return Math.max(facts.authLastUsedAt || 0, facts.profileUpdatedAt || 0, facts.createdAt || 0);
}

/**
 * Decide si una cuenta está activa, a punto de caducar, caducada o protegida.
 *
 * Una cuenta sin NINGUNA fecha (ni alta) no se da por caducada: sin dato no se borra nada.
 */
export function judgeRetention(facts: RetentionFacts, now: number): RetentionVerdict {
  const rule: RetentionRule = facts.hasProfile || facts.premiosParticipant ? 'profile' : 'no-profile';
  const lastUsedAt = lastUseOf(facts);
  if (facts.admin) return { rule, state: 'protected', lastUsedAt, expiresAt: 0, protection: 'admin' };
  if (facts.hasBallot) return { rule, state: 'protected', lastUsedAt, expiresAt: 0, protection: 'ballot' };
  if (!(lastUsedAt > 0)) return { rule, state: 'active', lastUsedAt: 0, expiresAt: 0 };

  const expiresAt = lastUsedAt + (rule === 'profile' ? PROFILE_RETENTION_MS : NO_PROFILE_RETENTION_MS);
  const state: RetentionState = expiresAt <= now ? 'expired' : expiresAt - now <= EXPIRING_NOTICE_MS ? 'expiring' : 'active';
  return { rule, state, lastUsedAt, expiresAt };
}
