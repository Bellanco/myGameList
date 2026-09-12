import { describe, expect, it } from 'vitest';
import {
  ANNOUNCEMENT_ICONS,
  ANNOUNCEMENT_LIMITS,
  DEFAULT_INTERVAL_HOURS,
  DEFAULT_REPEATS,
  NO_SEEN,
  afterClicked,
  afterShown,
  isAnnouncementDue,
  parseSeen,
  sanitizeAnnouncement,
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
    expect(limpio?.icon).toBe('bell');
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

  it('todos los iconos que ofrece el panel están en el sprite de la app', async () => {
    const { default: sprite } = await import('../../src/view/components/IconSprite?raw');
    for (const icon of ANNOUNCEMENT_ICONS) {
      expect(sprite, `falta #icon-${icon}`).toContain(`id="icon-${icon}"`);
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
