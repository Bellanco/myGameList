import { describe, expect, it } from 'vitest';
import { POST_MAX_LENGTH, isValidGistId, isValidGithubToken, isValidHttpUrl, isValidYear, normalizeTag, safePostText, safeTrim } from '../../src/core/security/sanitize';

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

  // La longitud de una publicación la decide el RANGO de quien publica, así que el saneador ya no impone un
  // límite único: recibe el cupo. Sin cupo (p. ej. al LEER un post ajeno) rige el techo absoluto.
  it('recorta el texto de una publicación y respeta el cupo recibido', () => {
    expect(safePostText('  hola  ')).toBe('hola');
    expect(safePostText('a'.repeat(2000), 1_000).length).toBe(1_000);
    expect(safePostText('a'.repeat(2000), 10_000).length).toBe(2_000);
  });

  it('un cupo de 0 (rango bronce) deja el texto vacío, que aguas abajo es un no-op', () => {
    expect(safePostText('hola', 0)).toBe('');
  });

  it('el techo absoluto manda sobre cualquier cupo mayor o negativo', () => {
    expect(safePostText('a'.repeat(POST_MAX_LENGTH + 500), POST_MAX_LENGTH + 500).length).toBe(POST_MAX_LENGTH);
    expect(safePostText('hola', -10)).toBe('');
  });
});
