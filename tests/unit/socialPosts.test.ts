import { describe, expect, it } from 'vitest';
// `?raw` de Vite y no `node:fs`: los tests unitarios corren sin `@types/node` a propósito (ver tsconfig.json).
import headersFile from '../../public/_headers?raw';
import { isSteamSharedFilePage, resolvePostMedia } from '../../src/core/social/postMedia';
import { upsertPost, type SocialGistData } from '../../src/model/repository/socialGistRepository';
import { assertValidSocialGist } from '../../src/model/schemas/socialGistSchema';

function baseGist(): SocialGistData {
  return {
    profile: {
      name: 'Autor',
      private: false,
      visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true },
      sharedLists: {},
    },
    activity: [],
    posts: [],
    updatedAt: 1000,
    schemaVersion: 2,
  };
}

describe('F3 — publicaciones del feed social', () => {
  it('upsertPost añade un post al principio y preserva el resto del gist', () => {
    const data = baseGist();
    const next = upsertPost(data, { authorProfileId: 'p1', authorName: 'Autor', text: 'Hola https://example.com', timestamp: 2000 });

    expect(next.posts).toHaveLength(1);
    expect(next.posts?.[0]).toMatchObject({ authorProfileId: 'p1', authorName: 'Autor', text: 'Hola https://example.com' });
    expect(next.posts?.[0].id).toBe('p1:2000');
    // No toca la actividad ni el perfil.
    expect(next.activity).toEqual(data.activity);
    expect(next.profile).toEqual(data.profile);

    const second = upsertPost(next, { authorProfileId: 'p1', authorName: 'Autor', text: 'Segundo', timestamp: 3000 });
    expect(second.posts).toHaveLength(2);
    expect(second.posts?.[0].text).toBe('Segundo'); // el más reciente primero
  });

  it('upsertPost es no-op sin autor o sin texto, y cota la longitud al cupo recibido', () => {
    const data = baseGist();
    expect(upsertPost(data, { authorProfileId: '', authorName: 'X', text: 'algo' }).posts).toHaveLength(0);
    expect(upsertPost(data, { authorProfileId: 'p1', authorName: 'X', text: '   ' }).posts).toHaveLength(0);

    // El cupo lo pasa quien publica, según su rango (plata 1.000, oro 10.000).
    const plata = upsertPost(data, { authorProfileId: 'p1', authorName: 'X', text: 'a'.repeat(2000), timestamp: 1, maxLength: 1_000 });
    expect(plata.posts?.[0].text.length).toBe(1_000);

    const oro = upsertPost(data, { authorProfileId: 'p1', authorName: 'X', text: 'a'.repeat(2000), timestamp: 1, maxLength: 10_000 });
    expect(oro.posts?.[0].text.length).toBe(2_000);
  });

  // Último cortafuegos del rango bronce: si una publicación llega hasta aquí con cupo 0, el texto queda vacío y
  // `upsertPost` no añade nada. La comprobación de la interfaz es la primera barrera, no la única.
  it('con cupo 0 (bronce) no se añade publicación alguna', () => {
    const data = baseGist();
    const bronce = upsertPost(data, { authorProfileId: 'p1', authorName: 'X', text: 'noticia', timestamp: 1, maxLength: 0 });
    expect(bronce.posts).toHaveLength(0);
  });

  it('el schema estricto acepta gists con y sin posts, y rechaza campos extra (allowlist)', () => {
    // Sin posts (campo opcional).
    const noPosts = baseGist();
    delete noPosts.posts;
    expect(() => assertValidSocialGist(noPosts)).not.toThrow();

    // Con un post válido.
    const withPost = upsertPost(baseGist(), { authorProfileId: 'p1', authorName: 'Autor', text: 'Noticia', timestamp: 5 });
    expect(() => assertValidSocialGist(withPost)).not.toThrow();

    // Un post con un campo fuera de la allowlist debe fallar.
    const hostile = baseGist();
    hostile.posts = [{
      id: 'p1:5', authorProfileId: 'p1', authorName: 'A', text: 'x', createdAt: 5, updatedAt: 5,
      // @ts-expect-error campo no permitido por el strictObject
      review: 'fuga',
    }];
    expect(() => assertValidSocialGist(hostile)).toThrow();
  });
});

