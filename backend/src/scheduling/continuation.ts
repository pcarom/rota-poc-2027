import { toIsoDate } from '../common/date.utils';
import { DayInfo, DoctorInput, RotaType, ShiftRole } from './scheduling.types';
import { WheelId, wheelForDay } from './single-wheel';

/** Turno persistido de un cuadrante anterior, en el orden de `rota_assignments` (fecha, id). */
export interface PreviousAssignment {
  date: string; // AAAA-MM-DD
  doctorId: string;
  role: ShiftRole;
}

/** Cuadrante del año anterior del mismo tipo y equipo. */
export interface PreviousYearRota {
  poolOrder: DoctorInput[];
  assignments: PreviousAssignment[]; // ordenadas por fecha y, dentro del día, por id
}

/** Lo necesario para continuar los cuadrantes del año anterior. */
export interface PreviousYear {
  days: DayInfo[]; // classifyYear(Y-1, festivos de Y-1)
  ac?: PreviousYearRota;
  ap?: PreviousYearRota;
}

/** Punto de partida de las ruedas que continúa el año anterior. */
export interface WheelContinuation {
  /** Arranque de la rueda única de guardias. */
  guardia?: number;
  /** Arranque de cada rueda de refuerzos (sólo AP; vacío en AC). */
  refuerzo: Partial<Record<WheelId, number>>;
  /** Médicos que trabajaron el día anterior al primer día: no salen ese día. */
  restingOnFirstDay: string[];
}

/**
 * Orden del grupo actual continuando el del año anterior: los que siguen, en el orden
 * de entonces, y después los nuevos en el orden de la petición. Usa los objetos del
 * grupo actual. `null` si no queda ningún superviviente (no hay nada que continuar).
 */
export function continuePoolOrder(
  previousOrder: DoctorInput[],
  pool: DoctorInput[],
): DoctorInput[] | null {
  const currentById = new Map(pool.map((doctor) => [doctor.id, doctor]));
  const survivors = previousOrder.flatMap((doctor) => currentById.get(doctor.id) ?? []);
  if (survivors.length === 0) {
    return null;
  }

  const survivorIds = new Set(survivors.map((doctor) => doctor.id));
  return [...survivors, ...pool.filter((doctor) => !survivorIds.has(doctor.id))];
}

/**
 * Puntero que sigue al último médico de una rueda en el año anterior. Si ese médico
 * estaba en el grupo de entonces, cuenta los supervivientes hasta su posición (el
 * siguiente si sigue; el siguiente superviviente si se fue; el primer nuevo, o el 0, si
 * era el último). Si no estaba pero está ahora, el siguiente a él.
 */
function nextPointer(
  lastDoctorId: string,
  previousOrder: DoctorInput[],
  orderedPool: DoctorInput[],
): number | undefined {
  const size = orderedPool.length;
  const currentIds = new Set(orderedPool.map((doctor) => doctor.id));
  const previousPosition = previousOrder.findIndex((doctor) => doctor.id === lastDoctorId);

  if (previousPosition >= 0) {
    const survivorsUpToLast = previousOrder
      .slice(0, previousPosition + 1)
      .filter((doctor) => currentIds.has(doctor.id)).length;
    return survivorsUpToLast % size;
  }

  const currentPosition = orderedPool.findIndex((doctor) => doctor.id === lastDoctorId);
  return currentPosition >= 0 ? (currentPosition + 1) % size : undefined;
}

/**
 * Calcula desde dónde arranca cada rueda al continuar el cuadrante del año anterior:
 * el médico siguiente al último que hizo un turno de esa rueda. Los días se
 * reclasifican con `previousDays` (las filas guardadas no saben qué día era festivo
 * oficial). `previous.assignments` debe venir ordenada por fecha y, dentro del día, por id.
 */
export function buildWheelContinuation(
  rotaType: RotaType,
  previous: PreviousYearRota,
  previousDays: DayInfo[],
  orderedPool: DoctorInput[],
): WheelContinuation {
  const wheelByDate = new Map(previousDays.map((day) => [toIsoDate(day.date), wheelForDay(day)]));
  const lastDate = previousDays.length > 0 ? toIsoDate(previousDays[previousDays.length - 1].date) : '';

  let lastGuardia: string | undefined;
  const lastRefuerzoByWheel = new Map<WheelId, string>();
  const restingOnFirstDay = new Set<string>();

  for (const assignment of previous.assignments) {
    const wheel = wheelByDate.get(assignment.date);
    if (assignment.date === lastDate) {
      restingOnFirstDay.add(assignment.doctorId);
    }
    if (wheel === undefined) {
      continue;
    }
    if (assignment.role === 'guardia') {
      lastGuardia = assignment.doctorId;
    } else if (rotaType === 'AP') {
      lastRefuerzoByWheel.set(wheel, assignment.doctorId);
    }
  }

  const next = (doctorId: string) => nextPointer(doctorId, previous.poolOrder, orderedPool);
  const refuerzo: Partial<Record<WheelId, number>> = {};
  for (const [wheel, doctorId] of lastRefuerzoByWheel) {
    const pointer = next(doctorId);
    if (pointer !== undefined) {
      refuerzo[wheel] = pointer;
    }
  }

  return {
    guardia: lastGuardia === undefined ? undefined : next(lastGuardia),
    refuerzo,
    restingOnFirstDay: [...restingOnFirstDay],
  };
}
