import type { AssignmentStrategyId } from './strategies/assignment-strategy';

export type RotaType = 'AC' | 'AP';
export type DayType = 'weekday' | 'saturday' | 'holiday';
// Guardia: la plaza principal del día de cada grupo (AC o AP). Refuerzo: plaza adicional
// con su propio horario de refuerzo, cubierta por un AP o, si le faltan horas en el mes,
// por un AC.
export type ShiftRole = 'guardia' | 'refuerzo';

export interface DoctorInput {
  id: string;
  name: string;
  department: string;
}

export interface DoctorRef {
  doctorId: string;
  doctorName: string;
  // Sin papel explícito se trata como guardia.
  role?: ShiftRole;
  // Horario propio de la asignación cuando no coincide con el del día (refuerzo AC).
  durationHours?: number;
  shiftStart?: string;
  shiftEnd?: string;
}

export interface DayInfo {
  date: Date;
  dayType: DayType;
  // true si la fecha figura en el calendario de festivos, sea cual sea el día de la
  // semana. Un domingo normal tiene dayType 'holiday' pero publicHoliday falso.
  // Opcional: los días reconstruidos desde la base de datos no lo conocen (= falso).
  publicHoliday?: boolean;
  // Festivo especial de sanidad (24, 25 y 31 dic, 1 y 6 ene): siempre lleva dos refuerzos.
  specialHoliday?: boolean;
  durationHours: number;
  shiftStart: string;
  shiftEnd: string;
}

export interface DayAssignment extends DayInfo {
  doctors: DoctorRef[];
}

export interface DoctorStats {
  doctorId: string;
  doctorName: string;
  // guardiaHours + refuerzoHours === totalHours siempre.
  guardiaHours: number;
  refuerzoHours: number;
  totalHours: number;
  targetHours: number;
  hoursVsTarget: number;
  monthlyHours: Record<string, number>;
  shiftsWeekday: number;
  shiftsSaturday: number;
  shiftsSundayHoliday: number;
  shiftsRefuerzo: number;
}

export interface StatsResponse {
  doctors: DoctorStats[];
}

export interface RotaSchedule {
  year: number;
  rotaType: RotaType;
  strategy: AssignmentStrategyId;
  doctorsPerDay: number;
  /** Grupo en el orden (barajado) con que se generó el cuadrante */
  poolOrder: DoctorInput[];
  schedule: DayAssignment[];
  stats: StatsResponse;
  warnings: string[];
}
