import {
  PreviousAssignment,
  PreviousYearRota,
  buildWheelContinuation,
} from '../../src/scheduling/continuation';
import { classifyYear } from '../../src/holidays/holidays.service';
import { DoctorInput } from '../../src/scheduling/scheduling.types';

const doctor = (id: string, name = `Dr. ${id}`): DoctorInput => ({
  id,
  name,
  department: 'Medicina General',
});
const doctors = (...ids: string[]): DoctorInput[] => ids.map((id) => doctor(id));

// Diciembre de 2025: 24 (mié) y 25 (jue) festivos especiales, 26 (vie) laborable, 27 sábado,
// 28 domingo normal, 29 (lun) y 30 (mar) laborables, 31 (mié) festivo especial.
const previousDays = classifyYear(2025, new Set());

const guardia = (date: string, doctorId: string): PreviousAssignment => ({
  date,
  doctorId,
  role: 'guardia',
});
const refuerzo = (date: string, doctorId: string): PreviousAssignment => ({
  date,
  doctorId,
  role: 'refuerzo',
});
const previousRota = (order: DoctorInput[], assignments: PreviousAssignment[]): PreviousYearRota => ({
  poolOrder: order,
  assignments,
});

const build = (
  rotaType: Parameters<typeof buildWheelContinuation>[0],
  previous: PreviousYearRota,
  days: typeof previousDays,
  pool: DoctorInput[],
) => {
  const result = buildWheelContinuation(rotaType, previous, days, pool);
  if (!result) {
    throw new Error('se esperaba una continuación');
  }
  return result;
};

describe('buildWheelContinuation', () => {
  const order = doctors('A', 'B', 'C', 'D', 'E');

  it('singleGuardia apunta al siguiente a quien hizo la última guardia del año (31-12)', () => {
    const previous = previousRota(order, [
      guardia('2025-12-30', 'B'),
      guardia('2025-12-31', 'C'),
    ]);
    const result = build('AC', previous, previousDays, order);
    expect(result.singleGuardia).toBe(3);
  });

  it('asigna la última guardia a cada rueda según el tipo de día reclasificado', () => {
    const previous = previousRota(order, [
      guardia('2025-12-26', 'A'), // laborable
      guardia('2025-12-29', 'B'), // laborable (última de la rueda)
      guardia('2025-12-27', 'C'), // sábado
      guardia('2025-12-28', 'D'), // domingo normal
      guardia('2025-12-31', 'E'), // festivo especial (rueda de festivos)
    ]);
    const result = build('AC', previous, previousDays, order);
    expect(result.guardia).toEqual({ weekday: 2, saturday: 3, sunday: 4, holiday: 0 });
  });

  it('una rueda sin turnos queda sin puntero', () => {
    const previous = previousRota(order, [guardia('2025-12-29', 'A')]);
    const result = build('AC', previous, previousDays, order);
    expect(result.guardia).toEqual({ weekday: 1 });
    expect(result.refuerzo).toEqual({});
  });

  it('si el último médico se fue, apunta al siguiente superviviente', () => {
    const previous = previousRota(order, [guardia('2025-12-31', 'C')]);
    const current = doctors('A', 'B', 'D', 'E');
    expect(build('AC', previous, previousDays, current).singleGuardia).toBe(2);
  });

  it('si era el último del orden anterior y se fue, da la vuelta al primer superviviente', () => {
    const previous = previousRota(order, [guardia('2025-12-31', 'E')]);
    const current = [...doctors('A', 'B', 'C', 'D'), doctor('N1'), doctor('N2')];
    expect(build('AC', previous, previousDays, current).singleGuardia).toBe(0);
  });

  it('si el último médico sigue, apunta al siguiente en el orden actual, distinto del anterior', () => {
    const previous = previousRota(order, [guardia('2025-12-31', 'C')]);
    const current = doctors('E', 'D', 'C', 'B', 'A');
    expect(build('AC', previous, previousDays, current).singleGuardia).toBe(3);
  });

  it('si el último médico se fue, apunta al siguiente superviviente del orden anterior, en su posición actual', () => {
    const previous = previousRota(order, [guardia('2025-12-31', 'B')]);
    const current = doctors('E', 'D', 'A');
    expect(build('AC', previous, previousDays, current).singleGuardia).toBe(1);
  });

  it('si el último médico se fue y le seguían otros que también se fueron, salta hasta un superviviente', () => {
    const previous = previousRota(order, [guardia('2025-12-31', 'C')]);
    const current = doctors('B', 'A');
    expect(build('AC', previous, previousDays, current).singleGuardia).toBe(1);
  });

  it('sin médicos en común con el orden anterior no hay nada que continuar', () => {
    const previous = previousRota(order, [guardia('2025-12-31', 'C')]);
    expect(buildWheelContinuation('AC', previous, previousDays, doctors('X', 'Y'))).toBeUndefined();
  });

  it('si era el último superviviente y no hay nuevos, apunta a 0', () => {
    const previous = previousRota(order, [guardia('2025-12-31', 'E')]);
    expect(build('AC', previous, previousDays, order).singleGuardia).toBe(0);
  });

  it('si el último médico no estaba en el grupo del año anterior pero sí en el actual, apunta al siguiente', () => {
    const previous = previousRota(doctors('A', 'B', 'C'), [guardia('2025-12-31', 'N1')]);
    const current = [...doctors('A', 'B', 'C'), doctor('N1'), doctor('N2')];
    expect(build('AC', previous, previousDays, current).singleGuardia).toBe(4);
  });

  it('si el último médico no está en ningún grupo, la rueda queda sin puntero', () => {
    const previous = previousRota(order, [guardia('2025-12-31', 'Z')]);
    const result = build('AC', previous, previousDays, order);
    expect(result.singleGuardia).toBeUndefined();
    expect(result.guardia).toEqual({});
  });

  describe('refuerzos', () => {
    it('AP: la última fila de refuerzo de cada rueda; con dos el mismo día gana la última', () => {
      const previous = previousRota(order, [
        refuerzo('2025-12-29', 'A'),
        refuerzo('2025-12-27', 'B'),
        refuerzo('2025-12-31', 'C'),
        refuerzo('2025-12-31', 'D'),
        guardia('2025-12-31', 'E'),
      ]);
      const result = build('AP', previous, previousDays, order);
      expect(result.refuerzo).toEqual({ weekday: 1, saturday: 2, holiday: 4 });
      expect(result.singleGuardia).toBe(0);
    });

    it('AC: refuerzo queda vacío aunque haya filas de refuerzo', () => {
      const previous = previousRota(order, [refuerzo('2025-12-29', 'A'), guardia('2025-12-30', 'B')]);
      expect(build('AC', previous, previousDays, order).refuerzo).toEqual({});
    });
  });

  it('restingOnFirstDay son los médicos con filas el 31-12 (guardia o refuerzo)', () => {
    const previous = previousRota(order, [
      guardia('2025-12-30', 'A'),
      guardia('2025-12-31', 'B'),
      refuerzo('2025-12-31', 'D'),
    ]);
    const result = build('AP', previous, previousDays, order);
    expect([...result.restingOnFirstDay].sort()).toEqual(['B', 'D']);
  });
});
