// Moderación de enlaces compartidos, para el panel `/admin`.
//
// Quién puede llamar a esto NO lo decide este fichero: lo decide la Pages Function, comprobando en el ID token
// verificado que el correo es el del administrador y está verificado — el mismo criterio que `firestore.rules`.
// Aquí no hay ninguna comprobación de permisos porque cualquiera que hiciera aquí una sería cosmética.
import { initializeFirebaseServices } from './firebaseGateway';
import type { ShareBan } from '../types/share';
import type { ShareQuotaOverride } from '../../core/constants/tiers';

const API_BASE = '/api/share';

export interface AdminShareRow {
  uid: string;
  token: string;
  gameId: number;
  gameName: string;
  createdAt: number;
  expiresAt: number;
}

async function adminHeaders(): Promise<Record<string, string>> {
  const services = await initializeFirebaseServices();
  await services?.auth.authStateReady();
  const user = services?.auth.currentUser;
  if (!user) {
    throw new Error('Sin sesión');
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await user.getIdToken()}`,
    'Content-Type': 'application/json',
  };
  const { getAppCheckToken } = await import('./appCheckRepository');
  const appCheck = await getAppCheckToken();
  if (appCheck) {
    headers['X-Firebase-AppCheck'] = appCheck;
  }
  return headers;
}

async function call(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers: await adminHeaders() });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(body.error || 'La operación no se ha completado'));
  }
  return body;
}

/** Censo de enlaces, paginado por cursor. `uid` filtra por autor, que es lo que se usa al atender un aviso. */
export async function listAllShares(options: { cursor?: string; uid?: string } = {}): Promise<{
  shares: AdminShareRow[];
  cursor: string | null;
  complete: boolean;
}> {
  const params = new URLSearchParams();
  if (options.cursor) {
    params.set('cursor', options.cursor);
  }
  if (options.uid) {
    params.set('uid', options.uid);
  }
  const query = params.toString();
  const body = await call(`/all${query ? `?${query}` : ''}`);
  return {
    shares: (body.shares as AdminShareRow[]) || [],
    cursor: (body.cursor as string | null) ?? null,
    complete: Boolean(body.complete),
  };
}

/** Retira un enlace concreto. */
export async function adminRemoveShare(token: string): Promise<void> {
  await call(`/${encodeURIComponent(token)}`, { method: 'DELETE' });
}

/** Veta a un usuario. Con `purge`, retira además lo que ya tenga publicado. */
export async function banUser(uid: string, options: { reason?: string; purge?: boolean } = {}): Promise<number> {
  const body = await call(`/ban/${encodeURIComponent(uid)}`, {
    method: 'POST',
    body: JSON.stringify({ reason: options.reason || '', purge: Boolean(options.purge) }),
  });
  return Number(body.purged) || 0;
}

export async function unbanUser(uid: string): Promise<void> {
  await call(`/ban/${encodeURIComponent(uid)}`, { method: 'DELETE' });
}

export async function readBan(uid: string): Promise<ShareBan | null> {
  const body = await call(`/ban/${encodeURIComponent(uid)}`);
  return (body.ban as ShareBan | null) ?? null;
}

/** Ajusta la cuota de un usuario. Los dos campos son opcionales e independientes. */
export async function setQuotaOverride(uid: string, override: ShareQuotaOverride & { reason?: string }): Promise<void> {
  await call(`/quota/${encodeURIComponent(uid)}`, { method: 'POST', body: JSON.stringify(override) });
}

/** Vuelve a la cuota que da el rango. */
export async function clearQuotaOverride(uid: string): Promise<void> {
  await call(`/quota/${encodeURIComponent(uid)}`, { method: 'DELETE' });
}

export async function readQuotaOverride(uid: string): Promise<ShareQuotaOverride | null> {
  const body = await call(`/quota/${encodeURIComponent(uid)}`);
  return (body.override as ShareQuotaOverride | null) ?? null;
}
