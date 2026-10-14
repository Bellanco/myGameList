import { describe, expect, it } from 'vitest';
import {
  publicAnnouncementView,
  ANNOUNCEMENT_ICONS,
  ANNOUNCEMENT_LIMITS,
  DEFAULT_ANNOUNCEMENT_ICON,
  DEFAULT_INTERVAL_HOURS,
  DEFAULT_REPEATS,
  NO_SEEN,
  afterClicked,
  afterShown,
  ANNOUNCEMENT_HISTORY_MAX,
  isAnnouncementDue,
  parseSeen,
  pushAnnouncementHistory,
  sanitizeAnnouncement,
  sanitizeAnnouncementHistory,
  type Announcement,
  type AnnouncementSeen,
} from '../../src/core/announcement/announcement';

const NOW = Date.parse('2026-09-12T10:00:00.000Z');
const HORA = 3600_000;

function aviso(partial: Partial<Announcement> = {}): Announcement {
  return {
    id: 'av-1',
    kicker: 'Ya puedes votar',
    title: 'Vota los juegos del año',
    body: 'La votación está abierta hasta el domingo.',
    url: 'https://ejemplo.org/votar',
    icon: 'bell',
    active: true,
    repeats: DEFAULT_REPEATS,
    intervalHours: DEFAULT_INTERVAL_HOURS,
    startsAt: 0,
    endsAt: 0,
    audience: 'all',
    updatedAt: NOW,
    ...partial,
  };
}

function visto(partial: Partial<AnnouncementSeen> = {}): AnnouncementSeen {
  return { ...NO_SEEN, id: 'av-1', ...partial };
}

describe('saneado del aviso', () => {
  it('acepta un aviso completo y respeta sus valores', () => {
    const limpio = sanitizeAnnouncement(aviso());
    expect(limpio?.title).toBe('Vota los juegos del año');
    expect(limpio?.url).toBe('https://ejemplo.org/votar');
    expect(limpio?.icon).toBe('bell');
    expect(limpio?.repeats).toBe(3);
  });

  /**
   * LA FRONTERA ANTI-XSS. El aviso es el único texto del proyecto que un usuario lee sin haberlo escrito nadie
   * de su confianza, y trae un enlace dentro: una URL que no sea http(s) no puede llegar a pintarse jamás.
   */
  it('rechaza lo que no sea un enlace http(s)', () => {
    expect(sanitizeAnnouncement(aviso({ url: 'javascript:alert(1)' }))).toBeNull();
    expect(sanitizeAnnouncement(aviso({ url: 'data:text/html,<script>' }))).toBeNull();
    expect(sanitizeAnnouncement(aviso({ url: 'ejemplo.org' }))).toBeNull();
    expect(sanitizeAnnouncement(aviso({ url: '' }))).toBeNull();
    expect(sanitizeAnnouncement(aviso({ url: 'http://ejemplo.org' }))?.url).toBe('http://ejemplo.org');
  });

  it('no hay aviso sin id ni sin título: una cápsula a medias no lleva a ninguna parte', () => {
    expect(sanitizeAnnouncement(aviso({ id: '' }))).toBeNull();
    expect(sanitizeAnnouncement(aviso({ title: '   ' }))).toBeNull();
    expect(sanitizeAnnouncement(null)).toBeNull();
    expect(sanitizeAnnouncement('x')).toBeNull();
  });

  it('recorta a los límites y cae a los valores por defecto con basura dentro', () => {
    const limpio = sanitizeAnnouncement({
      ...aviso(),
      title: 'x'.repeat(200),
      body: 'y'.repeat(500),
      icon: 'no-existe',
      repeats: 'tres',
      intervalHours: -4,
    });
    expect(limpio?.title).toHaveLength(ANNOUNCEMENT_LIMITS.title);
    expect(limpio?.body).toHaveLength(ANNOUNCEMENT_LIMITS.body);
    expect(limpio?.icon).toBe(DEFAULT_ANNOUNCEMENT_ICON);
    expect(limpio?.repeats).toBe(DEFAULT_REPEATS);
    expect(limpio?.intervalHours).toBe(DEFAULT_INTERVAL_HOURS);
    // Y el tope se aplica también por arriba: un documento no puede pedir doscientas insistencias.
    expect(sanitizeAnnouncement(aviso({ repeats: 99 }))?.repeats).toBe(ANNOUNCEMENT_LIMITS.repeats);
  });

  /** Ausente = apagado. El lado seguro de un canal que le habla a todo el mundo es callar. */
  it('un aviso sin `active` está apagado', () => {
    const limpio = sanitizeAnnouncement({ ...aviso(), active: undefined });
    expect(limpio?.active).toBe(false);
  });

  /**
   * ⚑ AÑADIR UN ICONO SON TRES PASOS Y ESTE TEST LOS EXIGE: el dibujo en un sprite, el `id` en la lista y el
   * nombre en el panel. Saltarse el primero no rompe nada visible en la batería —un `<use>` que no resuelve pinta
   * un hueco—, y saltarse el tercero deja un botón sin nombre para quien no ve el dibujo.
   */
  it('cada icono del aviso tiene dibujo y nombre', async () => {
    const [propio, general, { ADMIN_ANNOUNCEMENT_UI }] = await Promise.all([
      import('../../src/view/components/AnnouncementSprite?raw'),
      import('../../src/view/components/IconSprite?raw'),
      import('../../src/core/constants/adminLabels'),
    ]);
    const dibujos = `${propio.default}${general.default}`;

    for (const icon of ANNOUNCEMENT_ICONS) {
      expect(dibujos, `falta el dibujo de «${icon}»`).toContain(`id="icon-${icon}"`);
      expect(ADMIN_ANNOUNCEMENT_UI.iconNames[icon], `falta el nombre de «${icon}»`).toBeTruthy();
    }
  });
});

