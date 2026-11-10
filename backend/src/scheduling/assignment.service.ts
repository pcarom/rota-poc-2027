import { addDays, compareIsoDates, getIsoWeekday, toIsoDate } from '../common/date.utils';
import { isSanidadSpecialHoliday } from '../common/sanidad-holidays';
import {
  PreviousYear,
  PreviousYearRota,
  buildWheelContinuation,
  continuePoolOrder,
} from './continuation';
import { InfeasiblePoolError } from './errors';
import { SATURDAY_WEEKDAY, refuerzoShiftDetails, usesShifts2027 } from './shifts';
import { RandomSource, shuffle } from './shuffle';
import { calculateStats } from './stats.service';
import {
  AssignmentStrategyId,
  DEFAULT_ASSIGNMENT_STRATEGY,
  getAssignmentStrategy,
} from './strategies';
import {
  DayAssignment,
  DayInfo,
  DoctorInput,
  RotaSchedule,
  RotaType,
  ShiftRole,
} from './scheduling.types';

export const AC_MIN_HOURS_YEAR = 1620;
export const AC_MIN_HOURS_MONTH = 135;
export const AP_MAX_HOURS_YEAR = 425;

export { InfeasiblePoolError };

const SUNDAY_ISO_WEEKDAY = 6;

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * Refuerzos del día: 2 en un festivo especial de sanidad, en cualquier sábado desde
 * 2027 (sea festivo o no) o en un festivo cuyo día anterior también es festivo; si no,
 * 1. Sin `previousDay` (1 de enero cuando no se conoce el 31 de diciembre anterior) el
 * día anterior es festivo si cae en domingo o es un festivo especial.
 */
export function refuerzosForDay(day: DayInfo, previousDay?: DayInfo): number {
  if (day.specialHoliday) {
    return 2;
  }
  if (usesShifts2027(day.date) && day.date.getUTCDay() === SATURDAY_WEEKDAY) {
    return 2;
  }
  if (day.dayType !== 'holiday') {
    return 1;
  }
  const previousDate = addDays(toIsoDate(day.date), -1);
  const previousIsHoliday = previousDay
    ? previousDay.dayType === 'holiday'
    : getIsoWeekday(previousDate) === SUNDAY_ISO_WEEKDAY || isSanidadSpecialHoliday(previousDate);

  return previousIsHoliday ? 2 : 1;
}

export function computeDoctorsPerDay(
  rotaType: RotaType,
  poolSize: number,
  totalYearlyHours: number,
  targetHours?: Record<string, number>,
): number {
  const minTotalHours = targetHours
    ? Object.values(targetHours).reduce((sum, value) => sum + value, 0)
    : poolSize * (rotaType === 'AC' ? AC_MIN_HOURS_YEAR : AP_MAX_HOURS_YEAR);

  return Math.ceil(minTotalHours / totalYearlyHours);
}

export function buildTargetHours(
  rotaType: RotaType,
  pool: DoctorInput[],
): Record<string, number> {
  return Object.fromEntries(
    pool.map((doctor) => [
      doctor.id,
      rotaType === 'AC' ? AC_MIN_HOURS_YEAR : AP_MAX_HOURS_YEAR,
    ]),
  );
}

interface AssignedRota {
  year: number;
  rotaType: RotaType;
  pool: DoctorInput[];
  /** Grupo en el orden (barajado o continuado) con que se asignó */
  poolOrder: DoctorInput[];
  strategy: AssignmentStrategyId;
  schedule: DayAssignment[];
  /** Médicos que trabajaron el 31 de diciembre anterior (continuidad); vacío sin ella */
  restingOnFirstDay: string[];
}

/**
 * Asigna las plazas de un grupo: AC cubre la guardia AC del día; AP cubre la guardia
 * AP y los refuerzos que no estén ya reservados para un AC (`reservedRefuerzosByDay`).
 * Con `previous` (cuadrante del año anterior del mismo tipo) el grupo conserva su orden
 * y las ruedas continúan; sin él, o sin ningún médico en común, se baraja con `random`.
 */