/**
 * S7 — Todo lo que la app pinta como imagen o vídeo tiene que estar permitido por la CSP.
 *
 * Son dos ficheros que nadie obliga a mover juntos: `postMedia` decide qué URL se convierte en un `src`, y
 * `public/_headers` decide de qué hosts deja el navegador cargarlo. Cuando divergen no salta ningún error —la
 * CSP bloquea, el `onError` degrada a enlace y la publicación se ve peor sin que nadie sepa por qué—, así que la
 * comprobación vive aquí. Es el mismo patrón con el que ya se atan los límites de `firestore.rules`.
 *
 * Se comprueba el `src` RESUELTO y no la lista de hosts de confianza, porque no son lo mismo y confundirlos da
 * un falso positivo: `drive.google.com` está en la lista para CONVERTIRLO a `lh3.googleusercontent.com` (que es
 * el host del que se carga de verdad), y `steamcommunity.com` está para RECONOCER su página de captura y dejarla
 * como enlace. De ninguno de los dos se sirve un `src`, así que ninguno tiene que estar en la CSP.
 */
describe('medios incrustables frente a la CSP', () => {
  const headers = headersFile;

  /** Los hosts de una directiva de la CSP, tal y como están escritos en el fichero. */
  function directive(name: string): string[] {
    const csp = /Content-Security-Policy:([^\n]*)/.exec(headers)?.[1] ?? '';
    const found = new RegExp(`(?:^|;)\\s*${name}\\s([^;]*)`).exec(csp)?.[1] ?? '';
    return found.trim().split(/\s+/).filter(Boolean);
  }

  /** ¿Alguna entrada de la directiva cubre este host, en su forma exacta o por comodín? */
  function covers(hosts: string[], hostname: string): boolean {
    return hosts.some((entry) => {
      const bare = entry.replace(/^https:\/\//, '');
      if (bare === hostname) return true;
      if (!bare.startsWith('*.')) return false;
      const suffix = bare.slice(2);
      return hostname === suffix || hostname.endsWith(`.${suffix}`);
    });
  }

  /** Una URL representativa por cada host del que la app llega a servir media. */
  const SAMPLES = [
    'https://raw.githubusercontent.com/usuario/repo/main/captura.png',
    'https://user-images.githubusercontent.com/1/captura.jpg',
    'https://images.steamusercontent.com/ugc/1234567890/',
    'https://steamuserimages-a.akamaihd.net/ugc/1234567890/',
    'https://cdn.cloudflare.steamstatic.com/steam/apps/1/header.jpg',
    'https://drive.google.com/file/d/ABC123def456/view',
    'https://lh3.googleusercontent.com/d/ABC123def456',
    'https://gs2.ww.prod.dl.playstation.net/gs2/captura.jpg',
    'https://images-eds.xboxlive.com/image/captura.png',
    'https://raw.githubusercontent.com/usuario/repo/main/clip.mp4',
  ];

  it('la CSP declara img-src y media-src', () => {
    expect(directive('img-src').length).toBeGreaterThan(0);
    expect(directive('media-src').length).toBeGreaterThan(0);
  });

  it('todo src que se llega a pintar cae dentro de la CSP', () => {
    const images = directive('img-src');
    const videos = directive('media-src');

    const blocked = SAMPLES.map((url) => {
      const media = resolvePostMedia(url);
      if (!media) return null;
      const allowed = media.kind === 'video' ? videos : images;
      return covers(allowed, new URL(media.src).hostname) ? null : `${media.kind} ${media.src}`;
    }).filter(Boolean);

    // Si esto falla, o falta un host en `public/_headers` o sobra en `postMedia`. Las dos listas se tocan juntas.
    expect(blocked).toEqual([]);
  });

  it('nada de steamcommunity.com se incrusta, ni siquiera con extensión de imagen', () => {
    // La página de la captura es lo que la gente pega, y no es una imagen; y una URL suya acabada en `.jpg` sí
    // se pintaba antes, para que la CSP la bloqueara acto seguido. De ese host se enlaza, no se incrusta.
    expect(resolvePostMedia('https://steamcommunity.com/sharedfiles/filedetails/?id=123')).toBeNull();
    expect(resolvePostMedia('https://steamcommunity.com/algo/captura.jpg')).toBeNull();
    // El aviso para pegar la URL directa no depende de la lista de incrustables: sigue reconociendo la página.
    expect(isSteamSharedFilePage('https://steamcommunity.com/sharedfiles/filedetails/?id=123')).toBe(true);
  });

  it('un host desconocido nunca se incrusta', () => {
    expect(resolvePostMedia('https://ejemplo-cualquiera.com/pixel.png')).toBeNull();
  });
});