describe('cuándo toca decirlo', () => {
  it('la primera vez, en cuanto está encendido', () => {
    expect(isAnnouncementDue(aviso(), NO_SEEN, NOW)).toBe(true);
  });

  it('apagado, no', () => {
    expect(isAnnouncementDue(aviso({ active: false }), NO_SEEN, NOW)).toBe(false);
    expect(isAnnouncementDue(null, NO_SEEN, NOW)).toBe(false);
  });

  /** Pulsar es el gesto que lo apaga para siempre: quien ya entró en la web no necesita que se le repita. */
  it('pulsado, nunca más', () => {
    expect(isAnnouncementDue(aviso(), visto({ clicked: true, shown: 1, lastAt: NOW - 99 * HORA }), NOW)).toBe(false);
  });

  it('respeta la espera entre avisos', () => {
    const seen = visto({ shown: 1, lastAt: NOW - 3 * HORA });
    expect(isAnnouncementDue(aviso(), seen, NOW)).toBe(false);
    expect(isAnnouncementDue(aviso(), seen, NOW + 22 * HORA)).toBe(true);
    // Y una espera distinta se respeta igual: es del documento, no del código.
    expect(isAnnouncementDue(aviso({ intervalHours: 2 }), seen, NOW)).toBe(true);
  });

  it('se calla al agotar las veces', () => {
    const seen = visto({ shown: 3, lastAt: NOW - 99 * HORA });
    expect(isAnnouncementDue(aviso(), seen, NOW)).toBe(false);
    expect(isAnnouncementDue(aviso({ repeats: 4 }), seen, NOW)).toBe(true);
  });

  /**
   * LA CAMPAÑA NUEVA EMPIEZA DE CERO. Es lo que hace el botón «Publicar como aviso nuevo» del panel: cambia el
   * `id`, y con él la cuenta de este aparato deja de valer aunque el anterior estuviera pulsado y agotado.
   */
  it('un id nuevo se lo vuelve a decir a quien ya lo había visto y pulsado', () => {
    const seen = visto({ shown: 3, clicked: true, lastAt: NOW });
    expect(isAnnouncementDue(aviso({ id: 'av-2' }), seen, NOW)).toBe(true);
  });
});

