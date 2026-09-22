import { describe, expect, it } from 'vitest';
import {
  SEASON_STAGE,
  VOTING_STATE,
  areResultsOffered,
  areResultsPublished,
  daysUntil,
  getSeasonStage,
  getVotingState,
  isVotingOpenNow,
  validateClosingDay,
} from '../../src/core/premios/votingSchedule';
import type { PremiosVotingConfig } from '../../src/model/types/premios';

const NOW = Date.parse('2026-06-15T12:00:00.000Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const config = (overrides: Partial<PremiosVotingConfig> = {}): PremiosVotingConfig => ({
  isOpen: true,
  season: 2026,
  opensAtMillis: null,
  closesAtMillis: null,
  resultsAtMillis: null,
  ...overrides,
});

describe('isVotingOpenNow', () => {
  it('está abierta sin fechas (edición aún sin calendario)', () => {
    expect(isVotingOpenNow(config(), NOW)).toBe(true);
  });

  it('está cerrada antes de la apertura y después del cierre', () => {
    expect(isVotingOpenNow(config({ opensAtMillis: NOW + HOUR }), NOW)).toBe(false);
    expect(isVotingOpenNow(config({ closesAtMillis: NOW - 1 }), NOW)).toBe(false);
  });

  it('está abierta dentro de la ventana', () => {
    expect(isVotingOpenNow(config({ opensAtMillis: NOW - DAY, closesAtMillis: NOW + DAY }), NOW)).toBe(true);
  });

  it('el interruptor cierra aunque se esté en plazo', () => {
    const cfg = config({ isOpen: false, opensAtMillis: NOW - DAY, closesAtMillis: NOW + DAY });
    expect(isVotingOpenNow(cfg, NOW)).toBe(false);
  });

  // La regla que evita que «abrir votación» contradiga al calendario. La misma comprobación vive en
  // firestore.rules, que es quien la impone de verdad.
  it('el interruptor NO abre fuera de la ventana', () => {
    expect(isVotingOpenNow(config({ isOpen: true, opensAtMillis: NOW + HOUR }), NOW)).toBe(false);
  });

  it('sin configuración no se vota', () => {
    expect(isVotingOpenNow(null, NOW)).toBe(false);
  });
});

describe('getVotingState', () => {
  it('distingue programada, abierta y cerrada', () => {
    expect(getVotingState(config({ opensAtMillis: NOW + HOUR }), NOW)).toBe(VOTING_STATE.SCHEDULED);
    expect(getVotingState(config({ closesAtMillis: NOW - HOUR }), NOW)).toBe(VOTING_STATE.CLOSED);
    expect(getVotingState(config(), NOW)).toBe(VOTING_STATE.OPEN);
  });

  it('un cierre forzado no se enseña como programada', () => {
    expect(getVotingState(config({ isOpen: false, opensAtMillis: NOW + HOUR }), NOW)).toBe(VOTING_STATE.CLOSED);
  });
});

describe('areResultsPublished', () => {
  it('no hay nada publicado sin un archivo al que apuntar', () => {
    expect(areResultsPublished(config())).toBe(false);
    expect(areResultsPublished(config({ lastPublishedId: '' }))).toBe(false);
    expect(areResultsPublished(null)).toBe(false);
  });

  it('se publican cuando hay archivo', () => {
    expect(areResultsPublished(config({ lastPublishedId: 'porra-2026' }))).toBe(true);
  });

  // Las ediciones creadas con el modelo de tres fechas conservan `resultsAt`; no puede resucitar como criterio.
  it('una fecha de resultados heredada no publica nada por sí sola', () => {
    expect(areResultsPublished(config({ resultsAtMillis: NOW - DAY }))).toBe(false);
  });
});

/**
 * OFRECER LOS RESULTADOS NO ES LO MISMO QUE TENERLOS. El fallo que esto fija: con la edición cerrada y aún sin
 * publicar, la pantalla ofrecía «ver los resultados» y llevaba a los de la edición ANTERIOR, que quien acababa
 * de votar leía como los suyos.
 */
describe('areResultsOffered', () => {
  const publicado = { lastPublishedId: 'porra-2025' };

  it('se ofrecen cuando hay archivo y ninguna edición en marcha', () => {
    expect(areResultsOffered(config(publicado), NOW)).toBe(true);
  });

  it('no se ofrecen mientras se vota', () => {
    expect(areResultsOffered(config({ ...publicado, closesAtMillis: NOW + DAY }), NOW)).toBe(false);
  });

  it('tampoco con la edición cerrada y sin publicar: lo archivado es de la anterior', () => {
    expect(areResultsOffered(config({ ...publicado, closesAtMillis: NOW - DAY }), NOW)).toBe(false);
    // Y el cierre a mano es el mismo caso: la fecha sigue puesta, la edición sigue ahí.
    expect(areResultsOffered(config({ ...publicado, isOpen: false, closesAtMillis: NOW + DAY }), NOW)).toBe(false);
  });

  it('sin archivo no hay nada que ofrecer', () => {
    expect(areResultsOffered(config(), NOW)).toBe(false);
  });
});

describe('getSeasonStage', () => {
  it('sin fecha de cierre no hay edición en marcha', () => {
    expect(getSeasonStage(config(), NOW)).toBe(SEASON_STAGE.NONE);
  });

  it('con la votación en curso, abierta', () => {
    expect(getSeasonStage(config({ closesAtMillis: NOW + DAY }), NOW)).toBe(SEASON_STAGE.OPEN);
  });

  it('pasado el cierre, pendiente de publicar', () => {
    expect(getSeasonStage(config({ closesAtMillis: NOW - DAY }), NOW)).toBe(SEASON_STAGE.PENDING);
  });

  it('un cierre forzado también la deja pendiente', () => {
    expect(getSeasonStage(config({ closesAtMillis: NOW + DAY, isOpen: false }), NOW)).toBe(SEASON_STAGE.PENDING);
  });

  it('publicar devuelve el ciclo al principio', () => {
    // Archivar borra la fecha de cierre y apunta el archivo publicado.
    const publicada = config({ closesAtMillis: null, isOpen: false, lastPublishedId: 'porra-2026' });
    expect(getSeasonStage(publicada, NOW)).toBe(SEASON_STAGE.NONE);
  });
});

describe('daysUntil', () => {
  it('devuelve null sin fecha y nunca un número negativo', () => {
    expect(daysUntil(null, NOW)).toBeNull();
    expect(daysUntil(NOW - 5 * DAY, NOW)).toBe(0);
    expect(daysUntil(NOW + 7 * DAY, NOW)).toBe(7);
  });
});

describe('validateClosingDay', () => {
  const HOY = '2026-06-15';

  it('exige una fecha', () => {
    expect(validateClosingDay('', HOY)).toBe('errorClosingDayRequired');
    expect(validateClosingDay(null, HOY)).toBe('errorClosingDayRequired');
  });

  // Una edición que nace cerrada no sirve de nada: aparecería directamente como «pendiente de publicar».
  it('rechaza un cierre en el pasado', () => {
    expect(validateClosingDay('2026-06-14', HOY)).toBe('errorClosingDayInThePast');
  });

  it('acepta hoy y cualquier día futuro', () => {
    expect(validateClosingDay(HOY, HOY)).toBeNull();
    expect(validateClosingDay('2026-12-31', HOY)).toBeNull();
  });
});