function assignRota(
  year: number,
  rotaType: RotaType,
  pool: DoctorInput[],
  dayClassifications: DayInfo[],
  dayBeforeYear: DayInfo | undefined,
  strategyId: AssignmentStrategyId,
  reservedRefuerzosByDay: number[] = [],
  random?: RandomSource,
  previous?: PreviousYearRota,
  previousDays: DayInfo[] = [],
): AssignedRota {
  if (pool.length < 1) {
    throw new InfeasiblePoolError(`El grupo debe tener al menos 1 médico (tiene ${pool.length}).`);
  }

  const refuerzosByDay = dayClassifications.map((day, index) =>
    rotaType === 'AP'
      ? Math.max(
          0,
          refuerzosForDay(day, dayClassifications[index - 1] ?? dayBeforeYear) -
            (reservedRefuerzosByDay[index] ?? 0),
        )
      : 0,
  );
  const requiredByDay = refuerzosByDay.map((refuerzos) => 1 + refuerzos);

  const peakDoctorsPerDay = Math.max(...requiredByDay);
  const minPool = peakDoctorsPerDay * 2;
  if (pool.length < minPool) {
    throw new InfeasiblePoolError(
      `El grupo de ${pool.length} médicos es demasiado pequeño para ${rotaType}. Se necesitan al menos ${minPool} médicos (${peakDoctorsPerDay} por día × 2 por la rotación del día de descanso).`,
    );
  }

  // La estrategia recibe el grupo en el orden del año anterior si lo continúa; si no,
  // barajado para que el primer médico de la rotación no sea siempre el mismo. `pool`
  // conserva el orden original (estadísticas, persistencia).
  const continuedPool = previous ? continuePoolOrder(previous.poolOrder, pool) : null;
  const orderedPool = continuedPool ?? (random ? shuffle(pool, random) : pool);
  const continuation =
    previous && continuedPool
      ? buildWheelContinuation(rotaType, previous, previousDays, continuedPool)
      : undefined;
  const assigned = getAssignmentStrategy(strategyId).assign({
    pool: orderedPool,
    days: dayClassifications,
    requiredByDay,
    refuerzosByDay,
    continuation,
  });
  const schedule: DayAssignment[] = dayClassifications.map((dayInfo, index) => {
    const guardias = requiredByDay[index] - refuerzosByDay[index];
    return {
      ...dayInfo,
      doctors: assigned[index].map((doctor, position) => {
        const role: ShiftRole = position < guardias ? 'guardia' : 'refuerzo';
        // El refuerzo siempre lleva su propio horario: la guardia del día y el refuerzo
        // nunca comparten horario (p. ej. sábado desde 2027, 24h de guardia pero 12h de
        // refuerzo), así que sin este horario propio el refuerzo heredaría el de la
        // guardia del día.
        const refuerzoShift =
          role === 'refuerzo' ? refuerzoShiftDetails(dayInfo.date, dayInfo.dayType) : undefined;
        return {
          doctorId: doctor.id,
          doctorName: doctor.name,
          role,
          ...refuerzoShift,
        };
      }),
    };
  });

  return {
    year,
    rotaType,
    pool,
    poolOrder: orderedPool,
    strategy: strategyId,
    schedule,
    restingOnFirstDay: continuation?.restingOnFirstDay ?? [],
  };
}

/**
 * Completa las horas mensuales de cada AC con refuerzos. Si un AC no llega a 135h en
 * un mes, hace refuerzos (horario de refuerzo) el día anterior a alguna de sus
 * guardias de ese mes, tantos como hagan falta, mientras quede hueco: el día anterior
 * debe estar en el mismo mes, no ser su día de descanso ni tener ya cubiertos todos
 * los refuerzos.
 * Devuelve los refuerzos AC reservados por día y los avisos de los meses que no se
 * han podido completar.
 */
