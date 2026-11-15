import {
  AC_POOL_4,
  AP_POOL_12,
  AP_POOL_17,
  HOLIDAYS_2026,
  YEAR_2026,
  seededRandom,
  toHolidaySet,
} from '../helpers/fixtures';

import { InfeasiblePoolError, generateRota, generateRotas } from '../../src/scheduling/assignment.service';
import { classifyYear } from '../../src/holidays/holidays.service';
import { DayInfo, DoctorInput } from '../../src/scheduling/scheduling.types';
import { addDays, toIsoDate } from '../../src/common/date.utils';
import {
  assignSingleWheel,
  staggeredInitialPointers,
  startsFullWorkWeek,
  wheelForDay,
} from '../../src/scheduling/single-wheel';

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

describe('Rueda de cada tipo de día', () => {
  it('wheelForDay: un festivo oficial va a la rueda de festivos aunque caiga en sábado o domingo', () => {
    const wheels = [
      '2026-01-05', // lunes
      '2026-01-10', // sábado
      '2026-01-11', // domingo
    ].map((iso) => wheelForDay(range(iso, 1)[0]));
    expect(wheels).toEqual(['weekday', 'saturday', 'sunday']);

    expect(wheelForDay(range('2026-01-06', 1, ['2026-01-06'])[0])).toBe('holiday'); // martes festivo
    expect(wheelForDay(range('2026-01-10', 1, ['2026-01-10'])[0])).toBe('holiday'); // sábado festivo
    expect(wheelForDay(range('2026-01-11', 1, ['2026-01-11'])[0])).toBe('holiday'); // domingo festivo
  });

  it('staggeredInitialPointers reparte los punteros: 0, ⌊N/4⌋, ⌊2N/4⌋, ⌊3N/4⌋', () => {
    expect(staggeredInitialPointers(4)).toEqual({ weekday: 0, saturday: 1, sunday: 2, holiday: 3 });
    expect(staggeredInitialPointers(17)).toEqual({ weekday: 0, saturday: 4, sunday: 8, holiday: 12 });
  });

  describe('startsFullWorkWeek', () => {
    it('cierto en el lunes de una semana de 5 laborables', () => {
      expect(startsFullWorkWeek(range('2026-01-12', 7), 0)).toBe(true);
    });

    it('falso si no es lunes', () => {
      expect(startsFullWorkWeek(range('2026-01-12', 7), 1)).toBe(false);
    });

    it('falso en una semana con un festivo entre semana', () => {
      // Miércoles 14 de enero festivo: la semana sólo tiene 4 laborables.
      expect(startsFullWorkWeek(range('2026-01-12', 7, ['2026-01-14']), 0)).toBe(false);
    });

    it('falso si la semana no está completa en el calendario (fin de año)', () => {
      // Lunes 28 a jueves 31 de diciembre: el viernes ya es del año siguiente.
      expect(startsFullWorkWeek(range('2026-12-28', 4), 0)).toBe(false);
    });
  });
});

