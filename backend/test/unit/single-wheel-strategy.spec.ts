import { AC_POOL_4, AP_POOL_17, HOLIDAYS_2026, YEAR_2026, toHolidaySet } from '../helpers/fixtures';

import { generateRotas } from '../../src/scheduling/assignment.service';
import { classifyYear } from '../../src/holidays/holidays.service';
import { DayInfo, DoctorInput } from '../../src/scheduling/scheduling.types';
import { addDays, toIsoDate } from '../../src/common/date.utils';
import { singleWheelStrategy } from '../../src/scheduling/strategies/single-wheel.strategy';
import { assignWithWheels } from '../../src/scheduling/strategies/wheels.strategy';

function poolOf(size: number): DoctorInput[] {
  return Array.from({ length: size }, (_, i) => ({
    id: `M${i}`,
    name: `Dr. M${i}`,
    department: 'Medicina General',
  }));
}

// Días consecutivos desde `startIso`; `holidays` son festivos oficiales y `specials`, festivos especiales.
function range(startIso: string, count: number, holidays: string[] = [], specials: string[] = []): DayInfo[] {
  return Array.from({ length: count }, (_, i) => {
    const iso = addDays(startIso, i);
    const date = new Date(`${iso}T00:00:00.000Z`);
    const weekday = date.getUTCDay();
    const publicHoliday = holidays.includes(iso) || specials.includes(iso);
    return {
      date,
      dayType: publicHoliday || weekday === 0 ? 'holiday' : weekday === 6 ? 'saturday' : 'weekday',
      publicHoliday,
      specialHoliday: specials.includes(iso),
      durationHours: 10,
      shiftStart: '15:00',
      shiftEnd: '08:00+1',
    };
  });
}

const ids = (chosen: DoctorInput[][]) => chosen.map((day) => day.map((doctor) => doctor.id));

