import { describe, expect, it } from 'vitest';
import { pickLiveSocialGist, type SocialGistEvidence } from '../../src/core/social/gistArbitration';

// El árbitro decide qué gist social es el canal VIVO cuando un usuario acabó con dos ids en circulación (el
// clonado de `updateGistPrivacy`). Lo usan el panel y el cliente del propio usuario, y tienen que decidir IGUAL:
// si no, cada uno escribiría el suyo y se pisarían en bucle.

function gist(gistId: string, over: Partial<SocialGistEvidence> = {}): SocialGistEvidence {
  return { gistId, isPublic: true, contentCount: 10, updatedAt: 1_000, ...over };
}

describe('pickLiveSocialGist', () => {
  it('sin candidatos no inventa nada', () => {
    expect(pickLiveSocialGist([])).toEqual({ winner: '', losers: [], reason: 'sin-candidatos' });
  });

  it('ignora ids vacíos', () => {
    const verdict = pickLiveSocialGist([gist(''), gist('   '), gist('bueno')]);
    expect(verdict).toMatchObject({ winner: 'bueno', reason: 'unico' });
  });

  it('con un solo candidato, ese es', () => {
    expect(pickLiveSocialGist([gist('solo')])).toMatchObject({ winner: 'solo', reason: 'unico' });
  });

  // LA REGLA PRINCIPAL: un gist secreto no lo puede leer ningún amigo, así que no puede ser el canal vivo por
  // muy nuevo que sea ni por mucho que lo tenga configurado el dispositivo.
  it('descarta el gist que NO es público, aunque sea el más reciente', () => {
    const verdict = pickLiveSocialGist([
      gist('secreto-nuevo', { isPublic: false, updatedAt: 9_000, contentCount: 50 }),
      gist('publico-viejo', { isPublic: true, updatedAt: 1_000, contentCount: 3 }),
    ]);

    expect(verdict).toMatchObject({ winner: 'publico-viejo', losers: ['secreto-nuevo'], reason: 'publico' });
  });

  it('si NINGUNO es público lo admite en vez de elegir uno que nadie puede leer', () => {
    const verdict = pickLiveSocialGist([
      gist('a', { isPublic: false }),
      gist('b', { isPublic: false }),
    ]);

    expect(verdict.winner).toBe('');
    expect(verdict.losers.sort()).toEqual(['a', 'b']);
    expect(verdict.reason).toBe('sin-candidatos');
  });

  // La duda NO descalifica: el rate-limit anónimo de GitHub responde 403 y eso no significa "no es público".
  // Es el mismo error que ya causó una vez el clonado indebido.
  it('un candidato de visibilidad desconocida sigue en juego', () => {
    const verdict = pickLiveSocialGist([
      gist('desconocido', { isPublic: null, updatedAt: 9_000 }),
      gist('publico', { isPublic: true, updatedAt: 1_000 }),
    ]);

    expect(verdict.winner).toBe('desconocido');
  });

  // EL CASO QUE MÁS IMPORTA: el clon recién creado está vacío y es el más nuevo. No puede ganarle al gist que
  // tiene las reseñas.
  it('un clon vacío y recién creado NO desbanca al gist con contenido', () => {
    const verdict = pickLiveSocialGist([
      gist('clon-vacio', { contentCount: 0, updatedAt: 9_999 }),
      gist('con-resenas', { contentCount: 120, updatedAt: 5_000 }),
    ]);

    expect(verdict).toMatchObject({ winner: 'con-resenas', reason: 'con-contenido' });
  });

  it('entre dos con contenido gana el más reciente: ahí es donde se publica hoy', () => {
    const verdict = pickLiveSocialGist([
      gist('viejo', { contentCount: 200, updatedAt: 1_000 }),
      gist('actual', { contentCount: 12, updatedAt: 8_000 }),
    ]);

    expect(verdict).toMatchObject({ winner: 'actual', reason: 'mas-reciente' });
  });

  it('a igualdad de fecha gana el que más contenido tiene', () => {
    const verdict = pickLiveSocialGist([
      gist('pobre', { contentCount: 1, updatedAt: 5_000 }),
      gist('rico', { contentCount: 90, updatedAt: 5_000 }),
    ]);

    expect(verdict.winner).toBe('rico');
  });

  it('si todo empata la decisión sigue siendo estable (mismo ganador sea cual sea el orden)', () => {
    const a = gist('aaa', { contentCount: 5, updatedAt: 5_000 });
    const b = gist('bbb', { contentCount: 5, updatedAt: 5_000 });

    // Dos clientes que reciban los candidatos en orden distinto no pueden elegir distinto: si lo hicieran, cada
    // uno reescribiría el del otro en cada apertura, indefinidamente.
    expect(pickLiveSocialGist([a, b]).winner).toBe(pickLiveSocialGist([b, a]).winner);
  });

  it('el mismo id repetido no cuenta dos veces, y se queda la evidencia más informativa', () => {
    const verdict = pickLiveSocialGist([
      gist('mismo', { isPublic: null }),
      gist('mismo', { isPublic: false }),
    ]);

    // Con la evidencia buena (`false`) queda descalificado, y como es el único, no hay ganador.
    expect(verdict.winner).toBe('');
    expect(verdict.losers).toEqual(['mismo']);
  });

  it('los perdedores son todos los candidatos menos el ganador', () => {
    const verdict = pickLiveSocialGist([
      gist('gana', { updatedAt: 9_000 }),
      gist('pierde-1', { updatedAt: 1_000 }),
      gist('pierde-2', { isPublic: false }),
    ]);

    expect(verdict.winner).toBe('gana');
    expect(verdict.losers.sort()).toEqual(['pierde-1', 'pierde-2']);
  });
});

