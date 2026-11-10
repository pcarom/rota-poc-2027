import {
  SHIFTS_2027_FROM_YEAR,
  guardiaShiftDetails,
  refuerzoShiftDetails,
} from '../../src/scheduling/shifts';
import { fromIsoDate } from '../../src/common/date.utils';

describe('SHIFTS_2027_FROM_YEAR', () => {
  it('vale 2027', () => {
    expect(SHIFTS_2027_FROM_YEAR).toBe(2027);
  });
});

describe('guardiaShiftDetails (desde 2027)', () => {
  it('lunes a jueves laborable: 17h de 15:00 a 08:00+1', () => {
    expect(guardiaShiftDetails(fromIsoDate('2027-01-04'), 'weekday')).toEqual({
      durationHours: 17,
      shiftStart: '15:00',
      shiftEnd: '08:00+1',
    });
    expect(guardiaShiftDetails(fromIsoDate('2027-01-07'), 'weekday')).toEqual({
      durationHours: 17,
      shiftStart: '15:00',
      shiftEnd: '08:00+1',
    });
  });

  it('viernes laborable: 18h de 15:00 a 09:00+1', () => {
    expect(guardiaShiftDetails(fromIsoDate('2027-01-08'), 'weekday')).toEqual({
      durationHours: 18,
      shiftStart: '15:00',
      shiftEnd: '09:00+1',
    });
  });

  it('sábado: 24h de 09:00 a 09:00+1, sea festivo o no', () => {
    expect(guardiaShiftDetails(fromIsoDate('2027-01-09'), 'saturday')).toEqual({
      durationHours: 24,
      shiftStart: '09:00',
      shiftEnd: '09:00+1',
    });
    // 1 de mayo de 2027 cae en sábado y es festivo: manda el horario de sábado.
    expect(guardiaShiftDetails(fromIsoDate('2027-05-01'), 'holiday')).toEqual({
      durationHours: 24,
      shiftStart: '09:00',
      shiftEnd: '09:00+1',
    });
  });

  it('domingo o festivo entre semana: 23h de 09:00 a 08:00+1', () => {
    expect(guardiaShiftDetails(fromIsoDate('2027-01-10'), 'holiday')).toEqual({
      durationHours: 23,
      shiftStart: '09:00',
      shiftEnd: '08:00+1',
    });
    // Martes 12 de octubre de 2027, festivo entre semana.
    expect(guardiaShiftDetails(fromIsoDate('2027-10-12'), 'holiday')).toEqual({
      durationHours: 23,
      shiftStart: '09:00',
      shiftEnd: '08:00+1',
    });
  });
});

describe('guardiaShiftDetails (antes de 2027, sin cambios)', () => {
  it('viernes laborable sigue en 17h', () => {
    expect(guardiaShiftDetails(fromIsoDate('2026-01-02'), 'weekday')).toEqual({
      durationHours: 17,
      shiftStart: '15:00',
      shiftEnd: '08:00+1',
    });
  });

  it('sábado sigue en 18h', () => {
    expect(guardiaShiftDetails(fromIsoDate('2026-01-03'), 'saturday')).toEqual({
      durationHours: 18,
      shiftStart: '15:00',
      shiftEnd: '09:00+1',
    });
  });
});

describe('refuerzoShiftDetails (desde 2027)', () => {
  it('lunes a viernes laborable: 7h de 15:00 a 22:00', () => {
    expect(refuerzoShiftDetails(fromIsoDate('2027-01-08'), 'weekday')).toEqual({
      durationHours: 7,
      shiftStart: '15:00',
      shiftEnd: '22:00',
    });
  });

  it('sábado: 12h de 10:00 a 22:00, sea festivo o no', () => {
    expect(refuerzoShiftDetails(fromIsoDate('2027-01-09'), 'saturday')).toEqual({
      durationHours: 12,
      shiftStart: '10:00',
      shiftEnd: '22:00',
    });
    expect(refuerzoShiftDetails(fromIsoDate('2027-05-01'), 'holiday')).toEqual({
      durationHours: 12,
      shiftStart: '10:00',
      shiftEnd: '22:00',
    });
  });

  it('domingo o festivo entre semana: 12h de 10:00 a 22:00', () => {
    expect(refuerzoShiftDetails(fromIsoDate('2027-01-10'), 'holiday')).toEqual({
      durationHours: 12,
      shiftStart: '10:00',
      shiftEnd: '22:00',
    });
    expect(refuerzoShiftDetails(fromIsoDate('2027-10-12'), 'holiday')).toEqual({
      durationHours: 12,
      shiftStart: '10:00',
      shiftEnd: '22:00',
    });
  });
});

describe('refuerzoShiftDetails (antes de 2027, sin cambios)', () => {
  it('sábado sigue en 7h', () => {
    expect(refuerzoShiftDetails(fromIsoDate('2026-01-03'), 'saturday')).toEqual({
      durationHours: 7,
      shiftStart: '15:00',
      shiftEnd: '22:00',
    });
  });
});

