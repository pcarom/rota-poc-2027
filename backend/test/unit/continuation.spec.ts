import {
  PreviousAssignment,
  PreviousYearRota,
  buildWheelContinuation,
  continuePoolOrder,
} from '../../src/scheduling/continuation';
import { classifyYear } from '../../src/holidays/holidays.service';
import { DoctorInput } from '../../src/scheduling/scheduling.types';

const doctor = (id: string, name = `Dr. ${id}`): DoctorInput => ({
  id,
  name,
  department: 'Medicina General',
});
const doctors = (...ids: string[]): DoctorInput[] => ids.map((id) => doctor(id));
const ids = (pool: DoctorInput[] | null) => pool?.map((entry) => entry.id);

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

describe('continuePoolOrder', () => {
  const previousOrder = doctors('C', 'A', 'D', 'B');

  it('conserva el orden del año anterior de los médicos que siguen', () => {
    expect(ids(continuePoolOrder(previousOrder, doctors('A', 'B', 'C', 'D')))).toEqual(['C', 'A', 'D', 'B']);
  });

  it('quita a los que se fueron y añade al final a los nuevos en el orden de la petición', () => {
    const result = continuePoolOrder(previousOrder, doctors('Z', 'B', 'Y', 'C'));
    expect(ids(result)).toEqual(['C', 'B', 'Z', 'Y']);
  });

  it('usa los objetos del grupo actual (por si cambió el nombre)', () => {
    const renamed = doctor('A', 'Dr. Nuevo nombre');
    const result = continuePoolOrder(previousOrder, [renamed, doctor('C')]);
    expect(result?.[1]).toBe(renamed);
  });

  it('devuelve null si no queda ningún superviviente', () => {
    expect(continuePoolOrder(previousOrder, doctors('X', 'Y'))).toBeNull();
  });
});

describe('buildWheelContinuation', () => {
  const order = doctors('A', 'B', 'C', 'D', 'E');

  it('guardia apunta al siguiente a quien hizo la última guardia del año (31-12)', () => {
    const previous = previousRota(order, [
      guardia('2025-12-30', 'B'),
      guardia('2025-12-31', 'C'),
    ]);
    const result = buildWheelContinuation('AC', previous, previousDays, order);
    expect(result.guardia).toBe(3);
  });

  it('sin refuerzos, las ruedas de refuerzo quedan sin puntero', () => {
    const previous = previousRota(order, [guardia('2025-12-29', 'A')]);
    const result = buildWheelContinuation('AP', previous, previousDays, order);
    expect(result.guardia).toBe(1);
    expect(result.refuerzo).toEqual({});
  });

  it('si el último médico se fue, apunta al siguiente superviviente', () => {
    const previous = previousRota(order, [guardia('2025-12-31', 'C')]);
    const current = doctors('A', 'B', 'D', 'E');
    expect(buildWheelContinuation('AC', previous, previousDays, current).guardia).toBe(2);
  });

  it('si era el último superviviente, apunta al primer médico nuevo', () => {
    const previous = previousRota(order, [guardia('2025-12-31', 'E')]);
    const current = [...doctors('A', 'B', 'C', 'D'), doctor('N1'), doctor('N2')];
    expect(buildWheelContinuation('AC', previous, previousDays, current).guardia).toBe(4);
  });

  it('si era el último superviviente y no hay nuevos, apunta a 0', () => {
    const previous = previousRota(order, [guardia('2025-12-31', 'E')]);
    expect(buildWheelContinuation('AC', previous, previousDays, order).guardia).toBe(0);
  });

  it('si el último médico no estaba en el grupo del año anterior pero sí en el actual, apunta al siguiente', () => {
    const previous = previousRota(doctors('A', 'B', 'C'), [guardia('2025-12-31', 'N1')]);
    const current = [...doctors('A', 'B', 'C'), doctor('N1'), doctor('N2')];
    expect(buildWheelContinuation('AC', previous, previousDays, current).guardia).toBe(4);
  });

  it('si el último médico no está en ningún grupo, la rueda queda sin puntero', () => {
    const previous = previousRota(order, [guardia('2025-12-31', 'Z')]);
    const result = buildWheelContinuation('AC', previous, previousDays, order);
    expect(result.guardia).toBeUndefined();
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
      const result = buildWheelContinuation('AP', previous, previousDays, order);
      expect(result.refuerzo).toEqual({ weekday: 1, saturday: 2, holiday: 4 });
      expect(result.guardia).toBe(0);
    });

    it('AC: refuerzo queda vacío aunque haya filas de refuerzo', () => {
      const previous = previousRota(order, [refuerzo('2025-12-29', 'A'), guardia('2025-12-30', 'B')]);
      expect(buildWheelContinuation('AC', previous, previousDays, order).refuerzo).toEqual({});
    });
  });

  it('restingOnFirstDay son los médicos con filas el 31-12 (guardia o refuerzo)', () => {
    const previous = previousRota(order, [
      guardia('2025-12-30', 'A'),
      guardia('2025-12-31', 'B'),
      refuerzo('2025-12-31', 'D'),
    ]);
    const result = buildWheelContinuation('AP', previous, previousDays, order);
    expect([...result.restingOnFirstDay].sort()).toEqual(['B', 'D']);
  });
});