describe('Estrategia de rueda única (single-wheel)', () => {
  it('sin refuerzos, las guardias recorren una sola rueda todos los días, sea cual sea su tipo', () => {
    // 21 dic 2026 (lunes) → 10 ene 2027: laborables, sábados, domingos, festivos especiales
    // (24, 25 y 31 dic, 1 y 6 ene) y un festivo oficial entre semana (29 dic, forzado).
    const days = range('2026-12-21', 21, ['2026-12-29'], ['2026-12-24', '2026-12-25', '2026-12-31', '2027-01-01', '2027-01-06']);
    const pool = poolOf(5);

    const result = ids(
      singleWheelStrategy.assign({ pool, days, requiredByDay: days.map(() => 1) }),
    );

    expect(result).toEqual(days.map((_, i) => [pool[i % pool.length].id]));
  });

  it('no aplica la corrección de la resonancia semanal a la rueda única (5 médicos)', () => {
    // Con `wheels` el lunes de una semana completa salta un puesto; con la rueda única, no.
    const days = range('2026-02-02', 28);
    const pool = poolOf(5);

    const result = ids(
      singleWheelStrategy.assign({ pool, days, requiredByDay: days.map(() => 1) }),
    );

    expect(result).toEqual(days.map((_, i) => [pool[i % 5].id]));
  });

  it('los refuerzos siguen las ruedas por tipo de día, escalonadas y desplazadas ⌊N/2⌋', () => {
    // Con 8 médicos las ruedas de refuerzo arrancan en: laborables 4, sábados 6, domingos 0,
    // festivos 2. Cada día se prueba suelto (nadie arrastra descanso) y la guardia es M0.
    const pool = poolOf(8);
    const refuerzoOf = (iso: string): string[] =>
      ids(singleWheelStrategy.assign({ pool, days: range(iso, 1), requiredByDay: [2], refuerzosByDay: [1] }))[0];

    expect(refuerzoOf('2026-01-12')).toEqual(['M0', 'M4']); // lunes
    expect(refuerzoOf('2026-01-10')).toEqual(['M0', 'M6']); // sábado
    // Domingo: a la rueda de domingos le toca M0, que ya hace la guardia: se salta y sale M1.
    expect(refuerzoOf('2026-01-11')).toEqual(['M0', 'M1']);
  });

  it('el refuerzo del día anterior hace saltar la guardia, que conserva su turno', () => {
    // 4 médicos. Domingo 11 ene: guardia M0 (rueda única desde 0) y refuerzo M1 (rueda de
    // domingos desde (3 + ⌊4/2⌋) % 4). Lunes: a la rueda única le toca M1, que no ha
    // descansado: se salta con deuda y la guardia es M2; el refuerzo (laborables desde M2)
    // salta a M2, ya elegido, y es M3. Martes: la deuda de M1 se cobra primero.
    const pool = poolOf(4);
    const days = range('2026-01-11', 3);
    const result = ids(
      assignWithWheels(
        { pool, days, requiredByDay: [2, 2, 2], refuerzosByDay: [1, 1, 1] },
        { weekday: 0, sunday: 3 },
        { singleGuardiaWheel: true },
      ),
    );

    expect(result).toEqual([
      ['M0', 'M1'],
      ['M2', 'M3'],
      ['M1', 'M0'],
    ]);
  });

  describe('corrección de la resonancia con grupos múltiplos de 7', () => {
    // Guardia del día i con la corrección: la rueda avanza un puesto sin deuda cada N días.
    const rotated = (i: number, n: number) => `M${((i % n) + Math.floor(i / n)) % n}`;
    const guardias = (n: number, count: number, options?: { breakLapResonance?: boolean }) => {
      const days = range('2026-02-02', count);
      return ids(
        assignWithWheels({ pool: poolOf(n), days, requiredByDay: days.map(() => 1) }, { weekday: 0 }, {
          singleGuardiaWheel: true,
          ...options,
        }),
      ).map(([id]) => id);
    };

    it.each([7, 14, 21])('con %i médicos, cada N días la rueda gira un puesto sin deuda', (n) => {
      const result = guardias(n, 6 * n);
      expect(result).toEqual(result.map((_, i) => rotated(i, n)));
    });

    it.each([7, 14, 21])('con %i médicos, cada vuelta de N días todos hacen exactamente una guardia', (n) => {
      const result = guardias(n, 6 * n);
      for (let lap = 0; lap < 6; lap += 1) {
        expect(new Set(result.slice(lap * n, (lap + 1) * n)).size).toBe(n);
      }
    });

    it('con 7 médicos, nadie cae siempre el mismo día de la semana', () => {
      const result = guardias(7, 7 * 8);
      const weekdaysOf = (id: string) =>
        new Set(result.flatMap((doctor, i) => (doctor === id ? [i % 7] : [])));
      for (let doctor = 0; doctor < 7; doctor += 1) {
        expect(weekdaysOf(`M${doctor}`).size).toBeGreaterThan(1);
      }
    });

    it('sin la corrección, con 7 médicos cada uno cae siempre el mismo día', () => {
      const result = guardias(7, 7 * 8, { breakLapResonance: false });
      expect(result).toEqual(result.map((_, i) => `M${i % 7}`));
    });

    it.each([5, 8, 13])('con %i médicos (no múltiplo de 7) la rueda no gira', (n) => {
      const result = guardias(n, 6 * n);
      expect(result).toEqual(result.map((_, i) => `M${i % n}`));
    });

    it('no toca la estrategia de ruedas (wheels) con 7 médicos', () => {
      const days = range('2026-02-02', 49);
      const input = { pool: poolOf(7), days, requiredByDay: days.map(() => 1) };
      expect(ids(assignWithWheels(input, { weekday: 0 }))).toEqual(
        ids(assignWithWheels(input, { weekday: 0 }, { breakLapResonance: false })),
      );
    });
  });

  describe('integrado en generateRotas (2026)', () => {
    const dayClassifications = classifyYear(YEAR_2026, toHolidaySet(HOLIDAYS_2026));

    it('la guardia AC recorre el grupo en el orden recibido, en una sola rueda todo el año', () => {
      const { ac } = generateRotas(
        YEAR_2026,
        AC_POOL_4,
        AP_POOL_17,
        dayClassifications,
        undefined,
        'single-wheel',
      );

      const guardias = ac.schedule.map(
        (day) => day.doctors.find((doctor) => doctor.role === 'guardia')!.doctorId,
      );
      const order = AC_POOL_4.map((doctor) => doctor.id);
      expect(guardias).toEqual(guardias.map((_, i) => order[i % order.length]));
      expect(ac.strategy).toBe('single-wheel');
    });

    it('la guardia AP reparte el año con diferencia máxima de 1 entre médicos y respeta el descanso', () => {
      const { ap } = generateRotas(
        YEAR_2026,
        AC_POOL_4,
        AP_POOL_17,
        dayClassifications,
        undefined,
        'single-wheel',
      );

      const counts = new Map<string, number>();
      for (const day of ap.schedule) {
        for (const doctor of day.doctors.filter((ref) => ref.role === 'guardia')) {
          counts.set(doctor.doctorId, (counts.get(doctor.doctorId) ?? 0) + 1);
        }
      }
      const values = [...counts.values()];
      expect(counts.size).toBe(AP_POOL_17.length);
      expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);

      const byDate = new Map(ap.schedule.map((day) => [toIsoDate(day.date), day]));
      for (const day of ap.schedule) {
        const next = byDate.get(addDays(toIsoDate(day.date), 1));
        const today = new Set(day.doctors.map((doctor) => doctor.doctorId));
        expect(today.size).toBe(day.doctors.length);
        expect(next?.doctors.some((doctor) => today.has(doctor.doctorId)) ?? false).toBe(false);
      }
    });
  });
});

describe('Rueda única con continuación del año anterior', () => {
  const base = { guardia: {}, refuerzo: {}, restingOnFirstDay: [] as string[] };

  it('la rueda de guardias arranca en singleGuardia', () => {
    const days = range('2026-01-02', 4);
    const pool = poolOf(5);
    const result = ids(
      singleWheelStrategy.assign({
        pool,
        days,
        requiredByDay: days.map(() => 1),
        continuation: { ...base, singleGuardia: 3 },
      }),
    );
    expect(result).toEqual([['M3'], ['M4'], ['M0'], ['M1']]);
  });

  it('quien trabajó el día anterior al primer día no sale el primer día', () => {
    const days = range('2026-01-02', 2);
    const pool = poolOf(5);
    const result = ids(
      singleWheelStrategy.assign({
        pool,
        days,
        requiredByDay: days.map(() => 1),
        continuation: { ...base, singleGuardia: 3, restingOnFirstDay: ['M3'] },
      }),
    );
    expect(result[0]).toEqual(['M4']);
  });
});