describe('Rueda única de guardias', () => {
  it('sin refuerzos, las guardias recorren una sola rueda todos los días, sea cual sea su tipo', () => {
    // 21 dic 2026 (lunes) → 10 ene 2027: laborables, sábados, domingos, festivos especiales
    // (24, 25 y 31 dic, 1 y 6 ene) y un festivo oficial entre semana (29 dic, forzado).
    const days = range('2026-12-21', 21, ['2026-12-29'], ['2026-12-24', '2026-12-25', '2026-12-31', '2027-01-01', '2027-01-06']);
    const pool = poolOf(5);

    const result = ids(
      assignSingleWheel({ pool, days, requiredByDay: days.map(() => 1) }),
    );

    expect(result).toEqual(days.map((_, i) => [pool[i % pool.length].id]));
  });

  it('no aplica la corrección de la resonancia semanal a la rueda de guardias (5 médicos)', () => {
    // El lunes de una semana completa no salta un puesto: esa corrección es sólo de la rueda de refuerzos.
    const days = range('2026-02-02', 28);
    const pool = poolOf(5);

    const result = ids(
      assignSingleWheel({ pool, days, requiredByDay: days.map(() => 1) }),
    );

    expect(result).toEqual(days.map((_, i) => [pool[i % 5].id]));
  });

  it('los refuerzos siguen las ruedas por tipo de día, escalonadas y desplazadas ⌊N/2⌋', () => {
    // Con 8 médicos las ruedas de refuerzo arrancan en: laborables 4, sábados 6, domingos 0,
    // festivos 2. Cada día se prueba suelto (nadie arrastra descanso) y la guardia es M0.
    const pool = poolOf(8);
    const refuerzoOf = (iso: string): string[] =>
      ids(assignSingleWheel({ pool, days: range(iso, 1), requiredByDay: [2], refuerzosByDay: [1] }))[0];

    expect(refuerzoOf('2026-01-12')).toEqual(['M0', 'M4']); // lunes
    expect(refuerzoOf('2026-01-10')).toEqual(['M0', 'M6']); // sábado
    // Domingo: a la rueda de domingos le toca M0, que ya hace la guardia: se salta y sale M1.
    expect(refuerzoOf('2026-01-11')).toEqual(['M0', 'M1']);
  });

  it('el refuerzo del día anterior hace saltar la guardia, que conserva su turno', () => {
    // 4 médicos. Domingo 11 ene: guardia M0 (rueda única desde 0) y refuerzo M1 (rueda de
    // domingos desde (2 + ⌊4/2⌋) % 4 = M0, que ya hace la guardia: se salta y sale M1). Lunes: a la rueda única le toca M1, que no ha
    // descansado: se salta con deuda y la guardia es M2; el refuerzo (laborables desde M2)
    // salta a M2, ya elegido, y es M3. Martes: la deuda de M1 se cobra primero.
    const pool = poolOf(4);
    const days = range('2026-01-11', 3);
    const result = ids(assignSingleWheel({ pool, days, requiredByDay: [2, 2, 2], refuerzosByDay: [1, 1, 1] }));

    expect(result).toEqual([
      ['M0', 'M1'],
      ['M2', 'M3'],
      ['M1', 'M0'],
    ]);
  });

  it('deuda contada: un mismo médico acumula dos deudas en la rueda y la cola FIFO las cobra antes que el puntero', () => {
    // 5 médicos, una guardia y un refuerzo al día; festivos el 13, el 15 y el 18 de enero.
    // Sólo se sigue la rueda de refuerzos de laborables (arranca en M2). Con 5 médicos, el lunes
    // 19 ene (semana completa) el puntero de esa rueda salta un puesto sin deuda (resonancia semanal).
    //  - 12 ene: refuerzo M2.
    //  - 14 ene: toca M3, que ayer hizo el refuerzo festivo: se salta (deuda M3) y sale M4.
    //  - 16 ene: toca M0, que ayer hizo el refuerzo festivo: deuda M0 (cola [M3, M0]); M3 también
    //    trabajó ayer y no puede cobrar; sale M1.
    //  - 19 ene: M3 hace la guardia, así que no cobra; se cobra la deuda de M0 antes que el puntero.
    //  - 20 ene: toca M3, que trabajó ayer: segunda deuda de M3 (cola [M3, M3]); sale M4.
    //  - 21 ene: M3 ya descansó y se le cobra UNA deuda (cola [M3]), antes que el puntero (M0, que hace la guardia).
    //  - 22 ene: toca M0, que ayer hizo la guardia: deuda M0 (cola [M3, M0]); sale M1.
    //  - 23 ene: M3 cobra la segunda deuda, cuando con el puntero (M2, que hace la guardia) no le habría tocado.
    const pool = poolOf(5);
    const days = range('2026-01-12', 12, ['2026-01-13', '2026-01-15', '2026-01-18']);
    const result = ids(assignSingleWheel({ pool, days, requiredByDay: days.map(() => 2), refuerzosByDay: days.map(() => 1) }));

    expect(result).toEqual([
      ['M0', 'M2'], // 12 ene
      ['M1', 'M3'], // 13 ene
      ['M2', 'M4'], // 14 ene
      ['M3', 'M0'], // 15 ene
      ['M4', 'M1'], // 16 ene
      ['M0', 'M3'], // 17 ene
      ['M1', 'M2'], // 18 ene
      ['M3', 'M0'], // 19 ene
      ['M2', 'M4'], // 20 ene
      ['M0', 'M3'], // 21 ene
      ['M4', 'M1'], // 22 ene
      ['M2', 'M3'], // 23 ene
    ]);
  });

  describe('corrección de la resonancia con grupos múltiplos de 7', () => {
    // Guardia del día i con la corrección: la rueda avanza un puesto sin deuda cada N días.
    const rotated = (i: number, n: number) => `M${((i % n) + Math.floor(i / n)) % n}`;
    const guardias = (n: number, count: number, options?: { breakLapResonance?: boolean }) => {
      const days = range('2026-02-02', count);
      return ids(assignSingleWheel({ pool: poolOf(n), days, requiredByDay: days.map(() => 1) }, options)).map(
        ([id]) => id,
      );
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
  });

  describe('integrado en generateRotas (2026)', () => {
    const dayClassifications = classifyYear(YEAR_2026, toHolidaySet(HOLIDAYS_2026));

    it('la guardia AC recorre el grupo barajado en una sola rueda todo el año', () => {
      const { ac } = generateRotas(
        YEAR_2026,
        AC_POOL_4,
        AP_POOL_17,
        dayClassifications,
        undefined,
        seededRandom(5),
      );

      const guardias = ac.schedule.map(
        (day) => day.doctors.find((doctor) => doctor.role === 'guardia')!.doctorId,
      );
      const order = ac.poolOrder.map((doctor) => doctor.id);
      expect(guardias).toEqual(guardias.map((_, i) => order[i % order.length]));
    });

    it('la guardia AP reparte el año con diferencia máxima de 1 entre médicos y respeta el descanso', () => {
      const { ap } = generateRotas(
        YEAR_2026,
        AC_POOL_4,
        AP_POOL_17,
        dayClassifications,
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

describe('Corrección de la resonancia semanal con 5 médicos (rueda de refuerzos de laborables)', () => {
  const five = poolOf(5);
  // De lunes a sábado: cada día una guardia y un refuerzo.
  const days = range('2026-01-12', 70).filter((d) => d.date.getUTCDay() !== 0);
  const refuerzosDeLosViernes = (options?: { breakWeeklyResonance?: boolean }) => {
    const assigned = assignSingleWheel(
      { pool: five, days, requiredByDay: days.map(() => 2), refuerzosByDay: days.map(() => 1) },
      options,
    );
    return days.flatMap((d, i) => (d.date.getUTCDay() === 5 ? [assigned[i][1].id] : []));
  };

  it('con la corrección, el refuerzo de los viernes rota entre varios médicos', () => {
    expect(new Set(refuerzosDeLosViernes()).size).toBeGreaterThanOrEqual(3);
  });

  it('sin la corrección, el refuerzo de los viernes rota entre menos médicos', () => {
    const sin = new Set(refuerzosDeLosViernes({ breakWeeklyResonance: false })).size;
    expect(sin).toBeLessThan(new Set(refuerzosDeLosViernes()).size);
  });

  it.each([4, 17])('con %i médicos el cuadrante es idéntico con o sin la corrección', (n) => {
    const yearDays = classifyYear(YEAR_2026, toHolidaySet(HOLIDAYS_2026));
    const input = {
      pool: poolOf(n),
      days: yearDays,
      requiredByDay: yearDays.map(() => 2),
      refuerzosByDay: yearDays.map(() => 1),
    };
    expect(assignSingleWheel(input)).toEqual(assignSingleWheel(input, { breakWeeklyResonance: false }));
  });
});

describe('Refuerzos y descanso en la rueda única', () => {
  it('el segundo refuerzo toma los dos siguientes de la rueda de festivos', () => {
    // 6 médicos: la rueda de refuerzos de festivos arranca en (⌊3·6/4⌋ + ⌊6/2⌋) % 6 = 1.
    const result = ids(
      assignSingleWheel({
        pool: poolOf(6),
        days: range('2026-01-06', 1, ['2026-01-06']),
        requiredByDay: [3],
        refuerzosByDay: [2],
      }),
    );
    expect(result).toEqual([['M0', 'M1', 'M2']]);
  });

  it('descanso blando: completa con no descansados en orden de rueda y sin generar deudas', () => {
    const days = range('2026-01-05', 3);
    // Día 2: sólo M2 descansado; se completa con M0 (siguiente de la rueda).
    // Día 3: sin deudas pendientes, la rueda continúa tras el último tomado.
    const result = ids(assignSingleWheel({ pool: poolOf(3), days, requiredByDay: [2, 2, 1] }));
    expect(result[0]).toEqual(['M0', 'M1']);
    expect(result[1]).toEqual(['M2', 'M0']);
    expect(result[2]).toEqual(['M1']);
  });

  it('lanza InfeasiblePoolError con el mensaje de siempre si no hay médicos distintos suficientes', () => {
    const run = () =>
      assignSingleWheel({ pool: poolOf(3), days: range('2026-01-05', 1), requiredByDay: [4] });
    expect(run).toThrow(InfeasiblePoolError);
    expect(run).toThrow('No hay suficientes médicos elegibles el 2026-01-05. El grupo es demasiado pequeño.');
  });
});

describe('Rueda única integrada en generateRota', () => {
  const classifications = classifyYear(YEAR_2026, toHolidaySet(HOLIDAYS_2026));

  it('mantiene estadísticas, avisos y descanso con un grupo AP', () => {
    const rota = generateRota(YEAR_2026, 'AP', AP_POOL_12, classifications);

    expect(rota.schedule).toHaveLength(365);
    expect(rota.stats.doctors).toHaveLength(AP_POOL_12.length);
    expect(Array.isArray(rota.warnings)).toBe(true);

    for (let i = 1; i < rota.schedule.length; i += 1) {
      const previous = new Set(rota.schedule[i - 1].doctors.map((d) => d.doctorId));
      for (const doctor of rota.schedule[i].doctors) {
        expect(previous.has(doctor.doctorId)).toBe(false);
      }
    }
  });

  it('funciona con el grupo AC mínimo', () => {
    const rota = generateRota(YEAR_2026, 'AC', AC_POOL_4, classifications);
    expect(rota.schedule.every((d) => d.doctors.length === 1)).toBe(true);
  });
});

describe('Rueda única con continuación del año anterior', () => {
  const base = { refuerzo: {}, restingOnFirstDay: [] as string[] };

  it('la rueda de guardias arranca en guardia', () => {
    const days = range('2026-01-02', 4);
    const pool = poolOf(5);
    const result = ids(
      assignSingleWheel({
        pool,
        days,
        requiredByDay: days.map(() => 1),
        continuation: { ...base, guardia: 3 },
      }),
    );
    expect(result).toEqual([['M3'], ['M4'], ['M0'], ['M1']]);
  });

  it('quien trabajó el día anterior al primer día no sale el primer día', () => {
    const days = range('2026-01-02', 2);
    const pool = poolOf(5);
    const result = ids(
      assignSingleWheel({
        pool,
        days,
        requiredByDay: days.map(() => 1),
        continuation: { ...base, guardia: 3, restingOnFirstDay: ['M3'] },
      }),
    );
    expect(result[0]).toEqual(['M4']);
  });

  it('las ruedas de refuerzo sin puntero continuado usan su arranque por defecto', () => {
    // Sábado con 4 médicos: guardia M0 y refuerzo en la rueda de sábados, por defecto
    // ⌊4/4⌋ + ⌊4/2⌋ = 3. Sólo hay puntero continuado para la de laborables.
    const result = ids(
      assignSingleWheel({
        pool: poolOf(4),
        days: range('2026-01-03', 1),
        requiredByDay: [2],
        refuerzosByDay: [1],
        continuation: { ...base, refuerzo: { weekday: 2 } },
      }),
    );
    expect(result).toEqual([['M0', 'M3']]);
  });

  it('el puntero de refuerzo continuado se usa sin el desplazamiento ⌊N/2⌋', () => {
    const input = { pool: poolOf(4), days: range('2026-01-02', 1), requiredByDay: [2], refuerzosByDay: [1] };

    expect(ids(assignSingleWheel({ ...input, continuation: { ...base, refuerzo: { weekday: 1 } } }))).toEqual([
      ['M0', 'M1'], // sin desplazar: el puntero 1 es M1
    ]);
    expect(ids(assignSingleWheel(input))).toEqual([['M0', 'M2']]); // por defecto: 0 + ⌊4/2⌋ = 2
  });
});
