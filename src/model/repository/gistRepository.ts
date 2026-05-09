import { GIST_CFG_KEY } from '../../core/constants/storageKeys';
import { isValidGistId, isValidGithubToken } from '../../core/security/sanitize';
import { migrateData } from './migrateRepository';
import type { SyncConfig, TabData } from '../types/game';

const GIST_FILENAME = 'myGames.json';
const GIST_API_BASE = 'https://api.github.com/gists';

function getGithubAuthHeader(token: string): string {
  // GitHub REST examples use Bearer for PATs.
  return `Bearer ${token}`;
}

async function buildGithubError(response: Response, prefix: string): Promise<string> {
  const statusPart = `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;

  try {
    const payload = (await response.json()) as { message?: string; errors?: Array<{ message?: string }> };
    const apiMessage = payload?.message?.trim();
    const apiDetails = (payload?.errors || [])
      .map((entry) => entry?.message?.trim())
      .filter(Boolean)
      .join(', ');
    const details = [apiMessage, apiDetails].filter(Boolean).join(' | ');
    return details ? `${prefix}: ${statusPart} - ${details}` : `${prefix}: ${statusPart}`;
  } catch {
    return `${prefix}: ${statusPart}`;
  }
}

export interface GistReadResponse {
  notModified?: boolean;
  data?: TabData;
  etag?: string | null;
}

export function getSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(GIST_CFG_KEY);
    return raw ? (JSON.parse(raw) as SyncConfig) : null;
  } catch {
    return null;
  }
}

export function saveSyncConfig(config: SyncConfig): void {
  localStorage.setItem(GIST_CFG_KEY, JSON.stringify(config));
}

export function clearSyncConfig(): void {
  localStorage.removeItem(GIST_CFG_KEY);
}

export async function whoAmI(token: string): Promise<{ login: string }> {
  if (!isValidGithubToken(token)) {
    throw new Error('Formato de token inválido');
  }

  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: getGithubAuthHeader(token),
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    throw new Error(await buildGithubError(response, 'Auth failed'));
  }

  return (await response.json()) as { login: string };
}

export async function createGist(token: string): Promise<{ gistId: string; etag: string | null }> {
  const response = await fetch(GIST_API_BASE, {
    method: 'POST',
    headers: {
      Authorization: getGithubAuthHeader(token),
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      description: 'Mi Lista de Juegos - Sincronización',
      public: false,
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify({ c: [], v: [], e: [], p: [], deleted: [], updatedAt: Date.now() }),
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(await buildGithubError(response, 'Create failed'));
  }

  const body = (await response.json()) as { id: string };
  return { gistId: body.id, etag: response.headers.get('etag') };
}

export async function readGist(token: string, gistId: string, etag: string | null = null): Promise<GistReadResponse> {
  if (!isValidGistId(gistId)) {
    throw new Error('Gist ID inválido');
  }

  const headers: Record<string, string> = {
    Authorization: getGithubAuthHeader(token),
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (etag) {
    headers['If-None-Match'] = etag;
  }

  const response = await fetch(`${GIST_API_BASE}/${gistId}`, { headers });

  if (response.status === 304) {
    return { notModified: true };
  }

  if (!response.ok) {
    throw new Error(await buildGithubError(response, 'Read failed'));
  }

  const body = (await response.json()) as { files?: Record<string, { content: string }> };
  const raw = body.files?.[GIST_FILENAME]?.content;

  if (!raw) {
    throw new Error('Gist file not found');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON in Gist');
  }

  return {
    data: migrateData(parsed),
    etag: response.headers.get('etag'),
  };
}

export async function writeGist(token: string, gistId: string, payload: TabData): Promise<{ etag: string | null; updatedAt: number }> {
  if (!isValidGistId(gistId)) {
    throw new Error('Gist ID inválido');
  }

  const response = await fetch(`${GIST_API_BASE}/${gistId}`, {
    method: 'PATCH',
    headers: {
      Authorization: getGithubAuthHeader(token),
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(payload),
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(await buildGithubError(response, 'Write failed'));
  }

  const body = (await response.json()) as { updated_at?: string };
  return {
    etag: response.headers.get('etag'),
    updatedAt: body.updated_at ? Date.parse(body.updated_at) : Date.now(),
  };
}
