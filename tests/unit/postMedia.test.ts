import { describe, expect, it } from 'vitest';
import { resolvePostMedia, isSteamSharedFilePage } from '../../src/core/social/postMedia';

describe('resolvePostMedia — lista blanca de orígenes de confianza', () => {
  it('GitHub raw: imagen por extensión', () => {
    const u = 'https://raw.githubusercontent.com/u/r/main/x.png';
    expect(resolvePostMedia(u)).toEqual({ kind: 'image', src: u });
  });

  it('GitHub raw: vídeo por extensión', () => {
    const u = 'https://raw.githubusercontent.com/u/r/main/v.mp4';
    expect(resolvePostMedia(u)).toEqual({ kind: 'video', src: u });
  });

  it('Steam: CDN directo (steamusercontent.com) sin extensión → imagen', () => {
    const u = 'https://images.steamusercontent.com/ugc/123456/ABCDEF/';
    expect(resolvePostMedia(u)).toEqual({ kind: 'image', src: u });
  });

  it('Steam: CDN antiguo (steamuserimages) sin extensión → imagen', () => {
    const u = 'https://steamuserimages-a.akamaihd.net/ugc/123456/ABCDEF/';
    expect(resolvePostMedia(u)).toEqual({ kind: 'image', src: u });
  });

  it('Steam: la PÁGINA filedetails (steamcommunity) NO es imagen → null (se queda como enlace)', () => {
    expect(resolvePostMedia('https://steamcommunity.com/sharedfiles/filedetails/?id=123456')).toBeNull();
  });

  it('Google Drive: /file/d/{id}/view → URL directa de imagen', () => {
    expect(resolvePostMedia('https://drive.google.com/file/d/ABC123/view?usp=sharing'))
      .toEqual({ kind: 'image', src: 'https://lh3.googleusercontent.com/d/ABC123' });
  });

  it('Google Drive: open?id={id} → URL directa de imagen', () => {
    expect(resolvePostMedia('https://drive.google.com/open?id=XYZ789'))
      .toEqual({ kind: 'image', src: 'https://lh3.googleusercontent.com/d/XYZ789' });
  });

  it('Xbox con extensión directa → imagen; sin extensión → null (fallback a enlace)', () => {
    expect(resolvePostMedia('https://screenshotscontent-d.xboxlive.com/abc.jpg'))
      .toEqual({ kind: 'image', src: 'https://screenshotscontent-d.xboxlive.com/abc.jpg' });
    expect(resolvePostMedia('https://account.xboxlive.com/clip/abc')).toBeNull();
  });

  it('host NO permitido → null aunque la URL acabe en .png', () => {
    expect(resolvePostMedia('https://evil.example.com/track.png')).toBeNull();
  });

  it('esquemas peligrosos → null', () => {
    expect(resolvePostMedia('javascript:alert(1)')).toBeNull();
    expect(resolvePostMedia('data:image/png;base64,AAAA')).toBeNull();
  });

  it('SVG excluido aunque el host sea de confianza', () => {
    expect(resolvePostMedia('https://raw.githubusercontent.com/u/r/main/x.svg')).toBeNull();
  });

  it('URL inválida → null', () => {
    expect(resolvePostMedia('no soy una url')).toBeNull();
  });
});

describe('isSteamSharedFilePage — página de captura de Steam', () => {
  it('detecta la página filedetails', () => {
    expect(isSteamSharedFilePage('https://steamcommunity.com/sharedfiles/filedetails/?id=3726276136')).toBe(true);
  });

  it('NO marca una imagen directa ni un enlace cualquiera', () => {
    expect(isSteamSharedFilePage('https://images.steamusercontent.com/ugc/123/ABC/')).toBe(false);
    expect(isSteamSharedFilePage('https://example.com/noticia')).toBe(false);
  });

  it('URL inválida → false', () => {
    expect(isSteamSharedFilePage('no soy una url')).toBe(false);
  });
});
