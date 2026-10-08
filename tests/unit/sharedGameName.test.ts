// El nombre del juego que llega por el menú «Compartir» de Android (`share_target`). Cada aplicación lo manda
// envuelto a su manera, y lo que se protege aquí es que el formulario se abra con el NOMBRE y no con el envoltorio.
import { describe, it, expect } from 'vitest';
import { sharedGameName } from '../../src/core/import/sharedGameName';

const STEAM = 'https://store.steampowered.com/app/1145360/Hades/';

describe('el nombre de un juego compartido', () => {
  it.each([
    ['la oferta de la app de Steam', { text: `Save 50% on Hades on Steam ${STEAM}` }],
    ['la oferta de la app de Steam en castellano', { text: `Ahorra un 50 % en Hades en Steam ${STEAM}` }],
    ['el título de la ficha de Steam en Chrome', { title: 'Hades on Steam', url: STEAM }],
    ['el mismo título en castellano', { title: 'Hades en Steam', url: STEAM }],
    ['Wikipedia en inglés', { title: 'Hades (video game) - Wikipedia', url: 'https://en.wikipedia.org/wiki/Hades_(video_game)' }],
    ['Wikipedia en castellano', { title: 'Hades (videojuego) - Wikipedia, la enciclopedia libre' }],
    ['el nombre a secas', { text: 'Hades' }],
    ['entre comillas', { text: '«Hades»' }],
    ['con la dirección en otra línea', { text: 'Hades\nhttps://example.com/hades' }],
  ])('%s', (_caso, payload) => {
    expect(sharedGameName(payload)).toBe('Hades');
  });

  it('no corta un guion que es parte del nombre', () => {
    expect(sharedGameName({ text: 'Lost Planet - Extreme Condition' })).toBe('Lost Planet - Extreme Condition');
  });

  it('con solo la dirección de la tienda de Steam, saca el nombre de ella', () => {
    expect(sharedGameName({ url: 'https://store.steampowered.com/app/367520/Hollow_Knight/' })).toBe('Hollow Knight');
    expect(sharedGameName({ text: 'https://store.steampowered.com/app/367520/Hollow_Knight/?snr=1_5_9__205' })).toBe(
      'Hollow Knight',
    );
  });

  it('el título manda sobre el texto', () => {
    expect(sharedGameName({ title: 'Celeste', text: 'Mira este juego' })).toBe('Celeste');
  });

  it('sin nada aprovechable devuelve null', () => {
    expect(sharedGameName({})).toBeNull();
    expect(sharedGameName({ title: '   ', text: '' })).toBeNull();
    expect(sharedGameName({ url: 'https://example.com/algo' })).toBeNull();
  });
});
