import { addDays, toIsoDate } from "../common/date.utils";
import type { WheelContinuation } from "./continuation";
import { InfeasiblePoolError } from "./errors";
import { DayInfo, DoctorInput } from "./scheduling.types";

const WORKDAYS_PER_WEEK = 5;
const DAYS_PER_WEEK = 7;

/** Método con el que se generan todos los cuadrantes; se persiste en `rotas.strategy`. */
export const ASSIGNMENT_METHOD = "single-wheel" as const;

export type WheelId = "weekday" | "saturday" | "sunday" | "holiday";

/**
 * Rueda a la que pertenece un día. Un festivo oficial va siempre a la rueda de
 * festivos aunque caiga en sábado o domingo; un domingo normal tiene la suya.
 */
export function wheelForDay(day: DayInfo): WheelId {
  if (day.publicHoliday) {
    return "holiday";
  }
  const weekday = day.date.getUTCDay();
  if (weekday === 0) {
    return "sunday";
  }
  return weekday === 6 ? "saturday" : "weekday";
}

export interface AssignmentInput {
  pool: DoctorInput[];
  // Días del año en orden cronológico, ya con las duraciones efectivas (AP incluido).
  days: DayInfo[];
  // Médicos requeridos por día (mismo índice que `days`), guardias y refuerzos juntos.
  requiredByDay: number[];
  // Cuántos de los requeridos de cada día son refuerzos (los últimos). Sin él, todos son guardias.
  refuerzosByDay?: number[];
  // Continuación del año anterior; sin ella las ruedas arrancan como siempre.
  continuation?: WheelContinuation;
}

/** Plazas de guardia y de refuerzo de un día. */
function splitSlots(
  input: AssignmentInput,
  dayIndex: number,
): { guardia: number; refuerzo: number } {
  const required = input.requiredByDay[dayIndex];
  const refuerzo = Math.min(input.refuerzosByDay?.[dayIndex] ?? 0, required);
  return { guardia: required - refuerzo, refuerzo };
}

interface Wheel {
  pointer: number;
  // Turnos debidos, en orden FIFO: cada salto añade una entrada, de modo que un mismo
  // médico puede aparecer varias veces (una por turno que se le ha saltado).
  pending: string[];
}

/**
 * Punteros iniciales escalonados: laborables 0, sábados ⌊N/4⌋, domingos ⌊2N/4⌋ y
 * festivos ⌊3N/4⌋ (N = tamaño del grupo).
 *
 * Si todas las ruedas arrancaran desde el primer médico, la cabeza de la lista
 * recibiría a la vez el primer turno de todas las ruedas y, a partir de ahí, el +1
 * de cada rueda coincidiría sobre los mismos médicos. Repartir los orígenes reparte
 * también esa carga (ver docs/STRATEGY_COMPARISON.md).
 */
export function staggeredInitialPointers(poolSize: number): Record<WheelId, number> {
  return {
    weekday: 0,
    saturday: Math.floor(poolSize / 4),
    sunday: Math.floor((2 * poolSize) / 4),
    holiday: Math.floor((3 * poolSize) / 4),
  };
}

