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
  return /^(ghp_|github_pat_)[A-Za-z0-9_]{20,}$/.test(token);
}

export function isValidGistId(gistId: string): boolean {
  return /^[a-fA-F0-9]{8,}$/.test(gistId);
}

export function toSafeNumber(input: unknown): number | null {
  const n = Number(input);
  return Number.isFinite(n) ? n : null;
}
