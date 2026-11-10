import type { AssignmentStrategyId } from '../scheduling/strategies/assignment-strategy';

export enum RotaType {
  AC = 'AC',
  AP = 'AP',
}

export type DayType = 'weekday' | 'saturday' | 'holiday';

export interface DoctorIn {
  id: string;
  name: string;
  department: string;
}

export type ShiftRole = 'guardia' | 'refuerzo';

export interface DoctorRef {
  doctor_id: string;
  doctor_name: string;
  role: ShiftRole;
}

export interface DayInfo {
  date: string;
  day_type: DayType;
  duration_hours: number;
  shift_start: string;
  shift_end: string;
}

export interface DayAssignment {
  date: string;
  day_type: DayType;
  shift_start: string;
  shift_end: string;
  duration_hours: number;
  doctors: DoctorRef[];
}

export interface DoctorStats {
  doctor_id: string;
  doctor_name: string;
  // guardia_hours + refuerzo_hours === total_hours siempre.
  guardia_hours: number;
  refuerzo_hours: number;
  total_hours: number;
  target_hours: number;
  hours_vs_target: number;
  monthly_hours: Record<string, number>;
  shifts_weekday: number;
  shifts_saturday: number;
  shifts_sunday_holiday: number;
  shifts_refuerzo: number;
}

export interface StatsResponse {
  doctors: DoctorStats[];
}

export interface RotaSchedule {
  year: number;
  rota_type: RotaType;
  doctors_per_day: number;
  schedule: DayAssignment[];
  stats: StatsResponse;
  warnings: string[];
}

export interface RotaResponse {
  team_id: number;
  year: number;
  city: string;
  rota_type: RotaType;
  doctors_per_day: number;
  // 'balanced': método retirado que pueden conservar los cuadrantes antiguos.
  strategy: AssignmentStrategyId | 'balanced';
  generated_at: Date;
  /** Ids de los médicos del grupo en el orden (barajado) con que se generó el cuadrante */
  doctor_order: string[];
  schedule: DayAssignment[];
  stats: StatsResponse;
  warnings: string[];
}

export interface HolidayItem {
  date: string;
  name: string;
  special?: boolean;
}

export interface HolidaysResponse {
  year: number;
  city: string;
  holidays: HolidayItem[];
}