/**
 * Asignación por rueda única: las guardias recorren el grupo en una sola rueda, en el
 * orden de la lista, todos los días del año sin distinguir laborable, sábado, domingo,
 * festivo ni festivo especial. Arranca en `continuation.guardia` o, sin cuadrante del año
 * anterior, en el primer médico.
 *
 * Los refuerzos tienen cuatro ruedas por tipo de día (laborables, sábados, domingos,
 * festivos) con punteros escalonados (`staggeredInitialPointers`) y desplazados ⌊N/2⌋
 * respecto al arranque de las guardias, para que la guardia y el refuerzo de un mismo día
 * no recaigan en médicos contiguos de la lista. Con cuadrante del año anterior, cada
 * rueda de refuerzos continúa tras el último médico que hizo un turno de ella y quien
 * trabajó el 31 de diciembre descansa el 1 de enero (`input.continuation`). Cada día se
 * cubren primero las guardias y después los refuerzos; un médico elegido para la guardia
 * no está disponible para el refuerzo de ese día. Si un día requiere varios médicos de
 * una rueda, se toman los siguientes.
 *
 * Choque con el día de descanso: «saltar y conservar turno». Un médico no está
 * descansado si hizo guardia el día anterior (en cualquier rueda) o ya ha sido
 * elegido ese mismo día. Si le toca en su rueda y no está descansado, se salta, el
 * puntero avanza sobre él y se anota una deuda en la cola de pendientes de esa rueda.
 * Cada salto genera una deuda, aunque el médico ya tuviera otras: la cola admite
 * repeticiones. Al llenar un día se consideran primero los pendientes (FIFO) y
 * después la rueda desde su puntero; elegir a alguien de la cola consume UNA deuda.
 * Un médico nunca sale dos veces el mismo día, aunque acumule varias deudas.
 *
 * Descanso blando: si en todo el grupo no hay suficientes descansados para cubrir el
 * día, se completa con no descansados siguiendo el orden de la rueda (pendientes
 * primero). Esos huecos no generan deuda nueva: no se ha saltado a nadie, se ha
 * incumplido el descanso porque no había alternativa. Esta rama es inalcanzable
 * desde `generateRota` (su tamaño mínimo de grupo, 2 × pico de cobertura, garantiza
 * siempre suficientes descansados) y sólo existe por robustez ante llamadas directas.
 * Lanza `InfeasiblePoolError` si algún día no tiene suficientes médicos distintos.
 *
 * `breakWeeklyResonance` (activada por defecto) aplica la corrección de la resonancia
 * semanal a la rueda de refuerzos de laborables; ver `startsFullWorkWeek`.
 *
 * `breakLapResonance` (activada por defecto) corrige la resonancia de la rueda única:
 * si el tamaño del grupo es múltiplo de 7, cada vuelta de la rueda dura un número exacto
 * de semanas y cada médico caería siempre el mismo día de la semana. Por eso, cada N
 * días (N = tamaño del grupo) la rueda de guardias avanza un puesto SIN apuntar deuda.
 * El saltado hace el último día de esa vuelta, así que nadie pierde guardias, y el día
 * de la semana de cada médico se desplaza uno en cada vuelta.
 */
