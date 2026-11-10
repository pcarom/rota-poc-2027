import { DayType } from './scheduling.types';

// A partir de este año rige el nuevo régimen de horarios: guardia única para AC
// y AP, y refuerzos con su propio horario de sábado. Antes de este año, sin cambios.
export const SHIFTS_2027_FROM_YEAR = 2027;

export const SATURDAY_WEEKDAY = 6;
const FRIDAY_WEEKDAY = 5;

export interface ShiftDetails {
  durationHours: number;
  shiftStart: string;
  shiftEnd: string;
}

/** true si la fecha cae en el régimen de horarios vigente desde SHIFTS_2027_FROM_YEAR. */
export function usesShifts2027(date: Date): boolean {
  return date.getUTCFullYear() >= SHIFTS_2027_FROM_YEAR;
}

const GUARDIA_17H: Readonly<ShiftDetails> = { durationHours: 17, shiftStart: '15:00', shiftEnd: '08:00+1' };
const GUARDIA_18H: Readonly<ShiftDetails> = { durationHours: 18, shiftStart: '15:00', shiftEnd: '09:00+1' };
const GUARDIA_23H: Readonly<ShiftDetails> = { durationHours: 23, shiftStart: '09:00', shiftEnd: '08:00+1' };
const GUARDIA_24H: Readonly<ShiftDetails> = { durationHours: 24, shiftStart: '09:00', shiftEnd: '09:00+1' };
const REFUERZO_7H: Readonly<ShiftDetails> = { durationHours: 7, shiftStart: '15:00', shiftEnd: '22:00' };
const REFUERZO_12H: Readonly<ShiftDetails> = { durationHours: 12, shiftStart: '10:00', shiftEnd: '22:00' };

/**
 * Horario de la guardia del día, común a AC y AP en todos los años (la guardia AP nunca
 * tuvo horario propio: siempre fue el mismo que la de AC). Antes de 2027 es el horario
 * histórico; desde 2027 el sábado tiene su propio horario de 24h sea festivo o no, el
 * viernes laborable pasa a 18h y el resto de laborables y el domingo/festivo no cambian
 * respecto a antes de 2027.
 */
export function guardiaShiftDetails(date: Date, dayType: DayType): ShiftDetails {
  if (!usesShifts2027(date)) {
    if (dayType === 'holiday') {
      return GUARDIA_23H;
    }
    if (dayType === 'saturday') {
      return GUARDIA_18H;
    }
    return GUARDIA_17H;
  }

  if (date.getUTCDay() === SATURDAY_WEEKDAY) {
    return GUARDIA_24H;
  }
  if (dayType === 'holiday') {
    return GUARDIA_23H;
  }
  if (date.getUTCDay() === FRIDAY_WEEKDAY) {
    return GUARDIA_18H;
  }
  return GUARDIA_17H;
}

/**
 * Horario del refuerzo, lo haga un médico AP o uno AC, en todos los años: antes de 2027,
 * 7h de lunes a sábado y 12h en festivo; desde 2027 el sábado se suma al festivo (12h) y
 * sólo el laborable de lunes a viernes queda en 7h. Nunca coincide con el horario de la
 * guardia del día (`guardiaShiftDetails`), ni antes ni desde 2027.
 */
export function refuerzoShiftDetails(date: Date, dayType: DayType): ShiftDetails {
  if (dayType === 'holiday' || (usesShifts2027(date) && date.getUTCDay() === SATURDAY_WEEKDAY)) {
    return REFUERZO_12H;
  }
  return REFUERZO_7H;
}