// La descalificación por "no es público" aplica SIEMPRE, también cuando hay un único candidato: propagar a las
// amistades un gist que nadie puede leer es peor que no tocar nada. Ese caso lo arregla el propio cliente del
// usuario al volver a guardar (`updateGistPrivacy` lo vuelve público).
describe('pickLiveSocialGist — un único candidato secreto', () => {
  it('no lo declara ganador solo por estar solo', () => {
    const verdict = pickLiveSocialGist([
      { gistId: 'solo-secreto', isPublic: false, contentCount: 40, updatedAt: 9_000 },
    ]);

    expect(verdict).toEqual({ winner: '', losers: ['solo-secreto'], reason: 'sin-candidatos' });
  });

  it('pero un único candidato público sí gana, y por ser el único', () => {
    const verdict = pickLiveSocialGist([
      { gistId: 'solo-publico', isPublic: true, contentCount: 1, updatedAt: 1 },
    ]);

    expect(verdict).toEqual({ winner: 'solo-publico', losers: [], reason: 'unico' });
  });
});

// Sin poder leer ningún candidato no hay juicio posible. Es distinto de "no hay ganador": si se colapsaran los dos
// casos, el desempate acabaría decidiéndose por el orden alfabético del id, que es arbitrario y además cambiaría
// la decisión según qué gist le tocara a cada usuario.
describe('pickLiveSocialGist — sin evidencia (offline, rate-limit anónimo)', () => {
  const ciego = (gistId: string): SocialGistEvidence => ({ gistId, isPublic: null, contentCount: 0, updatedAt: 0 });

  it('lo declara `sin-evidencia` en vez de desempatar a ciegas', () => {
    const verdict = pickLiveSocialGist([ciego('aaa'), ciego('zzz')]);

    expect(verdict.reason).toBe('sin-evidencia');
    expect(verdict.winner).toBe('');
  });

  it('con un solo candidato ilegible no hace falta juzgar: es el que hay', () => {
    expect(pickLiveSocialGist([ciego('solo')])).toMatchObject({ winner: 'solo', reason: 'unico' });
  });

  it('basta con que UN candidato aporte algo para poder decidir', () => {
    const verdict = pickLiveSocialGist([ciego('ciego'), { gistId: 'legible', isPublic: true, contentCount: 3, updatedAt: 10 }]);

    expect(verdict.reason).not.toBe('sin-evidencia');
    expect(verdict.winner).toBe('legible');
  });
});