describe('la cuenta del dispositivo', () => {
  it('apunta cada aparición con su hora', () => {
    const uno = afterShown(aviso(), NO_SEEN, NOW);
    expect(uno).toEqual({ id: 'av-1', shown: 1, lastAt: NOW, clicked: false });
    expect(afterShown(aviso(), uno, NOW + HORA).shown).toBe(2);
  });

  it('empieza de cero si la cuenta era de otra campaña', () => {
    const otra = afterShown(aviso({ id: 'av-2' }), visto({ shown: 5, clicked: true }), NOW);
    expect(otra).toEqual({ id: 'av-2', shown: 1, lastAt: NOW, clicked: false });
  });

  it('el clic no pierde lo contado', () => {
    const pulsado = afterClicked(aviso(), visto({ shown: 2, lastAt: NOW }));
    expect(pulsado).toEqual({ id: 'av-1', shown: 2, lastAt: NOW, clicked: true });
  });

  it('lee lo guardado y aguanta basura', () => {
    expect(parseSeen(JSON.stringify(visto({ shown: 2 })))).toEqual(visto({ shown: 2 }));
    expect(parseSeen('{no es json')).toEqual(NO_SEEN);
    expect(parseSeen(null)).toEqual(NO_SEEN);
    expect(parseSeen('{"id":"","shown":9}')).toEqual(NO_SEEN);
    expect(parseSeen('{"id":"av-1","shown":"tres","lastAt":-5}')).toEqual(visto());
  });
});

describe('aviso programado: ventana y público', () => {
  it('sanea la ventana: números finitos y positivos, o sin límite', () => {
    const limpio = sanitizeAnnouncement({ ...aviso(), startsAt: 'mañana', endsAt: -5 });
    expect(limpio?.startsAt).toBe(0);
    expect(limpio?.endsAt).toBe(0);
    expect(sanitizeAnnouncement(aviso({ startsAt: NOW, endsAt: NOW + HORA }))).toMatchObject({ startsAt: NOW, endsAt: NOW + HORA });
  });

  /** Una ventana al revés no puede dejar un aviso encendido y mudo: se queda sin fin. */
  it('una ventana que acaba antes de empezar se queda sin fin', () => {
    expect(sanitizeAnnouncement(aviso({ startsAt: NOW, endsAt: NOW - HORA }))?.endsAt).toBe(0);
    expect(sanitizeAnnouncement(aviso({ startsAt: NOW, endsAt: NOW }))?.endsAt).toBe(0);
  });

  /** Un documento de antes de esto no tenía público: se le decía a todo el mundo, y así sigue. */
  it('un público desconocido o ausente es «todos»', () => {
    expect(sanitizeAnnouncement({ ...aviso(), audience: undefined })?.audience).toBe('all');
    expect(sanitizeAnnouncement({ ...aviso(), audience: 'oro' })?.audience).toBe('all');
    expect(sanitizeAnnouncement(aviso({ audience: 'social' }))?.audience).toBe('social');
  });

  it('antes de empezar no sale; al llegar la hora, sí; al acabar, ya no', () => {
    const programado = aviso({ startsAt: NOW + HORA, endsAt: NOW + 5 * HORA });
    expect(isAnnouncementDue(programado, NO_SEEN, NOW)).toBe(false);
    expect(isAnnouncementDue(programado, NO_SEEN, NOW + HORA)).toBe(true);
    expect(isAnnouncementDue(programado, NO_SEEN, NOW + 5 * HORA)).toBe(false);
  });

  it('sin decir a quién, un aviso para todos se comporta como siempre', () => {
    expect(isAnnouncementDue(aviso(), NO_SEEN, NOW)).toBe(true);
    expect(isAnnouncementDue(aviso(), NO_SEEN, NOW, { hasSocial: null })).toBe(true);
  });

  it('un aviso dirigido solo sale a quien toca', () => {
    const social = aviso({ audience: 'social' });
    const sinSocial = aviso({ audience: 'no-social' });
    expect(isAnnouncementDue(social, NO_SEEN, NOW, { hasSocial: true })).toBe(true);
    expect(isAnnouncementDue(social, NO_SEEN, NOW, { hasSocial: false })).toBe(false);
    expect(isAnnouncementDue(sinSocial, NO_SEEN, NOW, { hasSocial: false })).toBe(true);
    expect(isAnnouncementDue(sinSocial, NO_SEEN, NOW, { hasSocial: true })).toBe(false);
  });

  /** El lado seguro de no saberlo es callar: decir «conecta tu espacio social» a quien ya lo tiene no lo es. */
  it('con público dirigido y sin saber si hay espacio social, se calla', () => {
    expect(isAnnouncementDue(aviso({ audience: 'social' }), NO_SEEN, NOW)).toBe(false);
    expect(isAnnouncementDue(aviso({ audience: 'no-social' }), NO_SEEN, NOW, { hasSocial: null })).toBe(false);
  });
});

