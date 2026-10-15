/**
 * LAS CUENTAS DE FIREBASE AUTH para el panel (ver `functions/api/admin/accounts.ts` y docs/plan-cuentas-inactivas.md):
 * quién entró con Google, si tiene perfil y cuándo usó la app por última vez, y el borrado de las caducadas. Módulo
 * aparte por el mismo motivo que `adminHealthRepository`: solo lo usa el panel, que es un chunk perezoso.
 */
import { shareAuthHeaders } from './shareRepository';

/** Una cuenta de Auth cruzada con Firestore. Las fechas en milisegundos; 0 = no consta. */
export interface AdminAccount {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  createdAt: number;
  authLastUsedAt: number;
  /** `social`: espacio social activo; `suspended`: perfil con él apagado; `null`: solo entró con Google. */
  profile: 'social' | 'suspended' | null;
  profileUpdatedAt: number;
  hasBallot: boolean;
  premiosParticipant: boolean;
  admin: boolean;
  disabled: boolean;
}

export interface AdminAccountCensus {
  fetchedAt: number;
  accounts: AdminAccount[];
  orphanProfiles: number;
}

export type AdminAccountsLoad =
  | { status: 'ok'; census: AdminAccountCensus }
  /** Falta la cuenta de servicio en Pages: el panel explica cómo conectarla. */
  | { status: 'not-configured' }
  /** Google rechazó la petición: la cuenta de servicio está mal configurada (clave revocada, rol que falta). */
  | { status: 'failed'; message: string }
  /** El endpoint no respondió (en desarrollo no existe: lo sirve Pages). */
  | { status: 'unreachable' };

/**
 * Cuántas cuentas se mandan por petición al borrar. Va a la par con `PURGE_BATCH_MAX` del servidor
 * (`functions/api/admin/accounts.ts`), que lo fija el tope de subpeticiones de Workers Free; un test lo comprueba.
 */
export const PURGE_CHUNK = 3;

export type AdminPurgeResult =
  | { uid: string; outcome: 'deleted' }
  | { uid: string; outcome: 'skipped'; reason: 'not-found' | 'not-expired' }
  | { uid: string; outcome: 'failed'; failures: string[] }
  | { uid: string; outcome: 'pending' };

const text = (value: unknown, max = 300) => (typeof value === 'string' ? value.slice(0, max) : '');
const millis = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

/** Lo que venga raro del servidor no se pinta: una cuenta sin uid sobra. */
export function sanitizeAccountCensus(raw: unknown): AdminAccountCensus | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as { fetchedAt?: unknown; accounts?: unknown; orphanProfiles?: unknown };
  if (!Array.isArray(data.accounts)) return null;
  const accounts = data.accounts.flatMap((entry): AdminAccount[] => {
    const row = (entry || {}) as Record<string, unknown>;
    const uid = text(row.uid, 128);
    if (!uid) return [];
    return [{
      uid,
      email: text(row.email, 320),
      displayName: text(row.displayName, 200),
      photoURL: text(row.photoURL, 2000),
      createdAt: millis(row.createdAt),
      authLastUsedAt: millis(row.authLastUsedAt),
      profile: row.profile === 'social' || row.profile === 'suspended' ? row.profile : null,
      profileUpdatedAt: millis(row.profileUpdatedAt),
      hasBallot: row.hasBallot === true,
      premiosParticipant: row.premiosParticipant === true,
      admin: row.admin === true,
      disabled: row.disabled === true,
    }];
  });
  return { fetchedAt: millis(data.fetchedAt) || Date.now(), accounts, orphanProfiles: millis(data.orphanProfiles) };
}

export async function loadAdminAccounts(): Promise<AdminAccountsLoad> {
  try {
    const headers = await shareAuthHeaders(() => new Error('sin sesión'));
    const response = await fetch('/api/admin/accounts', { headers });
    if (response.status === 502) {
      const body = (await response.json().catch(() => null)) as { google?: unknown; error?: unknown } | null;
      if (body?.google === true) return { status: 'failed', message: text(body.error, 200) };
    }
    if (!response.ok) return { status: 'unreachable' };
    const body = (await response.json()) as { configured?: unknown };
    if (body.configured === false) return { status: 'not-configured' };
    const census = sanitizeAccountCensus(body);
    return census ? { status: 'ok', census } : { status: 'unreachable' };
  } catch {
    return { status: 'unreachable' };
  }
}

/** Borra esas cuentas. El servidor solo borra las que siguen caducadas; el resto vuelve como `skipped`. Lanza si falla la petición. */
export async function purgeAdminAccounts(uids: readonly string[]): Promise<AdminPurgeResult[]> {
  const headers = await shareAuthHeaders(() => new Error('sin sesión'));
  const response = await fetch('/api/admin/accounts', { method: 'POST', headers, body: JSON.stringify({ uids }) });
  if (!response.ok) throw new Error(`respuesta ${response.status}`);
  const body = (await response.json()) as { results?: unknown };
  if (!Array.isArray(body.results)) throw new Error('respuesta sin resultados');
  return body.results.flatMap((entry): AdminPurgeResult[] => {
    const row = (entry || {}) as Record<string, unknown>;
    const uid = text(row.uid, 128);
    if (!uid) return [];
    if (row.outcome === 'deleted' || row.outcome === 'pending') return [{ uid, outcome: row.outcome }];
    if (row.outcome === 'skipped') return [{ uid, outcome: 'skipped', reason: row.reason === 'not-found' ? 'not-found' : 'not-expired' }];
    const failures = Array.isArray(row.failures) ? row.failures.map((value) => text(value)).filter(Boolean) : [];
    return [{ uid, outcome: 'failed', failures }];
  });
}