function planAcRefuerzos(
  acRota: AssignedRota,
  dayClassifications: DayInfo[],
  dayBeforeYear: DayInfo | undefined,
): { reservedByDay: number[]; warnings: string[] } {
  const { schedule, pool, restingOnFirstDay } = acRota;
  const indexByDate = new Map(schedule.map((day, index) => [toIsoDate(day.date), index]));
  const capacity = dayClassifications.map((day, index) =>
    refuerzosForDay(day, dayClassifications[index - 1] ?? dayBeforeYear),
  );
  const reservedByDay = schedule.map(() => 0);
  const hasDoctor = (index: number | undefined, doctorId: string): boolean =>
    index !== undefined && schedule[index].doctors.some((doctor) => doctor.doctorId === doctorId);
  const shortfalls: string[] = [];

  for (let month = 0; month < 12; month += 1) {
    const monthDays = schedule
      .map((day, index) => ({ day, index }))
      .filter(({ day }) => day.date.getUTCMonth() === month);
    if (monthDays.length === 0) {
      continue;
    }
    const hoursOf = (doctorId: string): number =>
      monthDays.reduce(
        (sum, { day }) =>
          sum +
          day.doctors
            .filter((doctor) => doctor.doctorId === doctorId)
            .reduce((total, doctor) => total + (doctor.durationHours ?? day.durationHours), 0),
        0,
      );

    // Primero quien más horas necesita.
    const deficits = pool
      .map((doctor) => ({ doctor, missing: AC_MIN_HOURS_MONTH - hoursOf(doctor.id) }))
      .filter(({ missing }) => missing > 0)
      .sort((left, right) => right.missing - left.missing);

    for (const { doctor } of deficits) {
      let missing = AC_MIN_HOURS_MONTH - hoursOf(doctor.id);
      const guardiaDays = monthDays.filter(({ day }) =>
        day.doctors.some((ref) => ref.doctorId === doctor.id && ref.role !== 'refuerzo'),
      );

      for (const { day } of guardiaDays) {
        if (missing <= 0) {
          break;
        }
        const refuerzoDate = addDays(toIsoDate(day.date), -1);
        const refuerzoIndex = indexByDate.get(refuerzoDate);
        if (
          refuerzoIndex === undefined ||
          schedule[refuerzoIndex].date.getUTCMonth() !== month ||
          // Quien trabajó el 31 de diciembre anterior descansa el 1 de enero.
          (refuerzoIndex === 0 && restingOnFirstDay.includes(doctor.id)) ||
          hasDoctor(refuerzoIndex, doctor.id) ||
          hasDoctor(indexByDate.get(addDays(refuerzoDate, -1)), doctor.id) ||
          reservedByDay[refuerzoIndex] >= capacity[refuerzoIndex]
        ) {
          continue;
        }

        const refuerzoDay = schedule[refuerzoIndex];
        const shift = refuerzoShiftDetails(refuerzoDay.date, refuerzoDay.dayType);
        refuerzoDay.doctors.push({
          doctorId: doctor.id,
          doctorName: doctor.name,
          role: 'refuerzo',
          ...shift,
        });
        reservedByDay[refuerzoIndex] += 1;
        missing -= shift.durationHours;
      }

      if (missing > 0) {
        shortfalls.push(`${doctor.name} (${MONTH_NAMES[month]}, faltan ${missing}h)`);
      }
    }
  }

  const warnings =
    shortfalls.length > 0
      ? [
          `No hay hueco para más refuerzos y algunos médicos AC quedan por debajo de ${AC_MIN_HOURS_MONTH}h en el mes: ${shortfalls.join('; ')}.`,
        ]
      : [];

  return { reservedByDay, warnings };
}

/** Estadísticas y avisos de límites anuales de un cuadrante ya asignado. */
function finalizeRota(rota: AssignedRota, extraWarnings: string[] = []): RotaSchedule {
  const { year, rotaType, pool, schedule } = rota;
  const targetHours = buildTargetHours(rotaType, pool);
  const stats = calculateStats(schedule, pool, targetHours);
  const totalCapacityHours = schedule.reduce(
    (sum, day) =>
      sum +
      day.doctors.reduce((total, doctor) => total + (doctor.durationHours ?? day.durationHours), 0),
    0,
  );
  const totalTargetHours = Object.values(targetHours).reduce((sum, value) => sum + value, 0);

  // Los límites de horas no bloquean la generación: el cuadrante se devuelve con un
  // único aviso agregado y la desviación de cada médico queda en las estadísticas.
  // AC tiene un mínimo (1.620h) y AP un máximo (425h).
  const warnings: string[] = [];
  if (rotaType === 'AC') {
    const shortfalls = stats
      .map((doctor) => doctor.targetHours - doctor.totalHours)
      .filter((shortfall) => shortfall > 0);
    if (shortfalls.length > 0) {
      const missingHours = shortfalls.reduce((sum, value) => sum + value, 0);
      const cause =
        totalCapacityHours < totalTargetHours
          ? `El grupo de ${pool.length} médicos es demasiado grande para ${rotaType}: el objetivo de ${totalTargetHours}h supera la capacidad anual de cobertura de ${totalCapacityHours}h. `
          : '';
      const below =
        shortfalls.length === 1
          ? '1 médico queda'
          : `${shortfalls.length} médicos quedan`;
      warnings.push(
        `${cause}${below} por debajo del mínimo de ${AC_MIN_HOURS_YEAR}h; faltan ${missingHours}h en total.`,
      );
    }
  } else {
    const excesses = stats
      .map((doctor) => doctor.totalHours - doctor.targetHours)
      .filter((excess) => excess > 0);
    if (excesses.length > 0) {
      const excessHours = excesses.reduce((sum, value) => sum + value, 0);
      const minDoctors = Math.ceil(totalCapacityHours / AP_MAX_HOURS_YEAR);
      const cause =
        totalCapacityHours > totalTargetHours
          ? `El grupo de ${pool.length} médicos es demasiado pequeño para ${rotaType}: la cobertura anual de ${totalCapacityHours}h supera el máximo de ${AP_MAX_HOURS_YEAR}h por médico (se necesitan al menos ${minDoctors} médicos). `
          : '';
      const above =
        excesses.length === 1
          ? '1 médico queda'
          : `${excesses.length} médicos quedan`;
      warnings.push(
        `${cause}${above} por encima del máximo de ${AP_MAX_HOURS_YEAR}h; sobran ${excessHours}h en total.`,
      );
    }
  }
  warnings.push(...extraWarnings);

  return {
    year,
    rotaType,
    strategy: rota.strategy,
    doctorsPerDay: 1,
    poolOrder: rota.poolOrder,
    schedule: [...schedule].sort((left, right) =>
      compareIsoDates(toIsoDate(left.date), toIsoDate(right.date)),
    ),
    stats: { doctors: stats },
    warnings,
  };
}

