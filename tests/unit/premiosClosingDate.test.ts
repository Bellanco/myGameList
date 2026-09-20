import { describe, expect, it } from 'vitest';
import {
  VOTING_TIME_ZONE,
  addDaysToDay,
  buildScheduleFields,
  endOfDayInVotingZone,
  startOfDayInVotingZone,
  toVotingZoneDay,
} from '../../src/core/premios/closingDate';

/** Hora de pared en la zona de la votación, para poder afirmar sobre ella y no sobre un epoch pelado. */
const madridWallClock = (millis: number | null) =>
  new Intl.DateTimeFormat('es-ES', {
    timeZone: VOTING_TIME_ZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(millis as number));

describe('endOfDayInVotingZone', () => {
  it('da las 23:59:59 de ese día en horario de invierno (UTC+1)', () => {
    const millis = endOfDayInVotingZone('2026-01-15');
    expect(madridWallClock(millis)).toBe('15/01/2026, 23:59:59');
    expect(new Date(millis as number).toISOString()).toBe('2026-01-15T22:59:59.999Z');
  });

  it('da las 23:59:59 de ese día en horario de verano (UTC+2)', () => {
    const millis = endOfDayInVotingZone('2026-07-15');
    expect(madridWallClock(millis)).toBe('15/07/2026, 23:59:59');
    expect(new Date(millis as number).toISOString()).toBe('2026-07-15T21:59:59.999Z');
  });

  // La razón de la segunda pasada del cálculo: en estos dos días el desfase de la medianoche no es el del día.
  it('acierta también los días de cambio de hora', () => {
    expect(madridWallClock(endOfDayInVotingZone('2026-03-29'))).toBe('29/03/2026, 23:59:59'); // 23 horas
    expect(madridWallClock(endOfDayInVotingZone('2026-10-25'))).toBe('25/10/2026, 23:59:59'); // 25 horas
  });

  it('no depende del huso del proceso', () => {
    // El resultado es un instante absoluto: no cambia aunque se administre desde otro país.
    expect(endOfDayInVotingZone('2026-12-01')).toBe(Date.parse('2026-12-01T22:59:59.999Z'));
  });

  it('devuelve null si el día no tiene formato válido', () => {
    expect(endOfDayInVotingZone('01/12/2026')).toBeNull();
    expect(endOfDayInVotingZone('')).toBeNull();
    expect(endOfDayInVotingZone(null)).toBeNull();
    expect(endOfDayInVotingZone(undefined)).toBeNull();
  });
});

describe('startOfDayInVotingZone', () => {
  it('da las 00:00 de ese día', () => {
    // En julio (UTC+2) la medianoche de Madrid son las 22:00 UTC del día anterior.
    expect(new Date(startOfDayInVotingZone('2026-07-15') as number).toISOString()).toBe(
      '2026-07-14T22:00:00.000Z',
    );
    expect(madridWallClock(startOfDayInVotingZone('2026-07-15'))).toBe('15/07/2026, 00:00:00');
  });

  it('acierta los días de cambio de hora', () => {
    expect(madridWallClock(startOfDayInVotingZone('2026-03-29'))).toBe('29/03/2026, 00:00:00');
    expect(madridWallClock(startOfDayInVotingZone('2026-10-25'))).toBe('25/10/2026, 00:00:00');
  });

  it('devuelve null si el día no vale', () => {
    expect(startOfDayInVotingZone('')).toBeNull();
  });
});

describe('toVotingZoneDay', () => {
  it('da el día en la zona de la votación, no en la del proceso', () => {
    // Las 22:59:59Z del 1 de diciembre son las 23:59:59 del 1 en Madrid: el campo de fecha del panel tiene que
    // enseñar el día 1, no el 2 ni el 30.
    expect(toVotingZoneDay('2026-12-01T22:59:59.999Z')).toBe('2026-12-01');
    expect(toVotingZoneDay('2026-07-14T22:00:00.000Z')).toBe('2026-07-15');
  });

  it('devuelve cadena vacía sin fecha válida', () => {
    expect(toVotingZoneDay(null)).toBe('');
    expect(toVotingZoneDay('no-es-una-fecha')).toBe('');
  });
});

describe('addDaysToDay', () => {
  it('suma días cruzando meses, años y cambios de hora', () => {
    expect(addDaysToDay('2026-06-15', 7)).toBe('2026-06-22');
    expect(addDaysToDay('2026-12-28', 7)).toBe('2027-01-04');
    expect(addDaysToDay('2026-10-24', 1)).toBe('2026-10-25'); // el día de 25 horas
    expect(addDaysToDay('2026-06-15', -1)).toBe('2026-06-14');
  });

  it('devuelve cadena vacía si el día de partida no vale', () => {
    expect(addDaysToDay('', 7)).toBe('');
  });
});

describe('buildScheduleFields', () => {
  it('empareja cada fecha con su epoch y usa el borde correcto del día', () => {
    const fields = buildScheduleFields({
      opensDay: '2026-12-01',
      closesDay: '2026-12-08',
      resultsDay: '2026-12-15',
    });

    // La apertura entra a las 00:00 y el cierre agota el día elegido.
    expect(fields.opensAt).toBe('2026-11-30T23:00:00.000Z');
    expect(fields.closesAt).toBe('2026-12-08T22:59:59.999Z');
    expect(fields.resultsAt).toBe('2026-12-15T22:59:59.999Z');

    expect(fields.opensAtMillis).toBe(Date.parse(fields.opensAt as string));
    expect(fields.closesAtMillis).toBe(Date.parse(fields.closesAt as string));
    expect(fields.resultsAtMillis).toBe(Date.parse(fields.resultsAt as string));
  });

  it('deja a null el par COMPLETO de la fecha que se quita', () => {
    // Nunca a medias: un epoch huérfano mantendría vigente en las reglas un plazo que el panel da por borrado.
    expect(buildScheduleFields({ closesDay: '2026-12-08' })).toEqual({
      opensAt: null,
      opensAtMillis: null,
      closesAt: '2026-12-08T22:59:59.999Z',
      closesAtMillis: Date.parse('2026-12-08T22:59:59.999Z'),
      resultsAt: null,
      resultsAtMillis: null,
    });
  });

  it('un calendario vacío deja los seis campos a null', () => {
    expect(buildScheduleFields({})).toEqual({
      opensAt: null,
      opensAtMillis: null,
      closesAt: null,
      closesAtMillis: null,
      resultsAt: null,
      resultsAtMillis: null,
    });
  });
});
