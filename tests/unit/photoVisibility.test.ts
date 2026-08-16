// Reciprocidad de la foto: quien esconde la suya no ve la de nadie, y la de los demás solo se ve con amistad
// aceptada. Mithril (la cuenta de administración) queda exento de las dos reglas.
import { describe, expect, it } from 'vitest';
import { canSeeOtherPhotos, isPhotoRuleExempt, photoForViewer, resolveViewer, withVisiblePhotos } from '../../src/core/social/photoVisibility';

const FOTO = 'https://f/ada.png';

const conFoto = { showsOwnPhoto: true, tier: 'bronze' as const };
const sinFoto = { showsOwnPhoto: false, tier: 'bronze' as const };
const mithril = { showsOwnPhoto: false, tier: 'mithril' as const };

describe('resolveViewer', () => {
  // El interruptor dice lo que QUIERE; la foto de la cuenta dice lo que TIENE. Solo cuenta lo segundo, porque es lo
  // que los demás ven: quien lleva el "sí" activado y no tiene foto en Google no publica ninguna.
  it('querer mostrar la foto no basta: hay que tenerla', () => {
    expect(resolveViewer({ showPhoto: true, ownPhotoURL: FOTO, tier: 'bronze' }).showsOwnPhoto).toBe(true);
    expect(resolveViewer({ showPhoto: true, ownPhotoURL: '', tier: 'bronze' }).showsOwnPhoto).toBe(false);
    expect(resolveViewer({ showPhoto: true, ownPhotoURL: null, tier: 'bronze' }).showsOwnPhoto).toBe(false);
    expect(resolveViewer({ showPhoto: true, ownPhotoURL: undefined, tier: 'bronze' }).showsOwnPhoto).toBe(false);
    expect(resolveViewer({ showPhoto: true, ownPhotoURL: '   ', tier: 'bronze' }).showsOwnPhoto).toBe(false);
  });

  it('tener foto no sirve si la ha escondido', () => {
    expect(resolveViewer({ showPhoto: false, ownPhotoURL: FOTO, tier: 'bronze' }).showsOwnPhoto).toBe(false);
  });

  it('conserva el rango, que es lo que exime de la regla', () => {
    expect(resolveViewer({ showPhoto: false, ownPhotoURL: '', tier: 'mithril' }).tier).toBe('mithril');
  });

  it('quien lo tiene activado SIN foto queda igual que quien la esconde: no ve las de los demás', () => {
    const sinFotoEnGoogle = resolveViewer({ showPhoto: true, ownPhotoURL: '', tier: 'bronze' });
    expect(canSeeOtherPhotos(sinFotoEnGoogle)).toBe(false);
    expect(photoForViewer({ photoURL: FOTO, isOwn: false, isFriend: true, viewer: sinFotoEnGoogle })).toBe('');
  });

  // El agujero que tapa `googlePhoto`: Google no deja a nadie sin `photoURL` —a quien no sube foto le genera un
  // monograma con su inicial—, así que "tener URL" no basta para pasar por "tener cara".
  it('el avatar genérico de Google no cuenta como foto', () => {
    const conMonograma = resolveViewer({ showPhoto: true, ownPhotoURL: FOTO, ownPhotoIsGeneric: true, tier: 'bronze' });
    expect(conMonograma.showsOwnPhoto).toBe(false);
    expect(canSeeOtherPhotos(conMonograma)).toBe(false);
    expect(photoForViewer({ photoURL: FOTO, isOwn: false, isFriend: true, viewer: conMonograma })).toBe('');
  });

  // El veredicto llega por red. Mientras no está, manda lo de siempre: pintar la foto. Dura lo que una respuesta ya
  // cacheada, y el otro lado del error —quitarle la cara a quien sí la tiene— es peor.
  it('sin veredicto todavía, la foto se da por real', () => {
    expect(resolveViewer({ showPhoto: true, ownPhotoURL: FOTO, tier: 'bronze' }).showsOwnPhoto).toBe(true);
    expect(resolveViewer({ showPhoto: true, ownPhotoURL: FOTO, ownPhotoIsGeneric: undefined, tier: 'bronze' }).showsOwnPhoto).toBe(true);
    expect(resolveViewer({ showPhoto: true, ownPhotoURL: FOTO, ownPhotoIsGeneric: false, tier: 'bronze' }).showsOwnPhoto).toBe(true);
  });

  // Mithril (la administración) queda exento de la RECIPROCIDAD, no de esto: sigue sin aportar foto, pero su rango le
  // deja ver las de los demás igualmente.
  it('el monograma tampoco quita el rango', () => {
    const admin = resolveViewer({ showPhoto: true, ownPhotoURL: FOTO, ownPhotoIsGeneric: true, tier: 'mithril' });
    expect(admin.showsOwnPhoto).toBe(false);
    expect(canSeeOtherPhotos(admin)).toBe(true);
  });
});