export function assignSingleWheel(
  input: AssignmentInput,
  {
    breakWeeklyResonance = true,
    breakLapResonance = true,
  }: {
    breakWeeklyResonance?: boolean;
    breakLapResonance?: boolean;
  } = {},
): DoctorInput[][] {
  const { pool, days } = input;
  const size = pool.length;
  const doctorById = new Map(pool.map((doctor) => [doctor.id, doctor]));
  const { continuation } = input;
  const initialPointers = staggeredInitialPointers(size);
  // Un puntero continuado se usa tal cual; el desplazamiento sólo vale para el arranque por defecto.
  const buildRefuerzoWheels = (): Record<WheelId, Wheel> => {
    const start = (wheel: WheelId): number =>
      (continuation?.refuerzo[wheel] ?? initialPointers[wheel] + Math.floor(size / 2)) % size;
    return {
      weekday: { pointer: start("weekday"), pending: [] },
      saturday: { pointer: start("saturday"), pending: [] },
      sunday: { pointer: start("sunday"), pending: [] },
      holiday: { pointer: start("holiday"), pending: [] },
    };
  };
  // Rueda única: todas las guardias, sea cual sea el tipo de día, comparten esta rueda (puntero y deuda).
  const guardiaWheel: Wheel = { pointer: (continuation?.guardia ?? 0) % size, pending: [] };
  const refuerzoWheels = buildRefuerzoWheels();
  const lastAssigned = new Map<string, string>();
  // Quien trabajó el 31 de diciembre anterior descansa el primer día del año.
  if (days.length > 0) {
    const dayBeforeFirst = addDays(toIsoDate(days[0].date), -1);
    for (const doctorId of continuation?.restingOnFirstDay ?? []) {
      lastAssigned.set(doctorId, dayBeforeFirst);
    }
  }
  const result: DoctorInput[][] = [];

  for (const [dayIndex, day] of days.entries()) {
    // Corrección de la resonancia: con tantos médicos como laborables tiene la semana, la
    // rueda de refuerzos de laborables da una vuelta exacta cada semana y cada médico cae siempre el
    // mismo día (el del viernes no llega nunca al sábado). Como se hace a mano, el lunes
    // de cada semana de 5 laborables se salta un puesto SIN apuntar deuda: el saltado
    // hace el viernes, así que nadie pierde guardias y el día de cada uno va rotando.
    if (breakWeeklyResonance && size === WORKDAYS_PER_WEEK && startsFullWorkWeek(days, dayIndex)) {
      const wheel = refuerzoWheels.weekday;
      wheel.pointer = (wheel.pointer + 1) % size;
    }

    // Lo mismo para la rueda de guardias con grupos múltiplos de 7: cada N días gira un
    // puesto sin deuda, para que nadie quede fijo en el mismo día de la semana.
    if (breakLapResonance && size % DAYS_PER_WEEK === 0 && dayIndex > 0 && dayIndex % size === 0) {
      guardiaWheel.pointer = (guardiaWheel.pointer + 1) % size;
    }

    const currentDate = toIsoDate(day.date);
    const previousDate = addDays(currentDate, -1);
    const slots = splitSlots(input, dayIndex);
    const required = slots.guardia + slots.refuerzo;
    const isRested = (doctorId: string): boolean =>
      lastAssigned.get(doctorId) !== previousDate;

    if (size < required) {
      throw new InfeasiblePoolError(
        `No hay suficientes médicos elegibles el ${currentDate}. El grupo es demasiado pequeño.`,
      );
    }

    const chosen: string[] = [];
    const fill = (wheel: Wheel, count: number): void => {
      const target = chosen.length + count;
      const isFree = (doctorId: string): boolean =>
        isRested(doctorId) && !chosen.includes(doctorId);
      const freeCount = pool.filter((doctor) => isFree(doctor.id)).length;

      if (freeCount >= count) {
        // Primero la deuda de la rueda (FIFO): sólo quien esté descansado y aún no
        // elegido hoy; cada elección consume una única deuda (la más antigua suya).
        for (const doctorId of [...wheel.pending]) {
          if (chosen.length < target && isFree(doctorId)) {
            chosen.push(doctorId);
            wheel.pending.splice(wheel.pending.indexOf(doctorId), 1);
          }
        }
        // Después la rueda; quien no pueda salir hoy se salta y suma una deuda.
        for (let step = 0; chosen.length < target && step < size; step += 1) {
          const doctorId = pool[wheel.pointer].id;
          wheel.pointer = (wheel.pointer + 1) % size;
          if (isFree(doctorId)) {
            chosen.push(doctorId);
          } else {
            wheel.pending.push(doctorId);
          }
        }
        if (chosen.length < target) {
          throw new InfeasiblePoolError(
            `No hay suficientes médicos elegibles el ${currentDate}. El grupo es demasiado pequeño.`,
          );
        }
        return;
      }

      // Orden de rueda: pendientes primero y luego la rueda desde su puntero.
      // `offset` es la distancia al puntero (null si viene de la cola de pendientes).
      const candidates: { id: string; offset: number | null }[] = [
        ...wheel.pending.map((id) => ({ id, offset: null })),
        ...pool.map((_, offset) => ({
          id: pool[(wheel.pointer + offset) % size].id,
          offset,
        })),
      ];
      const seen = new Set<string>(chosen);
      const ordered = candidates.filter(
        (entry) => !seen.has(entry.id) && seen.add(entry.id),
      );
      const picks = [
        ...ordered.filter((entry) => isRested(entry.id)),
        ...ordered.filter((entry) => !isRested(entry.id)),
      ].slice(0, count);

      let furthest = -1;
      for (const pick of picks) {
        chosen.push(pick.id);
        if (pick.offset === null) {
          wheel.pending.splice(wheel.pending.indexOf(pick.id), 1);
        } else {
          furthest = Math.max(furthest, pick.offset);
        }
      }
      wheel.pointer = (wheel.pointer + furthest + 1) % size;
    };

    fill(guardiaWheel, slots.guardia);
    if (slots.refuerzo > 0) {
      fill(refuerzoWheels[wheelForDay(day)], slots.refuerzo);
    }

    for (const doctorId of chosen) {
      lastAssigned.set(doctorId, currentDate);
    }
    result.push(
      chosen.map((doctorId) => doctorById.get(doctorId) as DoctorInput),
    );
  }

  return result;
}

/**
 * Cierto si `days[index]` es un lunes y los cinco días siguientes del calendario (lunes a
 * viernes) son laborables que van a la rueda de laborables. Una semana con un festivo entre
 * semana ya descoloca la rueda por sí sola, y una semana partida (fin de año) no se toca.
 */
export function startsFullWorkWeek(days: DayInfo[], index: number): boolean {
  const monday = days[index];
  if (!monday || monday.date.getUTCDay() !== 1) {
    return false;
  }
  for (let offset = 0; offset < WORKDAYS_PER_WEEK; offset += 1) {
    const candidate = days[index + offset];
    if (
      !candidate ||
      toIsoDate(candidate.date) !== addDays(toIsoDate(monday.date), offset) ||
      wheelForDay(candidate) !== "weekday"
    ) {
      return false;
    }
  }
  return true;
}