describe('historial de avisos', () => {
  it('al cambiar de campaña, la anterior entra la primera', () => {
    const viejo = aviso({ id: 'av-0' });
    const anterior = aviso({ id: 'av-1' });
    const nuevo = aviso({ id: 'av-2' });
    expect(pushAnnouncementHistory([viejo], anterior, nuevo)?.map((entry) => entry.id)).toEqual(['av-1', 'av-0']);
  });

  /** Corregir una errata, encender o apagar no tocan el historial: ni una escritura de más. */
  it('con la misma campaña, o sin aviso anterior, no hay nada que escribir', () => {
    expect(pushAnnouncementHistory([], aviso(), aviso({ title: 'Corregido' }))).toBeNull();
    expect(pushAnnouncementHistory([], null, aviso())).toBeNull();
  });

  it('no repite campañas y no pasa del tope', () => {
    const muchos = Array.from({ length: ANNOUNCEMENT_HISTORY_MAX + 5 }, (_, index) => aviso({ id: `av-h${index}` }));
    const siguiente = pushAnnouncementHistory([aviso({ id: 'av-1' }), ...muchos], aviso({ id: 'av-1' }), aviso({ id: 'av-9' }));
    expect(siguiente).toHaveLength(ANNOUNCEMENT_HISTORY_MAX);
    expect(siguiente?.filter((entry) => entry.id === 'av-1')).toHaveLength(1);
  });

  it('el saneado del historial descarta lo que no es un aviso entero', () => {
    expect(sanitizeAnnouncementHistory('x')).toEqual([]);
    expect(sanitizeAnnouncementHistory([aviso(), { id: 'roto' }, null]).map((entry) => entry.id)).toEqual(['av-1']);
  });
});

// LA VENTANA TAMBIÉN EN EL SERVIDOR: un cliente con el JavaScript anterior (servido un rato por el service worker
// tras desplegar) no sabe de fechas, así que la función no le da lo que no toca todavía.
describe('publicAnnouncementView', () => {
  const NOW = Date.UTC(2026, 9, 14, 12);
  const base = sanitizeAnnouncement({ id: 'c', title: 'T', url: 'https://example.com', active: true })!;

  it('sin ventana, el aviso tal cual y la caché de siempre', () => {
    expect(publicAnnouncementView(base, NOW, 300)).toEqual({ value: base, maxAge: 300 });
    expect(publicAnnouncementView(null, NOW, 300)).toEqual({ value: null, maxAge: 300 });
  });

  it('antes de empezar no hay aviso, y la caché no pasa de la hora de inicio', () => {
    const later = { ...base, startsAt: NOW + 60_000 };
    expect(publicAnnouncementView(later, NOW, 300)).toEqual({ value: null, maxAge: 60 });
  });

  it('dentro de la ventana sí, con la caché recortada hasta el final', () => {
    const ending = { ...base, startsAt: NOW - 1000, endsAt: NOW + 90_000 };
    expect(publicAnnouncementView(ending, NOW, 300)).toEqual({ value: ending, maxAge: 90 });
  });

  it('terminado, no hay aviso', () => {
    expect(publicAnnouncementView({ ...base, endsAt: NOW - 1 }, NOW, 300).value).toBeNull();
  });
});