/**
 * Genera un único cuadrante sin interacción con el otro grupo: AC sólo con su guardia
 * diaria y AP con su guardia y todos los refuerzos. El producto usa `generateRotas`.
 * Con `random`, el grupo se baraja antes de asignar; sin él, el resultado es determinista.
 */
export function generateRota(
  year: number,
  rotaType: RotaType,
  pool: DoctorInput[],
  dayClassifications: DayInfo[],
  dayBeforeYear?: DayInfo,
  strategyId: AssignmentStrategyId | null = DEFAULT_ASSIGNMENT_STRATEGY,
  random?: RandomSource,
): RotaSchedule {
  return finalizeRota(
    assignRota(
      year,
      rotaType,
      pool,
      dayClassifications,
      dayBeforeYear,
      strategyId ?? DEFAULT_ASSIGNMENT_STRATEGY,
      [],
      random,
    ),
  );
}

/**
 * Genera los cuadrantes AC y AP del año de una sola vez. Cada día hay una guardia AC,
 * una guardia AP y uno o dos refuerzos (`refuerzosForDay`). Los refuerzos los cubre AP
 * salvo los que necesita un AC para llegar a sus horas mensuales (`planAcRefuerzos`),
 * que se reservan antes de asignar AP. Con `previousYear`, cada grupo que ya tenía
 * cuadrante del año anterior lo continúa (mismo orden, ruedas tras el último médico de
 * cada una, descanso el 1 de enero para quien trabajó el 31 de diciembre) y no se baraja.
 * Con `random`, el resto de grupos se baraja antes de asignar para no empezar siempre
 * por el mismo médico; sin él, el resultado es determinista.
 */
export function generateRotas(
  year: number,
  acPool: DoctorInput[],
  apPool: DoctorInput[],
  dayClassifications: DayInfo[],
  dayBeforeYear?: DayInfo,
  strategyId: AssignmentStrategyId | null = DEFAULT_ASSIGNMENT_STRATEGY,
  random?: RandomSource,
  previousYear?: PreviousYear,
): { ac: RotaSchedule; ap: RotaSchedule } {
  const strategy = strategyId ?? DEFAULT_ASSIGNMENT_STRATEGY;
  const acRota = assignRota(
    year,
    'AC',
    acPool,
    dayClassifications,
    dayBeforeYear,
    strategy,
    [],
    random,
    previousYear?.ac,
    previousYear?.days,
  );
  const { reservedByDay, warnings } = planAcRefuerzos(acRota, dayClassifications, dayBeforeYear);
  const apRota = assignRota(
    year,
    'AP',
    apPool,
    dayClassifications,
    dayBeforeYear,
    strategy,
    reservedByDay,
    random,
    previousYear?.ap,
    previousYear?.days,
  );

  return { ac: finalizeRota(acRota, warnings), ap: finalizeRota(apRota) };
}
