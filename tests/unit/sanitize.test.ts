import { describe, expect, it } from 'vitest';
import { isValidGistId, isValidGithubToken, isValidYear, normalizeTag, safeTrim } from '../../src/core/security/sanitize';

describe('sanitize', () => {
  it('trims and clamps safe text', () => {
    expect(safeTrim('  hola  ')).toBe('hola');
    expect(safeTrim('a'.repeat(20), 5)).toBe('aaaaa');
  });

  it('normalizes tags', () => {
    expect(normalizeTag('  action   rpg  ')).toBe('action rpg');
  });

  it('validates years', () => {
    expect(isValidYear('2024')).toBe(true);
    expect(isValidYear('99')).toBe(false);
  });

  it('validates github token and gist id', () => {
    expect(isValidGithubToken('ghp_1234567890123456789012345')).toBe(true);
    expect(isValidGithubToken('invalid')).toBe(false);

    expect(isValidGistId('abcdef123456')).toBe(true);
    expect(isValidGistId('bad id')).toBe(false);
  });
});
