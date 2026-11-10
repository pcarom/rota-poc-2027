import { RotaType } from './doctor.model';

/** Guardia: plaza principal del grupo. Refuerzo: plaza adicional con su propio horario de refuerzo, que nunca coincide con el de la guardia del día. */
export type ShiftRole = 'guardia' | 'refuerzo';

export interface DoctorRef {
  doctor_id: string;
  doctor_name: string;
  /** Ausente en respuestas antiguas: se trata como guardia */
  role?: ShiftRole;
}

/** Método de asignación de guardias */
export type AssignmentStrategy = 'wheels' | 'single-wheel';

/**
 * Método con el que se generó un cuadrante guardado. Además de los vigentes puede ser
 * 'balanced', el método equilibrado ya retirado, en cuadrantes antiguos.
 */
export type GeneratedStrategy = AssignmentStrategy | 'balanced';

export const DEFAULT_STRATEGY: AssignmentStrategy = 'single-wheel';

/** Opciones del desplegable de método de asignación */
export const STRATEGY_OPTIONS: { value: AssignmentStrategy; label: string }[] = [
  { value: 'single-wheel', label: 'Rueda única (predeterminado)' },
  { value: 'wheels', label: 'Ruedas (orden estricto)' },
];

/** Etiqueta corta para mostrar el método de un cuadrante ya generado */
export const STRATEGY_SHORT_LABELS: Record<GeneratedStrategy, string> = {
  wheels: 'Ruedas',
  'single-wheel': 'Rueda única',
  balanced: 'Equilibrado (retirado)',
};

export interface DayAssignment {
  date: string;
  day_type: 'weekday' | 'saturday' | 'holiday';
  shift_start: string;
  shift_end: string;
  duration_hours: number;
  doctors: DoctorRef[];
}

export interface DoctorStats {
  doctor_id: string;
  doctor_name: string;
  /** guardia_hours + refuerzo_hours === total_hours siempre */
  guardia_hours: number;
  refuerzo_hours: number;
  total_hours: number;
  target_hours?: number;
  hours_vs_target?: number;
  monthly_hours: Record<number, number>;
  shifts_weekday: number;
  shifts_saturday: number;
  shifts_sunday_holiday: number;
  shifts_refuerzo?: number;
}

export interface StatsResponse {
  doctors: DoctorStats[];
}

export interface RotaResponse {
  /** Equipo del cuadrante; los cuadrantes anteriores a los equipos son del principal */
  team_id?: number;
  year: number;
  city: string;
  rota_type: RotaType;
  doctors_per_day: number;
  generated_at: string;
  /** Ids del grupo en el orden (barajado) con que se generó; ausente en respuestas antiguas */
  doctor_order?: string[];
  schedule: DayAssignment[];
  stats: StatsResponse;
  warnings: string[];
  /** Ausente en cuadrantes antiguos: se asume 'balanced' */
  strategy?: GeneratedStrategy;
}

export interface GenerateRequest {
  year: number;
  ac_pool: { id: string; name: string; department: string }[];
  ap_pool: { id: string; name: string; department: string }[];
  strategy: AssignmentStrategy;
  /** Equipo del que son los cuadrantes */
  team_id: number;
}

export interface ReplaceRequest {
  date: string;
  old_doctor_id: string;
  new_doctor_id: string;
  /** Grupo del médico saliente si no es el del cuadrante: sólo para refuerzos */
  old_rota_type?: RotaType;
}

export interface AddDoctorRequest {
  date: string;
  doctor_id: string;
}

/** Merged day for the combined calendar view */
export interface MergedDayAssignment {
  date: string;
  day_type: 'weekday' | 'saturday' | 'holiday';
  shift_start: string;
  shift_end: string;
  duration_hours: number;
  /** Todos los médicos AC del día (guardia y, si los hay, refuerzos), con su papel */
  acDoctors: DoctorRef[];
  /** Todos los médicos AP del día (guardia y refuerzos), con su papel */
  apDoctors: DoctorRef[];
}
