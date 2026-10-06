import { describe, expect, it } from 'vitest';
import { resolveAuthorName } from '../../src/core/social/authorName';

describe('resolveAuthorName', () => {
  it('lo normal: manda el nombre del gist, que es donde lo escribe su dueño', () => {
    expect(resolveAuthorName({ displayName: 'Copia' }, 'Nick')).toBe('Nick');
  });

  it('sin nombre en el gist, el de Firestore', () => {
    expect(resolveAuthorName({ displayName: 'Copia' }, '')).toBe('Copia');
    expect(resolveAuthorName({ displayName: 'Copia' }, undefined)).toBe('Copia');
  });

  // El elegido en los premios aún no ha llegado al gist: el del gist es el ANTERIOR.
  it('con un nombre de los premios pendiente, manda el de Firestore', () => {
    expect(resolveAuthorName({ displayName: 'Nuevo', namePending: true }, 'Anterior')).toBe('Nuevo');
  });

  it('una marca sin nombre no deja el perfil en blanco', () => {
    expect(resolveAuthorName({ displayName: '', namePending: true }, 'Anterior')).toBe('Anterior');
  });
});
