export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function fromIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function addDays(value: string, days: number): string {
  const date = fromIsoDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

export function getIsoMonth(value: string): number {
  return fromIsoDate(value).getUTCMonth() + 1;
}

export function getIsoWeekday(value: string): number {
  const day = fromIsoDate(value).getUTCDay();
  return day === 0 ? 6 : day - 1;
}

export function compareIsoDates(left: string, right: string): number {
  return left.localeCompare(right);
}

/** Día del año (1 = 1 de enero) de la fecha, dentro de su propio año. */
export function getDayOfYear(value: string): number {
  const date = fromIsoDate(value);
  const yearStart = fromIsoDate(`${date.getUTCFullYear()}-01-01`);
  return Math.round((date.getTime() - yearStart.getTime()) / 86400000) + 1;
}

/**
 * Número de semana (de lunes a domingo) dentro del año de la fecha: la semana 1 es la que
 * contiene el 1 de enero. No es la numeración ISO 8601, que puede asignar el 1 de enero a
 * la última semana del año anterior (p. ej. el 1 de enero de 2027 caería en la semana 53
 * de 2026 con esa numeración).
 */
export function getWeekNumber(value: string): number {
  const year = fromIsoDate(value).getUTCFullYear();
  const janFirstWeekday = getIsoWeekday(`${year}-01-01`);
  const dayIndex = getDayOfYear(value) - 1;
  return Math.floor((dayIndex + janFirstWeekday) / 7) + 1;
}

export interface WeekRange {
  week: number;
  from: string;
  to: string;
}

/**
 * Semanas del año (de lunes a domingo, semana 1 la que contiene el 1 de enero), recortadas
 * al año: la primera y la última pueden ser parciales.
 */
export function getYearWeeks(year: number): WeekRange[] {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const janFirstWeekday = getIsoWeekday(yearStart);
  const daysInYear = getDayOfYear(yearEnd);
  const totalWeeks = getWeekNumber(yearEnd);

  const weeks: WeekRange[] = [];
  for (let week = 1; week <= totalWeeks; week += 1) {
    const mondayIndex = 7 * (week - 1) - janFirstWeekday;
    const sundayIndex = mondayIndex + 6;
    weeks.push({
      week,
      from: mondayIndex < 0 ? yearStart : addDays(yearStart, mondayIndex),
      to: sundayIndex >= daysInYear ? yearEnd : addDays(yearStart, sundayIndex),
    });
  }
  return weeks;
}

export function stripNextDaySuffix(value: string): string {
  return value.replace(/\+1$/, '');
}

export function formatClockTime(value: string): string {
  return stripNextDaySuffix(value).slice(0, 5);
}

export function formatOvernightShiftEnd(value: string): string {
  return `${formatClockTime(value)}+1`;
}

export function formatShiftEnd(start: string, end: string): string {
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  if (endMinutes <= startMinutes) {
    return formatOvernightShiftEnd(end);
  }
  return formatClockTime(end);
}

function toMinutes(value: string): number {
  const [hours, minutes] = stripNextDaySuffix(value).slice(0, 5).split(':');
  return Number(hours) * 60 + Number(minutes);
}
