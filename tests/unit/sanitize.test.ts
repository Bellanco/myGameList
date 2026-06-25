import { describe, expect, it } from 'vitest';
import { isValidGistId, isValidGithubToken, isValidHttpUrl, isValidYear, normalizeTag, safePostText, safeTrim } from '../../src/core/security/sanitize';

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

  it('valida URLs http/https y rechaza esquemas peligrosos (anti-XSS de posts)', () => {
    expect(isValidHttpUrl('https://example.com/path?q=1')).toBe(true);
    expect(isValidHttpUrl('http://example.com')).toBe(true);
    // Esquemas peligrosos o no http: deben rechazarse.
    expect(isValidHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isValidHttpUrl('data:text/html,<script>1</script>')).toBe(false);
    expect(isValidHttpUrl('ftp://example.com')).toBe(false);
    // No absolutas / basura.
    expect(isValidHttpUrl('example.com')).toBe(false);
    expect(isValidHttpUrl('/relative')).toBe(false);
    expect(isValidHttpUrl('')).toBe(false);
    expect(isValidHttpUrl(null)).toBe(false);
  });

  it('recorta y cota el texto de una publicación', () => {
    expect(safePostText('  hola  ')).toBe('hola');
    expect(safePostText('a'.repeat(2000)).length).toBe(1000);
  });
});
