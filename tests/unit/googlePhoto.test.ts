// El avatar genérico de Google (el monograma con la inicial) no es una foto, aunque tenga URL y cargue bien.
//
// ALCANCE DE ESTE ARCHIVO: solo lo que se decide MIRANDO LA URL. Comprobar las otras dos cribas —el formato y el
// recuento de colores— exigiría traer aquí URLs de avatares de usuarios reales, y esas no entran en el repositorio.
// Lo que sí queda cubierto de ese camino es su efecto visible, en `tests/component/HubAvatar.test.tsx`, con URLs
// inventadas y la respuesta simulada.
import { describe, expect, it } from 'vitest';
import { getKnownPhotoVerdict, isKnownDefaultPhotoURL } from '../../src/core/social/googlePhoto';

describe('isKnownDefaultPhotoURL', () => {
  // Los defaults ANTERIORES al monograma sí se reconocen por la URL, sin pedir nada al servidor.
  it('reconoce los avatares por defecto que se delatan en la URL', () => {
    expect(isKnownDefaultPhotoURL('https://lh3.googleusercontent.com/a/default-user=s96-c')).toBe(true);
    expect(isKnownDefaultPhotoURL('https://ssl.gstatic.com/accounts/ui/avatar_2x.png')).toBe(true);
  });

  it('no tener foto es el caso extremo de no tener foto', () => {
    expect(isKnownDefaultPhotoURL('')).toBe(true);
    expect(isKnownDefaultPhotoURL(null)).toBe(true);
    expect(isKnownDefaultPhotoURL(undefined)).toBe(true);
    expect(isKnownDefaultPhotoURL('   ')).toBe(true);
  });

  // El motivo de que haga falta mirar la imagen: el monograma que Google genera hoy comparte host, prefijo y sufijo
  // de tamaño con una foto subida por su dueño. Por la URL son la misma cosa.
  it('el monograma actual NO se distingue por la URL', () => {
    expect(isKnownDefaultPhotoURL('https://lh3.googleusercontent.com/a/ACg8ocEJEMPLO=s96-c')).toBe(false);
  });
});

describe('getKnownPhotoVerdict', () => {
  it('lo que se sabe por la URL no necesita comprobación', () => {
    expect(getKnownPhotoVerdict('')).toBe(true);
    expect(getKnownPhotoVerdict('https://lh3.googleusercontent.com/a/default-user=s96-c')).toBe(true);
  });

  // Sin veredicto no se inventa uno: es lo que deja a los saneos esperar en vez de sellar una URL sin mirarla.
  it('sin veredicto responde "no se sabe", no "no es genérica"', () => {
    expect(getKnownPhotoVerdict('https://lh3.googleusercontent.com/a/ACg8ocEJEMPLO=s96-c')).toBeUndefined();
  });
});
