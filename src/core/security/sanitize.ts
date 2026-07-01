const MAX_TEXT_LENGTH = 5000;

export function safeTrim(input: unknown, maxLength = MAX_TEXT_LENGTH): string {
  return String(input ?? '').trim().slice(0, maxLength);
}

export function normalizeTag(input: unknown): string {
  return safeTrim(input, 80).replace(/\s+/g, ' ');
}

export function isValidYear(value: string): boolean {
  return /^\d{4}$/.test(value);
}

export function isValidGithubToken(token: string): boolean {
  // ghp_ / github_pat_ = tokens personales (PAT); gho_ = token de una GitHub OAuth App (flujo "Conectar con GitHub").
  return /^(ghp_|gho_|github_pat_)[A-Za-z0-9_]{20,}$/.test(token);
}

export function isValidGistId(gistId: string): boolean {
  return /^[a-fA-F0-9]{8,}$/.test(gistId);
}

// F3 — publicaciones del feed social (texto libre + hipervínculos). Post corto tipo "estado".
export const POST_MAX_LENGTH = 280;

/** Texto de una publicación: recorta espacios y cota la longitud. No interpreta HTML (se renderiza como texto). */
export function safePostText(input: unknown): string {
  return safeTrim(input, POST_MAX_LENGTH);
}

/**
 * Solo URLs http(s) absolutas son válidas para renderizar como enlace. Rechaza `javascript:`, `data:`, etc.
 * Es la frontera anti-XSS al "linkificar" el texto de las publicaciones.
 */
export function isValidHttpUrl(value: unknown): boolean {
  let url: URL;
  try {
    url = new URL(String(value ?? ''));
  } catch {
    return false;
  }
  return url.protocol === 'http:' || url.protocol === 'https:';
}
