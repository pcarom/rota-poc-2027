import { toIsoDate } from '../common/date.utils';
import { DayInfo, DoctorInput, RotaType, ShiftRole } from './scheduling.types';
import { WheelId, wheelForDay } from './strategies/wheels.strategy';

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
  /** Arranque de cada rueda de guardias (estrategia `wheels`). */
  guardia: Partial<Record<WheelId, number>>;
  /** Arranque de la rueda única de guardias (`single-wheel`). */
  singleGuardia?: number;
  /** Arranque de cada rueda de refuerzos (sólo AP; vacío en AC). */
  refuerzo: Partial<Record<WheelId, number>>;
  /** Médicos que trabajaron el día anterior al primer día: no salen ese día. */
  restingOnFirstDay: string[];
}

/**
 * Puntero (posición en el grupo actual, en el orden de la petición) que sigue al último
 * médico de una rueda en el año anterior: el siguiente a él si sigue en el grupo; si se
 * fue, el siguiente superviviente tras él en el orden de entonces (circular). `undefined`
 * si no estaba ni está: esa rueda arranca por defecto.
 */
function nextPointer(
  lastDoctorId: string,
  previousOrder: DoctorInput[],
  positionById: ReadonlyMap<string, number>,
): number | undefined {
  const current = positionById.get(lastDoctorId);
  if (current !== undefined) {
    return (current + 1) % positionById.size;
  }

  const previousPosition = previousOrder.findIndex((doctor) => doctor.id === lastDoctorId);
  if (previousPosition < 0) {
    return undefined;
  }
  for (let step = 1; step < previousOrder.length; step += 1) {
    const candidate = previousOrder[(previousPosition + step) % previousOrder.length];
    const position = positionById.get(candidate.id);
    if (position !== undefined) {
      return position;
    }
  }
  return undefined;
}

/**
 * Calcula desde dónde arranca cada rueda al continuar el cuadrante del año anterior:
 * el médico siguiente al último que hizo un turno de esa rueda. Los días se
 * reclasifican con `previousDays` (las filas guardadas no saben qué día era festivo
 * oficial). `previous.assignments` debe venir ordenada por fecha y, dentro del día, por id.
 * `undefined` si ningún médico del orden anterior sigue en `pool` (nada que continuar).
 */
export function buildWheelContinuation(
  rotaType: RotaType,
  previous: PreviousYearRota,
  previousDays: DayInfo[],
  pool: DoctorInput[],
): WheelContinuation | undefined {
  const positionById = new Map(pool.map((doctor, index) => [doctor.id, index]));
  if (!previous.poolOrder.some((doctor) => positionById.has(doctor.id))) {
    return undefined;
  }

  const wheelByDate = new Map(previousDays.map((day) => [toIsoDate(day.date), wheelForDay(day)]));
  const lastDate = previousDays.length > 0 ? toIsoDate(previousDays[previousDays.length - 1].date) : '';

  let lastSingleGuardia: string | undefined;
  const lastGuardiaByWheel = new Map<WheelId, string>();
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
      lastSingleGuardia = assignment.doctorId;
      lastGuardiaByWheel.set(wheel, assignment.doctorId);
    } else if (rotaType === 'AP') {
      lastRefuerzoByWheel.set(wheel, assignment.doctorId);
    }
  }

  const next = (doctorId: string) => nextPointer(doctorId, previous.poolOrder, positionById);
  const pointersOf = (lastByWheel: Map<WheelId, string>): Partial<Record<WheelId, number>> => {
    const pointers: Partial<Record<WheelId, number>> = {};
    for (const [wheel, doctorId] of lastByWheel) {
      const pointer = next(doctorId);
      if (pointer !== undefined) {
        pointers[wheel] = pointer;
      }
    }
    return pointers;
  };

  return {
    guardia: pointersOf(lastGuardiaByWheel),
    singleGuardia: lastSingleGuardia === undefined ? undefined : next(lastSingleGuardia),
    refuerzo: pointersOf(lastRefuerzoByWheel),
    restingOnFirstDay: [...restingOnFirstDay],
  };
}