describe('canSeeOtherPhotos', () => {
  it('quien publica su foto ve las ajenas; quien la esconde, no', () => {
    expect(canSeeOtherPhotos(conFoto)).toBe(true);
    expect(canSeeOtherPhotos(sinFoto)).toBe(false);
  });

  it('mithril las ve aunque esconda la suya', () => {
    expect(canSeeOtherPhotos(mithril)).toBe(true);
    expect(isPhotoRuleExempt(mithril)).toBe(true);
    expect(isPhotoRuleExempt(conFoto)).toBe(false);
  });
});

describe('photoForViewer', () => {
  it('la foto de un AMIGO se ve si el que mira publica la suya', () => {
    expect(photoForViewer({ photoURL: FOTO, isOwn: false, isFriend: true, viewer: conFoto })).toBe(FOTO);
  });

  it('quien esconde su foto no ve ni la de sus amigos', () => {
    expect(photoForViewer({ photoURL: FOTO, isOwn: false, isFriend: true, viewer: sinFoto })).toBe('');
  });

  it('sin amistad no se ve la foto, aunque el que mira publique la suya', () => {
    expect(photoForViewer({ photoURL: FOTO, isOwn: false, isFriend: false, viewer: conFoto })).toBe('');
  });

  it('la foto propia siempre es suya, esconda o no la foto', () => {
    expect(photoForViewer({ photoURL: FOTO, isOwn: true, isFriend: false, viewer: sinFoto })).toBe(FOTO);
  });

  it('mithril ve la de cualquiera: sin amistad y escondiendo la suya', () => {
    expect(photoForViewer({ photoURL: FOTO, isOwn: false, isFriend: false, viewer: mithril })).toBe(FOTO);
  });

  it('sin foto publicada no hay nada que resolver', () => {
    expect(photoForViewer({ photoURL: '', isOwn: false, isFriend: true, viewer: conFoto })).toBe('');
  });
});

describe('withVisiblePhotos', () => {
  function entry(uid: string, photoURL = FOTO) {
    return {
      id: uid,
      uid,
      photoURL,
      activity: [{ photoURL, gameId: 1 }],
      posts: [{ photoURL, text: 'hola' }],
    };
  }

  const noEsPropia = () => false;

  it('borra la foto del no-amigo también en su actividad y sus publicaciones', () => {
    // El feed lee la foto del autor de cada evento, no de la entrada: limpiar solo la entrada dejaría la cara en
    // todas sus tarjetas.
    const [visible] = withVisiblePhotos([entry('otro')], {
      viewer: conFoto,
      friendUids: new Set<string>(),
      isOwnEntry: noEsPropia,
    });

    expect(visible.photoURL).toBe('');
    expect(visible.activity[0].photoURL).toBe('');
    expect(visible.posts[0].photoURL).toBe('');
    // El resto del evento no se toca.
    expect(visible.activity[0].gameId).toBe(1);
    expect(visible.posts[0].text).toBe('hola');
  });

  it('conserva la del amigo y la propia', () => {
    const entries = [entry('amiga'), entry('yo')];
    const visible = withVisiblePhotos(entries, {
      viewer: conFoto,
      friendUids: new Set(['amiga']),
      isOwnEntry: (item) => item.uid === 'yo',
    });

    expect(visible.map((item) => item.photoURL)).toEqual([FOTO, FOTO]);
  });

  it('quien esconde su foto no ve ninguna, ni de amigos', () => {
    const visible = withVisiblePhotos([entry('amiga'), entry('otro')], {
      viewer: sinFoto,
      friendUids: new Set(['amiga']),
      isOwnEntry: noEsPropia,
    });

    expect(visible.map((item) => item.photoURL)).toEqual(['', '']);
    expect(visible.flatMap((item) => item.activity.map((a) => a.photoURL))).toEqual(['', '']);
  });

  it('mithril recibe el directorio intacto (misma referencia: no invalida los memos)', () => {
    const entries = [entry('otro')];
    expect(withVisiblePhotos(entries, { viewer: mithril, friendUids: new Set(), isOwnEntry: noEsPropia })).toBe(entries);
  });

  it('sin nada que ocultar devuelve el MISMO array, para no recalcular el feed en cada render', () => {
    const entries = [entry('amiga')];
    const visible = withVisiblePhotos(entries, {
      viewer: conFoto,
      friendUids: new Set(['amiga']),
      isOwnEntry: noEsPropia,
    });
    expect(visible).toBe(entries);
  });

  it('una entrada sin foto no se reescribe aunque haya otras que sí', () => {
    const conCara = entry('otro');
    const sinCara = entry('nadie', '');
    const visible = withVisiblePhotos([conCara, sinCara], {
      viewer: conFoto,
      friendUids: new Set<string>(),
      isOwnEntry: noEsPropia,
    });

    expect(visible[0]).not.toBe(conCara); // se le ha quitado la foto
    expect(visible[1]).toBe(sinCara); // no había nada que quitar
  });
});
